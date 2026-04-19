import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { db } from '../services/db.js'
import { createHash, randomBytes } from 'crypto'
import { wsManager } from '../services/websocket.js'

const step1Schema = z.object({
  businessName: z.string().min(1),
  industry: z.string().optional(),
  ownerName: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(6),
})

const step3Schema = z.object({
  tenantId: z.string(),
  channels: z.array(z.object({
    channelType: z.enum(['ZALO', 'TELEGRAM', 'LARK', 'EMAIL']),
    purpose: z.enum(['ALERT', 'DIGEST', 'BOTH']),
    label: z.string(),
    target: z.string(),
    minPriority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).default('HIGH'),
    schedule: z.string().optional(),
  })),
})

function slugify(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    + '-' + randomBytes(3).toString('hex')
}

function hashPassword(p: string) {
  return createHash('sha256').update(p).digest('hex')
}

// In-memory: các tenantId đã ping từ hook self-test. Auto-expire sau 10 phút.
const hookPings = new Map<string, number>()
setInterval(() => {
  const cutoff = Date.now() - 10 * 60 * 1000
  for (const [k, ts] of hookPings) if (ts < cutoff) hookPings.delete(k)
}, 60_000).unref?.()

export const setupRoutes: FastifyPluginAsync = async (app) => {
  // Step 1: Tạo tenant + owner account
  app.post('/tenant', async (req, reply) => {
    const body = step1Schema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

    const { businessName, industry, ownerName, email, password } = body.data
    const slug = slugify(businessName)

    const tenant = await db.tenant.create({
      data: {
        name: businessName,
        industry,
        slug,
        users: {
          create: {
            name: ownerName,
            email,
            passwordHash: hashPassword(password),
            role: 'OWNER',
          },
        },
      },
    })

    const webhookUrl = `${resolveBackendUrl(req)}/webhook/message`
    return { tenantId: tenant.id, slug, webhookUrl }
  })

  // Step 2: Trả về lệnh inject + script để copy vào terminal OpenClaw
  app.get('/inject-command', async (req, reply) => {
    const { tenantId } = req.query as { tenantId: string }
    if (!tenantId) return reply.status(400).send({ error: 'tenantId required' })

    const tenant = await db.tenant.findUnique({
      where: { id: tenantId },
      select: { webhookSecret: true },
    })
    if (!tenant) return reply.status(404).send({ error: 'Tenant not found' })

    const backendUrl = resolveBackendUrl(req)
    const webhookUrl = `${backendUrl}/webhook/message`

    return {
      webhookUrl,
      tenantId,
      // Chạy trực tiếp trên máy cài OpenClaw (host mode)
      oneLineCommand: `curl -fsSL "${backendUrl}/api/setup/inject.sh?tenantId=${tenantId}" | bash`,
      // OpenClaw chạy trong Docker — exec vào container openclaw
      dockerCommand: `docker exec openclaw bash -c 'curl -fsSL "${backendUrl}/api/setup/inject.sh?tenantId=${tenantId}" | bash'`,
      admin: {
        name: process.env.ADMIN_NAME ?? 'Support',
        zalo: process.env.ADMIN_ZALO ?? '',
        telegram: process.env.ADMIN_TELEGRAM ?? '',
        email: process.env.ADMIN_EMAIL ?? '',
      },
    }
  })

  // Serve inject script (OpenClaw hook installer)
  // Script tự chứa tenant-specific secret + URL, customer copy-paste hoặc chạy trực tiếp
  app.get('/inject.sh', async (req, reply) => {
    const tenantId = String((req.query as any).tenantId ?? (req.query as any).TENANT_ID ?? '').trim()
    if (!tenantId) {
      reply.header('Content-Type', 'text/plain')
      return reply.status(400).send('#!/bin/bash\necho "❌ tenantId query param required" >&2\nexit 1\n')
    }

    const tenant = await db.tenant.findUnique({
      where: { id: tenantId },
      select: { webhookSecret: true, active: true, name: true },
    })
    if (!tenant) {
      reply.header('Content-Type', 'text/plain')
      return reply.status(404).send('#!/bin/bash\necho "❌ Tenant not found" >&2\nexit 1\n')
    }
    if (!tenant.active) {
      reply.header('Content-Type', 'text/plain')
      return reply.status(403).send('#!/bin/bash\necho "❌ Tenant suspended" >&2\nexit 1\n')
    }

    const backendUrl = resolveBackendUrl(req)
    reply.header('Content-Type', 'text/plain')
    return generateOpenClawHookInstaller(backendUrl, tenant.webhookSecret, tenantId, tenant.name)
  })

  // Serve hook files for download (customer OpenClaw fetch khi install)
  app.get('/hook-files/:file', async (req, reply) => {
    const { file } = req.params as { file: string }
    const path = await import('path')
    const fs = await import('fs')
    const allowlist = new Set(['HOOK.md', 'handler.ts'])
    if (!allowlist.has(file)) return reply.status(404).send({ error: 'Not found' })

    // Thử nhiều vị trí có thể chứa plugin hook (dev / docker / prod)
    const candidates = [
      path.resolve(process.cwd(), '..', 'plugin', 'hooks', 'zalo-monitor', file),
      path.resolve(process.cwd(), 'plugin', 'hooks', 'zalo-monitor', file),
      path.resolve('/app', 'plugin', 'hooks', 'zalo-monitor', file),
      path.resolve(process.env.HOOK_DIR ?? '', file),
    ].filter(Boolean)

    const full = candidates.find((p) => fs.existsSync(p))
    if (!full) {
      req.log.error({ candidates }, 'Hook file not found on server')
      return reply.status(500).send({ error: `Hook file ${file} not found on server` })
    }
    reply.header('Content-Type', 'text/plain; charset=utf-8')
    return fs.readFileSync(full, 'utf-8')
  })

  // Hook self-test ping — inject.sh POST tới đây sau khi cài xong để xác nhận
  // secret + kết nối hoạt động. Ghi lastPingAt để connection-status phát hiện.
  app.post('/hook-test', async (req, reply) => {
    const tenantId = req.headers['x-tenant-id'] as string
    const secret = req.headers['x-webhook-secret'] as string
    if (!tenantId || !secret) return reply.status(400).send({ error: 'Missing headers' })

    const tenant = await db.tenant.findUnique({
      where: { id: tenantId },
      select: { webhookSecret: true, active: true },
    })
    if (!tenant) return reply.status(404).send({ error: 'Tenant not found' })
    if (!tenant.active) return reply.status(403).send({ error: 'Suspended' })
    if (secret !== tenant.webhookSecret) return reply.status(401).send({ error: 'Invalid secret' })

    hookPings.set(tenantId, Date.now())
    wsManager.broadcast('hook:connected', { tenantId, at: Date.now() })
    return reply.status(200).send({ ok: true })
  })

  // Step 2: SSE — dashboard poll để biết khi hook đã kết nối.
  // Detect 1 trong 2: (a) hook đã self-test ping (hookPings map) hoặc (b) đã có message đầu tiên.
  app.get('/connection-status', async (req, reply) => {
    const { tenantId } = req.query as { tenantId: string }

    reply.hijack()
    const raw = reply.raw
    raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    })

    const send = (payload: { connected: boolean; source?: 'hook-ping' | 'first-message' }) =>
      raw.write(`data: ${JSON.stringify(payload)}\n\n`)
    send({ connected: false })

    const interval = setInterval(async () => {
      if (hookPings.has(tenantId)) {
        send({ connected: true, source: 'hook-ping' })
        clearInterval(interval)
        raw.end()
        return
      }
      const group = await db.group.findFirst({ where: { tenantId } })
      if (group) {
        send({ connected: true, source: 'first-message' })
        clearInterval(interval)
        raw.end()
      }
    }, 2000)

    req.raw.on('close', () => clearInterval(interval))
  })

  // Step 3: Lưu notification channels
  app.post('/notifications', async (req, reply) => {
    const body = step3Schema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

    const { tenantId, channels } = body.data

    await db.notificationChannel.createMany({
      data: channels.map(ch => ({ ...ch, tenantId })),
    })

    return { ok: true }
  })

  // Step 4: Đánh dấu setup hoàn tất
  app.post('/complete', async (req, reply) => {
    const { tenantId } = req.body as { tenantId: string }
    await db.tenant.update({ where: { id: tenantId }, data: { setupDone: true } })
    wsManager.broadcast('setup:complete', { tenantId })
    return { ok: true }
  })

  // Test notification channel
  app.post('/test-notification', async (req, reply) => {
    const { channelType, target } = req.body as { channelType: string; target: string }
    // TODO: gọi notification service
    return { ok: true, message: `Test gửi tới ${channelType}: ${target}` }
  })
}

// Tự detect backend URL từ request Host header, fallback về PUBLIC_BACKEND_URL, cuối cùng là localhost
function resolveBackendUrl(req: any): string {
  if (process.env.PUBLIC_BACKEND_URL) return process.env.PUBLIC_BACKEND_URL.replace(/\/$/, '')
  const proto = (req.headers['x-forwarded-proto'] as string) ?? (req.protocol ?? 'http')
  const host = (req.headers['x-forwarded-host'] as string) ?? (req.headers['host'] as string)
  if (host) return `${proto}://${host}`
  return `http://localhost:${process.env.PORT ?? 3001}`
}

function generateOpenClawHookInstaller(backendUrl: string, secret: string, tenantId: string, tenantName: string) {
  // Escape single quotes cho an toàn khi nhúng vào bash literals
  const safeTenantName = tenantName.replace(/'/g, "'\\''")
  return `#!/bin/bash
# Zalo Monitor — OpenClaw Hook Installer
# Tenant: ${safeTenantName}
set -euo pipefail

TENANT_ID="${tenantId}"
BACKEND_URL="\${BACKEND_URL:-${backendUrl}}"
SECRET="${secret}"

echo "📦 Zalo Monitor Hook Installer"
echo "   Tenant:  ${safeTenantName}"
echo "   Backend: $BACKEND_URL"
echo ""

# 1. Kiểm tra phụ thuộc
for cmd in curl; do
  command -v "$cmd" >/dev/null 2>&1 || { echo "❌ Thiếu lệnh: $cmd"; exit 1; }
done

# 2. Tìm ~/.openclaw — thử nhiều vị trí
CANDIDATES=("$HOME/.openclaw" "/root/.openclaw" "/home/openclaw/.openclaw")
OPENCLAW_DIR=""
for dir in "\${CANDIDATES[@]}"; do
  if [ -d "$dir" ]; then OPENCLAW_DIR="$dir"; break; fi
done
if [ -z "$OPENCLAW_DIR" ]; then
  echo "❌ Không tìm thấy thư mục OpenClaw (.openclaw). OpenClaw đã cài chưa?"
  echo "   Override bằng: OPENCLAW_DIR=/path/to/.openclaw bash install.sh"
  OPENCLAW_DIR="\${OPENCLAW_DIR:-}"
fi
OPENCLAW_DIR="\${OPENCLAW_DIR:-$HOME/.openclaw}"
HOOK_DIR="$OPENCLAW_DIR/hooks/zalo-monitor"

echo "🏠 OpenClaw:   $OPENCLAW_DIR"
echo "🔗 Hook path:  $HOOK_DIR"
mkdir -p "$HOOK_DIR"

# 3. Download hook files
echo "⬇️  Downloading hook files..."
curl -fsSL "$BACKEND_URL/api/setup/hook-files/HOOK.md"    -o "$HOOK_DIR/HOOK.md"
curl -fsSL "$BACKEND_URL/api/setup/hook-files/handler.ts" -o "$HOOK_DIR/handler.ts"

# 4. Viết config .env (mode 600 để chỉ owner đọc được — secret nhạy cảm)
cat > "$HOOK_DIR/.env" <<EOF
BACKEND_URL=$BACKEND_URL
WEBHOOK_SECRET=$SECRET
TENANT_ID=$TENANT_ID
EOF
chmod 600 "$HOOK_DIR/.env"
echo "✅ Files installed"

# 5. Enable hook (nếu có openclaw CLI)
if command -v openclaw >/dev/null 2>&1; then
  openclaw hooks enable zalo-monitor >/dev/null 2>&1 || true
  echo "✅ Hook enabled (openclaw CLI)"
fi

# 6. Self-test — ping backend xác nhận secret + kết nối hoạt động
echo "🧪 Testing connection..."
TEST_STATUS=$(curl -fsS -o /tmp/zm-test.out -w "%{http_code}" \\
  -X POST "$BACKEND_URL/api/setup/hook-test" \\
  -H "Content-Type: application/json" \\
  -H "X-Tenant-Id: $TENANT_ID" \\
  -H "X-Webhook-Secret: $SECRET" \\
  -d '{}' 2>/dev/null || echo "000")

if [ "$TEST_STATUS" = "200" ]; then
  echo "✅ Connection OK — dashboard đã nhận được ping từ máy này"
  echo ""
  echo "🎉 Hoàn tất! Gửi 1 tin nhắn thử trong nhóm có bot để xác nhận luồng end-to-end."
elif [ "$TEST_STATUS" = "401" ]; then
  echo "❌ Secret sai — chạy lại install command từ dashboard mới nhất."
  exit 1
elif [ "$TEST_STATUS" = "000" ]; then
  echo "⚠️  Không kết nối được tới $BACKEND_URL"
  echo "   Check: firewall, domain đúng chưa, backend có chạy không."
  exit 1
else
  echo "⚠️  Backend trả HTTP $TEST_STATUS"
  cat /tmp/zm-test.out 2>/dev/null || true
  echo ""
  echo "   Hook files đã cài nhưng chưa xác nhận được kết nối."
fi
`
}
