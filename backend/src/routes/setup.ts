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
  password: z.string().min(8).regex(
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()\-_=+\[\]{}|;':",.<>?/\\`~])/,
    'Mật khẩu phải chứa chữ hoa, chữ thường, số và ký tự đặc biệt'
  ),
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
export const hookPings = new Map<string, number>()
setInterval(() => {
  const cutoff = Date.now() - 10 * 60 * 1000
  for (const [k, ts] of hookPings) if (ts < cutoff) hookPings.delete(k)
}, 60_000).unref?.()

// CHỈ set khi openzca auth status = logged in. Listener gọi /zalo-status mỗi 30s.
// Đây là source of truth duy nhất để biết Zalo đã login chưa (KHÔNG dùng hookPings).
export const zaloLoggedInTenants = new Map<string, number>()
setInterval(() => {
  const cutoff = Date.now() - 5 * 60 * 1000  // 5 min không ping → coi như offline
  for (const [k, ts] of zaloLoggedInTenants) if (ts < cutoff) zaloLoggedInTenants.delete(k)
}, 60_000).unref?.()

// In-memory QR store: tenantId → { dataUrl, pushedAt }
const qrStore = new Map<string, { dataUrl: string; pushedAt: number }>()
export function getQrFromStore(tenantId: string) {
  const entry = qrStore.get(tenantId)
  if (!entry) return null
  // QR Zalo chỉ valid ~60s, sau đó coi như đã scan/expired → clear
  if (Date.now() - entry.pushedAt > 90 * 1000) { qrStore.delete(tenantId); return null }
  return entry.dataUrl
}

export function clearQrFromStore(tenantId: string) {
  qrStore.delete(tenantId)
}

// Pending actions (dashboard → hook): tenantId → Set<action>
// Hook poll endpoint /pending-actions, exec lệnh tương ứng (vd login_zalo → openzca login)
const pendingActions = new Map<string, Set<string>>()

// Trạng thái sync history: tenantId → { ok, output, at }
const syncHistoryStatus = new Map<string, { ok: boolean | null; output: string; at: number }>()
/**
 * Queue action: in-memory (nhanh) + persist DB (sống sót backend restart +
 * khách offline nhiều ngày). Listener poll /pending-actions sẽ thấy cả 2.
 */
export function queueAction(tenantId: string, action: string) {
  // In-memory: pickup ngay nếu listener đang ping, không cần đợi DB
  if (!pendingActions.has(tenantId)) pendingActions.set(tenantId, new Set())
  pendingActions.get(tenantId)!.add(action)
  // Auto cleanup memory sau 24h (nếu DB version đã pickup rồi)
  setTimeout(() => pendingActions.get(tenantId)?.delete(action), 24 * 60 * 60 * 1000)
  // Persist DB: khách offline nhiều ngày vẫn pickup được khi sống lại
  import('../services/db.js').then(({ db }) => {
    db.pendingAction.create({ data: { tenantId, action } }).catch(() => undefined)
  })
}

export function getQrEntryFromStore(tenantId: string) {
  const entry = qrStore.get(tenantId)
  if (!entry) return null
  if (Date.now() - entry.pushedAt > 5 * 60 * 1000) { qrStore.delete(tenantId); return null }
  return entry
}

export const setupRoutes: FastifyPluginAsync = async (app) => {
  // Step 1: Tạo tenant + owner account, trả JWT để auto-login
  app.post('/tenant', async (req, reply) => {
    const body = step1Schema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

    const { businessName, industry, ownerName, email, password } = body.data
    const slug = slugify(businessName)

    // Trùng email trong cùng tenant là không xảy ra với tenant mới, nhưng email
    // có thể đã tồn tại ở tenant khác — OK, vì unique là (tenantId, email)
    const tenant = await db.tenant.create({
      data: {
        name: businessName,
        industry,
        slug,
        licenseExpiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        users: {
          create: {
            name: ownerName,
            email,
            passwordHash: hashPassword(password),
            role: 'OWNER',
          },
        },
      },
      include: { users: { take: 1, orderBy: { createdAt: 'asc' } } },
    })

    const owner = tenant.users[0]
    const token = app.jwt.sign(
      { userId: owner.id, tenantId: tenant.id, role: 'OWNER' },
      { expiresIn: '30d' }
    )

    const webhookUrl = `${resolveBackendUrl(req)}/webhook/message`
    return { tenantId: tenant.id, slug, webhookUrl, token, user: { id: owner.id, name: owner.name, email: owner.email, role: 'OWNER' } }
  })

  // Step 2: Trả về lệnh inject + script để copy vào terminal OpenClaw.
  // Accept userId để sinh command per-user — secret đó chỉ thuộc 1 user,
  // tin nhắn Zalo của họ sẽ được stamp ownerUserId khi về backend.
  app.get('/inject-command', async (req, reply) => {
    const { tenantId, userId } = req.query as { tenantId: string; userId?: string }
    if (!tenantId) return reply.status(400).send({ error: 'tenantId required' })

    const tenant = await db.tenant.findUnique({
      where: { id: tenantId },
      select: { webhookSecret: true },
    })
    if (!tenant) return reply.status(404).send({ error: 'Tenant not found' })

    const backendUrl = resolveBackendUrl(req)
    const webhookUrl = `${backendUrl}/webhook/message`

    // Query embedding: tenantId required, userId optional (fallback tenant-level cho legacy)
    const qs = userId ? `tenantId=${tenantId}&userId=${userId}` : `tenantId=${tenantId}`

    return {
      webhookUrl,
      tenantId,
      userId: userId ?? null,
      // Linux/Mac: chạy trực tiếp, script tự cài Node + openzca + listener service
      oneLineCommand: `curl -fsSL "${backendUrl}/api/setup/inject.sh?${qs}" | bash`,
      // Docker: chạy listener trong container node:22-alpine, host network để dễ login Zalo qua QR
      dockerCommand: `docker run -d --name zalo-monitor-listener --restart unless-stopped --network host -v zalo-monitor-data:/root/.zalo-monitor -e BACKEND_URL='${backendUrl}' node:22-alpine sh -c "apk add --no-cache curl bash && curl -fsSL '${backendUrl}/api/setup/inject.sh?${qs}' | bash"`,
      // Windows PowerShell (Run as Administrator)
      windowsCommand: `iwr -useb "${backendUrl}/api/setup/inject.ps1?${qs}" | iex`,
      admin: {
        name: process.env.ADMIN_NAME ?? 'Support',
        zalo: process.env.ADMIN_ZALO ?? '',
        telegram: process.env.ADMIN_TELEGRAM ?? '',
        email: process.env.ADMIN_EMAIL ?? '',
      },
    }
  })

  // Serve inject script (OpenClaw hook installer)
  // Script tự chứa secret + URL. Nếu userId được cung cấp → dùng user.webhookSecret
  // (per-user model: tin nhắn Zalo của user đó được stamp ownerUserId). Không có userId
  // → fallback tenant.webhookSecret (shared, không biết ai sở hữu).
  app.get('/inject.sh', async (req, reply) => {
    const q = req.query as any
    const tenantId = String(q.tenantId ?? q.TENANT_ID ?? '').trim()
    const userId   = String(q.userId   ?? q.USER_ID   ?? '').trim()

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

    // Ưu tiên per-user secret nếu có userId hợp lệ
    let secret = tenant.webhookSecret
    let displayName = tenant.name
    if (userId) {
      const user = await db.user.findFirst({
        where: { id: userId, tenantId },
        select: { webhookSecret: true, name: true },
      })
      if (!user) {
        reply.header('Content-Type', 'text/plain')
        return reply.status(404).send('#!/bin/bash\necho "❌ User not found in tenant" >&2\nexit 1\n')
      }
      secret = user.webhookSecret
      displayName = `${user.name} @ ${tenant.name}`
    }

    const backendUrl = resolveBackendUrl(req)
    const dashboardUrl = (process.env.DASHBOARD_URL ?? process.env.PUBLIC_DASHBOARD_URL ?? '')
      .replace(/\/$/, '') || backendUrl.replace(/^https?:\/\/api\./, 'https://')
    reply.header('Content-Type', 'text/plain')
    return generateLinuxInstaller(backendUrl, dashboardUrl, secret, tenantId, displayName)
  })

  // Windows PowerShell installer
  app.get('/inject.ps1', async (req, reply) => {
    const q = req.query as any
    const tenantId = String(q.tenantId ?? '').trim()
    const userId   = String(q.userId   ?? '').trim()

    if (!tenantId) {
      reply.header('Content-Type', 'text/plain')
      return reply.status(400).send('Write-Error "tenantId query param required"\nexit 1\n')
    }

    const tenant = await db.tenant.findUnique({
      where: { id: tenantId },
      select: { webhookSecret: true, active: true, name: true },
    })
    if (!tenant) {
      reply.header('Content-Type', 'text/plain')
      return reply.status(404).send('Write-Error "Tenant not found"\nexit 1\n')
    }
    if (!tenant.active) {
      reply.header('Content-Type', 'text/plain')
      return reply.status(403).send('Write-Error "Tenant suspended"\nexit 1\n')
    }

    let secret = tenant.webhookSecret
    let displayName = tenant.name
    if (userId) {
      const user = await db.user.findFirst({
        where: { id: userId, tenantId },
        select: { webhookSecret: true, name: true },
      })
      if (user) {
        secret = user.webhookSecret
        displayName = `${user.name} @ ${tenant.name}`
      }
    }

    const backendUrl = resolveBackendUrl(req)
    const dashboardUrl = (process.env.DASHBOARD_URL ?? process.env.PUBLIC_DASHBOARD_URL ?? '')
      .replace(/\/$/, '') || backendUrl.replace(/^https?:\/\/api\./, 'https://')
    reply.header('Content-Type', 'text/plain; charset=utf-8')
    return generateWindowsHookInstaller(backendUrl, dashboardUrl, secret, tenantId, displayName)
  })

  // Serve hook files for download (customer OpenClaw fetch khi install)
  app.get('/hook-files/:file', async (req, reply) => {
    const { file } = req.params as { file: string }
    const path = await import('path')
    const fs = await import('fs')
    const allowlist = new Set(['HOOK.md', 'handler.ts', 'zalo-history-push.mjs', 'zalo-listener.mjs', 'zalo-history-import.sh', 'zalo-history-import.ps1'])
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

  // GET /api/setup/listener-version — cho listener self-update (so SHA256 với local)
  app.get('/listener-version', async (_req, reply) => {
    const path = await import('path')
    const fs = await import('fs')
    const { createHash } = await import('node:crypto')
    const candidates = [
      path.resolve(process.cwd(), '..', 'plugin', 'hooks', 'zalo-monitor', 'zalo-listener.mjs'),
      path.resolve(process.cwd(), 'plugin', 'hooks', 'zalo-monitor', 'zalo-listener.mjs'),
      path.resolve('/app', 'plugin', 'hooks', 'zalo-monitor', 'zalo-listener.mjs'),
    ]
    const full = candidates.find((p) => fs.existsSync(p))
    if (!full) return reply.status(500).send({ error: 'listener file not found on server' })
    const buf = fs.readFileSync(full)
    const sha256 = createHash('sha256').update(buf).digest('hex')
    return { sha256, size: buf.length }
  })

  // POST /api/setup/qr-push — hook reports QR image
  app.post('/qr-push', async (req, reply) => {
    const secret = req.headers['x-webhook-secret'] as string
    const tenantId = req.headers['x-tenant-id'] as string
    const { dataUrl } = req.body as { dataUrl: string }

    if (!dataUrl?.startsWith('data:image/')) return reply.status(400).send({ error: 'Invalid dataUrl' })

    // Verify secret belongs to this tenant (check webhookSecret on tenant or any user)
    const tenant = await db.tenant.findFirst({ where: { id: tenantId } })
    if (!tenant) return reply.status(404).send({ error: 'Tenant not found' })

    // Accept if secret matches any user's webhookSecret OR tenant-level secret in this tenant
    let secretValid = secret === tenant.webhookSecret
    if (!secretValid) {
      const user = await db.user.findFirst({ where: { tenantId, webhookSecret: secret } })
      if (!user) return reply.status(403).send({ error: 'Invalid secret' })
    }

    qrStore.set(tenantId, { dataUrl, pushedAt: Date.now() })
    return { ok: true }
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
    // Accept both tenant-level secret AND per-user secret (inject.sh uses user secret when userId provided)
    if (secret !== tenant.webhookSecret) {
      const userMatch = await db.user.findFirst({ where: { tenantId, webhookSecret: secret } })
      if (!userMatch) return reply.status(401).send({ error: 'Invalid secret' })
    }

    hookPings.set(tenantId, Date.now())

    // Fire-and-forget: update lastHookPingAt in DB
    db.tenant.update({
      where: { id: tenantId },
      data: { lastHookPingAt: new Date() },
    }).catch(() => undefined)

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

  // GET /api/setup/sync-request — hook polls this to check if sync is needed
  // Query params:
  //   - hasSqlite=1: SQLite available on same machine → higher limit + more groups
  //   - forceFullSync=1: standalone script override → skip cooldown, DO NOT update lastAutoSyncAt
  // Returns groups to sync + limit. Marks lastAutoSyncAt to prevent parallel runs (unless forceFullSync).
  app.get('/sync-request', async (req, reply) => {
    const secret = req.headers['x-webhook-secret'] as string
    const tenantId = req.headers['x-tenant-id'] as string
    const q = (req.query as Record<string, string>) ?? {}
    const hasSqlite = q.hasSqlite === '1'
    const forceFullSync = q.forceFullSync === '1'

    if (!secret || !tenantId) return reply.status(400).send({ error: 'Missing headers' })

    // Validate secret (tenant-level OR per-user)
    const tenant = await db.tenant.findUnique({
      where: { id: tenantId },
      select: { webhookSecret: true, active: true, maxHistorySyncDepth: true, lastAutoSyncAt: true },
    })
    if (!tenant) return reply.status(404).send({ error: 'Tenant not found' })
    if (!tenant.active) return reply.status(403).send({ error: 'Suspended' })

    let secretValid = secret === tenant.webhookSecret
    if (!secretValid) {
      const user = await db.user.findFirst({ where: { tenantId, webhookSecret: secret } })
      secretValid = !!user
    }
    if (!secretValid) return reply.status(403).send({ error: 'Invalid secret' })

    // Check if sync is needed: forceFullSync=1 bypasses cooldown, otherwise check 23h rule
    let needsSync = forceFullSync || !tenant.lastAutoSyncAt ||
      Date.now() - tenant.lastAutoSyncAt.getTime() > 23 * 60 * 60 * 1000

    if (!needsSync || tenant.maxHistorySyncDepth === 0) {
      return { needed: false }
    }

    // Determine group limit and sync depth based on SQLite availability
    const groupLimit = (hasSqlite || forceFullSync) ? 200 : 50
    const syncDepth = (hasSqlite || forceFullSync)
      ? Math.max(tenant.maxHistorySyncDepth, 5000)
      : tenant.maxHistorySyncDepth

    // Get top N groups to sync (most recently active first)
    const groups = await db.group.findMany({
      where: { tenantId, channelType: 'ZALO', monitorEnabled: true },
      orderBy: { lastMessageAt: { sort: 'desc', nulls: 'last' } },
      take: groupLimit,
      select: { id: true, externalId: true, name: true },
    })

    if (groups.length === 0) return { needed: false }

    // Mark sync started ONLY if not forceFullSync (standalone script shouldn't affect normal sync timer)
    if (!forceFullSync) {
      await db.tenant.update({
        where: { id: tenantId },
        data: { lastAutoSyncAt: new Date() },
      }).catch(() => undefined)
    }

    return {
      needed: true,
      limit: syncDepth,
      groups: groups.map(g => ({ id: g.id, externalId: g.externalId, name: g.name })),
    }
  })

  // POST /api/setup/sync-push — hook pushes message batch for a group
  // Body: { groupId: string, messages: Array<{msgId, senderId, senderName?, content?, timestamp?, isSelf?}> }
  app.post('/sync-push', async (req, reply) => {
    const secret = req.headers['x-webhook-secret'] as string
    const tenantId = req.headers['x-tenant-id'] as string
    if (!secret || !tenantId) return reply.status(400).send({ error: 'Missing headers' })

    // Validate secret
    const tenant = await db.tenant.findFirst({ where: { id: tenantId } })
    if (!tenant) return reply.status(404).send({ error: 'Tenant not found' })

    let secretValid = secret === tenant.webhookSecret
    if (!secretValid) {
      const user = await db.user.findFirst({ where: { tenantId, webhookSecret: secret } })
      secretValid = !!user
    }
    if (!secretValid) return reply.status(403).send({ error: 'Invalid secret' })

    const body = req.body as {
      groupId: string
      messages: Array<{
        msgId?: string
        cliMsgId?: string
        senderId?: string
        uidFrom?: string
        senderName?: string
        dName?: string
        content?: string
        message?: string
        text?: string
        timestamp?: number
        isSelf?: boolean
        senderType?: string
        msgType?: string
        mediaType?: string
        mediaUrl?: string
      }>
    }

    if (!body.groupId || !Array.isArray(body.messages)) {
      return reply.status(400).send({ error: 'groupId and messages array required' })
    }

    // Verify group belongs to this tenant
    const group = await db.group.findFirst({ where: { id: body.groupId, tenantId } })
    if (!group) return reply.status(404).send({ error: 'Group not found' })

    // Skip nếu group là DM và tenant tắt monitorDMs (trừ allowlist)
    if (group.isDirect && !tenant.monitorDMs && !tenant.allowedDMIds.includes(group.externalId.replace(/^group:/, ''))) {
      return reply.status(200).send({ ok: true, imported: 0, skipped: 'dm_monitor_off' })
    }
    // Skip nếu group đã tắt monitorEnabled
    if (!group.monitorEnabled) {
      return reply.status(200).send({ ok: true, imported: 0, skipped: 'group_monitor_off' })
    }

    let imported = 0
    for (const m of body.messages) {
      const msgId = m.msgId ?? m.cliMsgId
      if (!msgId) continue

      const senderId = String(m.senderId ?? m.uidFrom ?? 'unknown')
      const senderName = m.senderName ?? m.dName ?? null
      const content = typeof m.content === 'string' ? m.content
        : typeof m.message === 'string' ? m.message
        : typeof m.text === 'string' ? m.text
        : null
      const senderType: 'SELF' | 'CONTACT' = m.isSelf || m.senderType === 'SELF' ? 'SELF' : 'CONTACT'

      // Detect content type
      const mt = ((m.msgType ?? m.mediaType) ?? '').toLowerCase()
      const contentType = mt.includes('image') || mt.includes('photo') ? 'IMAGE'
        : mt.includes('video') ? 'VIDEO'
        : mt.includes('file') || mt.includes('document') ? 'FILE'
        : mt.includes('sticker') ? 'STICKER'
        : mt.includes('voice') || mt.includes('audio') ? 'VOICE'
        : 'TEXT'

      try {
        await db.message.upsert({
          where: { groupId_externalId: { groupId: body.groupId, externalId: String(msgId) } },
          update: {},
          create: {
            groupId: body.groupId,
            externalId: String(msgId),
            senderType,
            senderId,
            senderName,
            contentType,
            content,
            attachments: m.mediaUrl ? { mediaUrls: [m.mediaUrl] } : undefined,
            sentAt: m.timestamp ? new Date(m.timestamp) : new Date(),
          },
        })
        imported++
      } catch { /* skip duplicates */ }
    }

    // Update group lastMessageAt if we got messages
    if (imported > 0) {
      await db.group.update({
        where: { id: body.groupId },
        data: { lastMessageAt: new Date() },
      }).catch(() => undefined)
    }

    return { ok: true, imported, total: body.messages.length }
  })

  // GET /api/setup/pending-sends — hook polls for outgoing messages to send
  // Accept secret từ tenant.webhookSecret HOẶC user.webhookSecret (per-user listener)
  app.get('/pending-sends', async (req, reply) => {
    const secret = req.headers['x-webhook-secret'] as string
    const headerTenantId = req.headers['x-tenant-id'] as string | undefined
    if (!secret) return reply.status(401).send({ error: 'Missing secret' })

    let tenantId: string | null = null
    // Try tenant secret first
    const tenant = await db.tenant.findFirst({ where: { webhookSecret: secret } })
    if (tenant) tenantId = tenant.id
    // Fallback: per-user secret (install URL có userId=)
    if (!tenantId) {
      const user = await db.user.findFirst({
        where: { webhookSecret: secret, ...(headerTenantId ? { tenantId: headerTenantId } : {}) },
        select: { tenantId: true },
      })
      if (user) tenantId = user.tenantId
    }
    if (!tenantId) return reply.status(403).send({ error: 'Invalid secret' })

    const pending = await db.sendQueue.findMany({
      where: { tenantId, status: 'pending' },
      orderBy: { createdAt: 'asc' },
      take: 20,
      select: { id: true, groupExternalId: true, text: true, mediaUrl: true, mediaType: true },
    })
    if (pending.length === 0) return []
    const groups = await db.group.findMany({
      where: {
        tenantId,
        externalId: { in: pending.map(p => p.groupExternalId) },
        channelType: 'ZALO',
      },
      select: { externalId: true, isDirect: true },
    })
    const isDirectMap = Object.fromEntries(groups.map(g => [g.externalId, g.isDirect]))
    return pending.map(p => ({ ...p, isGroup: !(isDirectMap[p.groupExternalId] ?? false) }))
  })

  // POST /api/setup/ack-send — hook reports send result
  // Accept secret từ tenant.webhookSecret HOẶC user.webhookSecret
  app.post('/ack-send', async (req, reply) => {
    const secret = req.headers['x-webhook-secret'] as string
    const headerTenantId = req.headers['x-tenant-id'] as string | undefined
    if (!secret) return reply.status(401).send({ error: 'Missing secret' })
    const { id, status } = req.body as { id: string; status: 'sent' | 'failed' }

    let tenantId: string | null = null
    const tenant = await db.tenant.findFirst({ where: { webhookSecret: secret } })
    if (tenant) tenantId = tenant.id
    if (!tenantId) {
      const user = await db.user.findFirst({
        where: { webhookSecret: secret, ...(headerTenantId ? { tenantId: headerTenantId } : {}) },
        select: { tenantId: true },
      })
      if (user) tenantId = user.tenantId
    }
    if (!tenantId) return reply.status(403).send({ error: 'Invalid secret' })
    await db.sendQueue.update({ where: { id, tenantId }, data: { status } })
    return { ok: true }
  })

  // POST /api/setup/zalo-status — listener báo Zalo đã/chưa login (chính xác hơn hookPing)
  app.post('/zalo-status', async (req, reply) => {
    const secret = req.headers['x-webhook-secret'] as string
    const tenantId = req.headers['x-tenant-id'] as string
    if (!secret || !tenantId) return reply.status(400).send({ error: 'Missing headers' })
    const tenant = await db.tenant.findFirst({ where: { id: tenantId } })
    if (!tenant) return reply.status(404).send({ error: 'Not found' })
    let ok = secret === tenant.webhookSecret
    if (!ok) {
      const u = await db.user.findFirst({ where: { tenantId, webhookSecret: secret } })
      ok = !!u
    }
    if (!ok) return reply.status(401).send({ error: 'Invalid' })
    const { loggedIn } = req.body as { loggedIn?: boolean }
    if (loggedIn) {
      const wasLoggedIn = zaloLoggedInTenants.has(tenantId)
      zaloLoggedInTenants.set(tenantId, Date.now())
      // Vừa từ chưa login → đang login → auto trigger sync history 1 lần
      // (listener sẽ chạy zalo-history-push.mjs lấy 20 tin gần nhất / nhóm)
      if (!wasLoggedIn) {
        // Chỉ trigger nếu chưa từng sync trong 24h gần đây (avoid loop)
        const last = syncHistoryStatus.get(tenantId)
        if (!last || Date.now() - last.at > 24 * 60 * 60_000) {
          queueAction(tenantId, 'sync_history')
        }
      }
    } else {
      zaloLoggedInTenants.delete(tenantId)
      qrStore.delete(tenantId) // chưa login → clear QR cũ
    }
    return { ok: true }
  })

  // POST /api/setup/sync-zalo-groups — listener push danh sách group thật (openzca group list)
  // Backend dùng để: (1) rename group có name fallback "Nhóm xxxxx" → tên thật,
  //                  (2) flip records mistakenly DM (isDirect=true) → group (isDirect=false)
  //                  (3) merge duplicate (DM record + Group record cùng numericId)
  app.post('/sync-zalo-groups', async (req, reply) => {
    const secret = req.headers['x-webhook-secret'] as string
    const tenantId = req.headers['x-tenant-id'] as string
    if (!secret || !tenantId) return reply.status(400).send({ error: 'Missing headers' })
    const tenant = await db.tenant.findFirst({ where: { id: tenantId } })
    if (!tenant) return reply.status(404).send({ error: 'Not found' })
    let ok = secret === tenant.webhookSecret
    if (!ok) {
      const u = await db.user.findFirst({ where: { tenantId, webhookSecret: secret } })
      ok = !!u
    }
    if (!ok) return reply.status(401).send({ error: 'Invalid' })

    const body = req.body as { groups?: Array<{ groupId: string; name: string; avatar?: string | null; memberCount?: number | null }> }
    if (!Array.isArray(body?.groups) || body.groups.length === 0) {
      return reply.status(400).send({ error: 'No groups' })
    }

    let renamed = 0, flipped = 0, merged = 0, avatarsSet = 0
    for (const g of body.groups) {
      const numericId = String(g.groupId).replace(/^group:/, '')
      const fullExternalId = `group:${numericId}`
      const realName = (g.name || '').trim().slice(0, 200)
      const avatar = g.avatar && typeof g.avatar === 'string' && g.avatar.startsWith('http') ? g.avatar : null
      const memberCount = typeof g.memberCount === 'number' && g.memberCount > 0 ? g.memberCount : null
      if (!numericId) continue

      // Tìm cả 2 records: với prefix và không prefix
      const groupRec = await db.group.findUnique({
        where: { tenantId_externalId_channelType: { tenantId, externalId: fullExternalId, channelType: 'ZALO' } },
        select: { id: true, name: true },
      })
      const dmRec = await db.group.findUnique({
        where: { tenantId_externalId_channelType: { tenantId, externalId: numericId, channelType: 'ZALO' } },
        select: { id: true, name: true, isDirect: true },
      })

      if (groupRec && dmRec) {
        // Duplicate: merge dmRec → groupRec
        await db.message.updateMany({
          where: { groupId: dmRec.id },
          data: { groupId: groupRec.id },
        }).catch(async () => {
          // Skip collision: msgs có cùng externalId — delete duplicate dm msgs
          const dups = await db.message.findMany({
            where: { groupId: dmRec.id },
            select: { id: true, externalId: true },
          })
          for (const m of dups) {
            const collision = await db.message.findFirst({
              where: { groupId: groupRec.id, externalId: m.externalId },
              select: { id: true },
            })
            if (collision) await db.message.delete({ where: { id: m.id } })
            else await db.message.update({ where: { id: m.id }, data: { groupId: groupRec.id } })
          }
        })
        await db.alert.updateMany({ where: { groupId: dmRec.id }, data: { groupId: groupRec.id } }).catch(() => undefined)
        await db.groupMonitor.deleteMany({ where: { groupId: dmRec.id } }).catch(() => undefined)
        await db.groupPermission.deleteMany({ where: { groupId: dmRec.id } }).catch(() => undefined)
        await db.group.delete({ where: { id: dmRec.id } })
        merged++
        // Update name nếu cần
        if (realName && groupRec.name !== realName && /^Nhóm [0-9a-z]{4,8}$/.test(groupRec.name)) {
          await db.group.update({ where: { id: groupRec.id }, data: { name: realName } })
          renamed++
        }
      } else if (dmRec && !groupRec) {
        // Chỉ có DM record → flip thành group
        await db.group.update({
          where: { id: dmRec.id },
          data: {
            isDirect: false,
            externalId: fullExternalId,
            name: realName || `Nhóm ${numericId.slice(-6)}`,
          },
        })
        flipped++
      } else if (groupRec && realName && /^Nhóm [0-9a-z]{4,8}$/.test(groupRec.name)) {
        // Group record có name fallback → rename
        await db.group.update({ where: { id: groupRec.id }, data: { name: realName } })
        renamed++
      }

      // Update avatar + memberCount nếu có (cho cả groupRec hoặc dmRec đã flip)
      const finalGroupId = groupRec?.id ?? dmRec?.id
      if (finalGroupId && (avatar || memberCount)) {
        const updateData: any = {}
        if (avatar) updateData.avatarUrl = avatar
        if (memberCount) updateData.memberCount = memberCount
        await db.group.update({ where: { id: finalGroupId }, data: updateData }).catch(() => undefined)
        if (avatar) avatarsSet++
      }
    }

    return { ok: true, total: body.groups.length, renamed, flipped, merged, avatarsSet }
  })

  // POST /api/setup/sync-history-done — listener báo đã sync xong
  app.post('/sync-history-done', async (req, reply) => {
    const secret = req.headers['x-webhook-secret'] as string
    const tenantId = req.headers['x-tenant-id'] as string
    if (!secret || !tenantId) return reply.status(400).send({ error: 'Missing headers' })
    const tenant = await db.tenant.findFirst({ where: { id: tenantId } })
    if (!tenant) return reply.status(404).send({ error: 'Not found' })
    let ok = secret === tenant.webhookSecret
    if (!ok) {
      const u = await db.user.findFirst({ where: { tenantId, webhookSecret: secret } })
      ok = !!u
    }
    if (!ok) return reply.status(401).send({ error: 'Invalid' })
    const body = req.body as { ok?: boolean; output?: string }
    syncHistoryStatus.set(tenantId, { ok: !!body.ok, output: body.output ?? '', at: Date.now() })
    return { ok: true }
  })

  // GET /api/setup/sync-history-status — UI poll để hiện kết quả
  app.get('/sync-history-status', async (req, reply) => {
    const tenantId = (req as any).authUser?.tenantId
      ?? (req.headers['x-tenant-id'] as string)
    if (!tenantId) return reply.status(400).send({ error: 'Missing tenant id' })
    return syncHistoryStatus.get(tenantId) ?? { ok: null, output: '', at: 0 }
  })

  // POST /api/setup/listener-ping — zalo-listener.mjs ping mỗi 5p để báo còn sống
  app.post('/listener-ping', async (req, reply) => {
    const secret = req.headers['x-webhook-secret'] as string
    const tenantId = req.headers['x-tenant-id'] as string
    if (!secret || !tenantId) return reply.status(400).send({ error: 'Missing headers' })
    const tenant = await db.tenant.findFirst({ where: { id: tenantId } })
    if (!tenant) return reply.status(404).send({ error: 'Not found' })
    let ok = secret === tenant.webhookSecret
    if (!ok) {
      const u = await db.user.findFirst({ where: { tenantId, webhookSecret: secret } })
      ok = !!u
    }
    if (!ok) return reply.status(401).send({ error: 'Invalid' })
    hookPings.set(tenantId, Date.now())
    db.tenant.update({ where: { id: tenantId }, data: { lastHookPingAt: new Date() } }).catch(() => undefined)
    return { ok: true }
  })

  // POST /api/setup/login-success — hook báo Zalo đã login thành công
  // Hook chạy `openzca auth status` định kỳ, khi thấy "logged in" thì gọi endpoint này
  app.post('/login-success', async (req, reply) => {
    const secret = req.headers['x-webhook-secret'] as string
    if (!secret) return reply.status(401).send({ error: 'Missing secret' })
    const tenant = await db.tenant.findFirst({ where: { webhookSecret: secret } })
    if (!tenant) return reply.status(403).send({ error: 'Invalid secret' })
    qrStore.delete(tenant.id)
    hookPings.set(tenant.id, Date.now())
    // Cập nhật DB để session-health trả 'healthy'
    db.tenant.update({
      where: { id: tenant.id },
      data: { lastHookPingAt: new Date() },
    }).catch(() => undefined)
    return { ok: true }
  })

  // GET /api/setup/pending-actions — hook polls for dashboard-triggered commands
  // Returns: { actions: ['login_zalo', ...] } — sau khi trả về thì xóa khỏi store
  // Accept secret từ tenant.webhookSecret HOẶC user.webhookSecret
  app.get('/pending-actions', async (req, reply) => {
    const secret = req.headers['x-webhook-secret'] as string
    const headerTenantId = req.headers['x-tenant-id'] as string | undefined
    if (!secret) return reply.status(401).send({ error: 'Missing secret' })

    let tenantId: string | null = null
    const tenant = await db.tenant.findFirst({ where: { webhookSecret: secret } })
    if (tenant) tenantId = tenant.id
    if (!tenantId) {
      const user = await db.user.findFirst({
        where: { webhookSecret: secret, ...(headerTenantId ? { tenantId: headerTenantId } : {}) },
        select: { tenantId: true },
      })
      if (user) tenantId = user.tenantId
    }
    if (!tenantId) return reply.status(403).send({ error: 'Invalid secret' })

    // Hook đang poll → cập nhật ping để dashboard biết hook còn sống
    hookPings.set(tenantId, Date.now())
    db.tenant.update({
      where: { id: tenantId },
      data: { lastHookPingAt: new Date() },
    }).catch(() => undefined)

    // Pickup actions từ cả 2 nguồn: memory (nhanh) + DB (sống sót offline lâu)
    const memSet = pendingActions.get(tenantId)
    const memActions = memSet ? Array.from(memSet) : []
    if (memSet) memSet.clear()

    // DB: lấy tất cả pending actions của tenant này, xoá luôn (consume)
    const dbRows = await db.pendingAction.findMany({
      where: { tenantId },
      select: { id: true, action: true },
    })
    if (dbRows.length > 0) {
      await db.pendingAction.deleteMany({ where: { id: { in: dbRows.map(r => r.id) } } }).catch(() => undefined)
    }

    // Dedupe + return
    const merged = Array.from(new Set([...memActions, ...dbRows.map(r => r.action)]))
    return { actions: merged }
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

function generateWindowsHookInstaller(
  backendUrl: string,
  dashboardUrl: string,
  secret: string,
  tenantId: string,
  displayName: string,
): string {
  return `# Zalo Monitor Listener Installer for Windows (PowerShell)
# Run as Administrator: iwr -useb "${backendUrl}/api/setup/inject.ps1?tenantId=${tenantId}" | iex

# Bypass ExecutionPolicy cho process này — tránh prompt "Y/N" khi npm.ps1 run
try { Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force -ErrorAction SilentlyContinue } catch {}

$ErrorActionPreference = "Stop"
$BACKEND_URL = "${backendUrl}"
$TENANT_ID   = "${tenantId}"
$SECRET      = "${secret}"
$DISPLAY_NAME = "${displayName}"
$DASHBOARD_URL = "${dashboardUrl}"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Zalo Monitor Listener Installer (Windows)" -ForegroundColor Cyan
Write-Host "  Tenant : $DISPLAY_NAME" -ForegroundColor White
Write-Host "  Backend: $BACKEND_URL" -ForegroundColor White
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# [1/5] Check / auto-install Node.js
Write-Host "[1/5] Kiem tra Node.js..." -ForegroundColor Yellow
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host "  Node.js chua cai. Dang tu dong cai dat..." -ForegroundColor Yellow
  # Cach 1: winget (Win 10 1809+ hoac Win 11)
  if (Get-Command winget -ErrorAction SilentlyContinue) {
    winget install OpenJS.NodeJS.LTS --silent --accept-package-agreements --accept-source-agreements 2>&1 | Out-Null
    \`$env:PATH = [System.Environment]::GetEnvironmentVariable("PATH","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("PATH","User")
  }
  # Cach 2: Tai MSI tu nodejs.org (fallback khi khong co winget)
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "  Khong co winget, tai MSI tu nodejs.org..." -ForegroundColor Yellow
    \`$arch = if ([Environment]::Is64BitOperatingSystem) { "x64" } else { "x86" }
    \`$msiUrl = "https://nodejs.org/dist/v20.18.1/node-v20.18.1-\`$arch.msi"
    \`$msiPath = "\`$env:TEMP\\node-installer.msi"
    try {
      Invoke-WebRequest -Uri \`$msiUrl -OutFile \`$msiPath -UseBasicParsing -TimeoutSec 60
      Start-Process msiexec.exe -ArgumentList "/i \`"\`$msiPath\`" /quiet /qn /norestart" -Wait -Verb RunAs
      Remove-Item \`$msiPath -ErrorAction SilentlyContinue
      \`$env:PATH = [System.Environment]::GetEnvironmentVariable("PATH","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("PATH","User")
    } catch {
      Write-Host "  Tai MSI that bai (\`$_)" -ForegroundColor Red
    }
  }
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "  Khong tu cai Node duoc. Tai thu cong tai: https://nodejs.org/en/download" -ForegroundColor Red
    Write-Host "  Sau khi cai xong, double-click file installer mot lan nua." -ForegroundColor White
    exit 1
  }
}
Write-Host "  OK Node.js \`$(node --version)" -ForegroundColor Green

# [2/5] Cai openzca CLI (npm install -g openzca)
Write-Host "[2/5] Kiem tra openzca..." -ForegroundColor Yellow
if (-not (Get-Command openzca -ErrorAction SilentlyContinue)) {
  Write-Host "  Dang cai openzca..." -ForegroundColor White
  # npm hay write 'npm notice' ra stderr — KHÔNG phải lỗi. ErrorActionPreference=Stop sẽ
  # treat stderr as terminating error → bypass tạm thời.
  \`$prevEAPNpm = \`$ErrorActionPreference
  \`$ErrorActionPreference = "Continue"
  cmd /c "npm install -g openzca" 2>&1 | Out-Null
  \`$ErrorActionPreference = \`$prevEAPNpm
  \`$env:PATH = [System.Environment]::GetEnvironmentVariable("PATH","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("PATH","User")
  if (-not (Get-Command openzca -ErrorAction SilentlyContinue)) {
    Write-Host "  Cai openzca that bai. Thu thu cong: npm install -g openzca" -ForegroundColor Red
    exit 1
  }
}
Write-Host "  OK openzca da san sang" -ForegroundColor Green

# [3/5] Tai zalo-listener.mjs vao %USERPROFILE%\.zalo-monitor
Write-Host "[3/5] Tai zalo-listener.mjs..." -ForegroundColor Yellow
$LISTENER_DIR = Join-Path $env:USERPROFILE ".zalo-monitor"
New-Item -ItemType Directory -Force -Path $LISTENER_DIR | Out-Null
$listenerPath = Join-Path $LISTENER_DIR "zalo-listener.mjs"
Invoke-WebRequest -Uri "$BACKEND_URL/api/setup/hook-files/zalo-listener.mjs" -OutFile $listenerPath -UseBasicParsing
Write-Host "  OK $listenerPath" -ForegroundColor Green

# [4/5] Ghi .env + tao Scheduled Task chay listener khi logon
Write-Host "[4/5] Cau hinh listener service..." -ForegroundColor Yellow
$envPath = Join-Path $LISTENER_DIR ".env"
$envContent = "BACKEND_URL=$BACKEND_URL\`r\`nWEBHOOK_SECRET=$SECRET\`r\`nTENANT_ID=$TENANT_ID\`r\`nPROFILE=zalo-monitor"
Set-Content -Path $envPath -Value $envContent -Encoding UTF8 -NoNewline
Write-Host "  OK .env: $envPath" -ForegroundColor Green

# Stop scheduled task cu + kill process listener stale (tranh duplicate lock conflict)
Write-Host "[*] Don dep listener cu (neu co)..." -ForegroundColor DarkGray
$prevEAP2 = $ErrorActionPreference
$ErrorActionPreference = "Continue"
& cmd /c "schtasks /End /TN ZaloMonitorListener" 2>&1 | Out-Null
Get-Process openzca -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
# Kill node processes dang chay zalo-listener.mjs (giu lai npm.exe vv)
Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue |
  Where-Object { $_.CommandLine -match 'zalo-listener' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
$ErrorActionPreference = $prevEAP2

# Wrapper script load .env roi exec node
# Note: PS escape \`$ trong @"..."@ heredoc de tranh interpolate variables cua wrapper script
$wrapperPath = Join-Path $LISTENER_DIR "run-listener.ps1"
$wrapperLines = @(
  "\`$ErrorActionPreference = 'Continue'",
  "Get-Content '$envPath' | ForEach-Object {",
  "  if (\`$_ -match '^([^=]+)=(.*)\`$') { [Environment]::SetEnvironmentVariable(\`$matches[1], \`$matches[2], 'Process') }",
  "}",
  "# Loop: nếu listener exit (vd self-update) → restart sau 3s. Tương đương Restart=always trên Linux.",
  "while (\`$true) {",
  "  & node '$listenerPath'",
  "  Start-Sleep -Seconds 3",
  "}"
)
Set-Content -Path $wrapperPath -Value ($wrapperLines -join "\`r\`n") -Encoding UTF8

# [5/5] Login Zalo (TRUOC khi start service de tranh conflict)
Write-Host "[5/5] Dang nhap Zalo (quet QR)..." -ForegroundColor Yellow

# QUAN TRONG: phai dung openzca.cmd tren Windows. File 'openzca' (khong ext)
# la PowerShell wrapper - Start-Process se mo Notepad thay vi chay.
$openzcaExe = $null
$npmPrefix = (npm config get prefix 2>$null)
$cmdCandidates = @()
if ($npmPrefix) {
  $cmdCandidates += (Join-Path $npmPrefix 'openzca.cmd')
  $cmdCandidates += (Join-Path $npmPrefix 'openzca.ps1')
}
$cmdCandidates += (Get-Command openzca.cmd -ErrorAction SilentlyContinue).Source
$cmdCandidates += "$env:APPDATA\npm\openzca.cmd"
foreach ($c in $cmdCandidates) {
  if ($c -and (Test-Path $c)) { $openzcaExe = $c; break }
}

if ($openzcaExe -and (Test-Path $openzcaExe)) {
  Write-Host "  openzca: $openzcaExe" -ForegroundColor DarkGray

  # Check da login chua: dung Start-Process voi timeout, tranh hang
  $statusLog = Join-Path $LISTENER_DIR "status.log"
  Remove-Item $statusLog -ErrorAction SilentlyContinue
  $stProc = Start-Process -FilePath $openzcaExe -ArgumentList @('--profile','zalo-monitor','auth','status') -RedirectStandardOutput $statusLog -RedirectStandardError "NUL" -WindowStyle Hidden -PassThru
  $stProc | Wait-Process -Timeout 10 -ErrorAction SilentlyContinue
  if (-not $stProc.HasExited) { $stProc | Stop-Process -Force -ErrorAction SilentlyContinue }
  $statusOut = if (Test-Path $statusLog) { Get-Content $statusLog -Raw } else { "" }
  Remove-Item $statusLog -ErrorAction SilentlyContinue

  if ($statusOut -match 'loggedIn:\s*true') {
    Write-Host "  OK Profile 'zalo-monitor' da login truoc do" -ForegroundColor Green
  } else {
    $qrPath = Join-Path $LISTENER_DIR "qr.png"
    $qrLog  = Join-Path $LISTENER_DIR "qr-login.log"
    Remove-Item $qrPath, $qrLog -ErrorAction SilentlyContinue

    # QUAN TRONG: KHONG dung --qr-base64 vi flag nay exit ngay sau khi emit QR -
    # credentials KHONG persist vao profile khi user quet xong. Dung --qr-path only
    # (process se cho user quet roi luu credentials moi exit).
    $loginArgs = @('--profile', 'zalo-monitor', 'auth', 'login', '--qr-path', $qrPath)
    $proc = Start-Process -FilePath $openzcaExe -ArgumentList $loginArgs -RedirectStandardOutput $qrLog -RedirectStandardError ($qrLog + '.err') -WindowStyle Hidden -PassThru

    # Cho file QR sinh ra (max 30s)
    $waited = 0
    while ($waited -lt 30) {
      Start-Sleep -Seconds 1; $waited++
      if (Test-Path $qrPath) { break }
    }

    # 1) Open file QR bang Photos viewer (Windows tu nhan)
    if (Test-Path $qrPath) {
      Start-Process $qrPath -ErrorAction SilentlyContinue
      Write-Host "  [+] Cua so QR da mo - quet bang Zalo dien thoai" -ForegroundColor Green

      # 2) Doc file PNG -> base64 -> push len web UI (de ca 2 cho cung hien QR)
      try {
        $bytes = [System.IO.File]::ReadAllBytes($qrPath)
        $b64 = [System.Convert]::ToBase64String($bytes)
        $qrDataUrl = "data:image/png;base64,$b64"
        $h = @{"Content-Type"="application/json"; "X-Tenant-Id"=$TENANT_ID; "X-Webhook-Secret"=$SECRET}
        $b = @{ dataUrl = $qrDataUrl } | ConvertTo-Json
        Invoke-WebRequest -Uri "$BACKEND_URL/api/setup/qr-push" -Method POST -Headers $h -Body $b -UseBasicParsing -TimeoutSec 10 | Out-Null
        Write-Host "  [+] QR cung hien tren dashboard" -ForegroundColor Green
      } catch {
        Write-Host "  WARN Khong push duoc QR len dashboard ($_)" -ForegroundColor Yellow
      }
    } else {
      Write-Host "  WARN Khong sinh duoc file QR. Co the openzca crash." -ForegroundColor Yellow
    }

    Write-Host ""
    Write-Host "  ==> Quet QR o BAT KY noi nao (Photos hoac Web Dashboard)" -ForegroundColor Cyan
    Write-Host "      Mo Zalo dien thoai -> Cai dat -> Thiet bi da dang nhap -> Them thiet bi" -ForegroundColor White
    Write-Host ""

    # Cho user quet QR (max 60s) - check process state thay vi spawn lai openzca
    Write-Host -NoNewline "  Cho quet QR"
    $loginOk = $false
    for ($i = 0; $i -lt 20; $i++) {
      Start-Sleep -Seconds 3
      Write-Host -NoNewline "."
      # openzca login process exit khi user quet xong (login complete) hoac timeout
      if ($proc.HasExited) {
        $loginOk = ($proc.ExitCode -eq 0)
        break
      }
    }
    Write-Host ""

    # Cleanup
    if ($proc -and -not $proc.HasExited) { $proc | Stop-Process -Force -ErrorAction SilentlyContinue }
    Remove-Item $qrPath, $qrLog, "($qrLog + '.err')" -ErrorAction SilentlyContinue

    if ($loginOk) {
      Write-Host "  OK Da quet QR thanh cong - Zalo da dang nhap" -ForegroundColor Green
    } else {
      Write-Host "  WARN Het 90s ma chua quet. Bo qua - service van chay, anh co the quet sau qua dashboard." -ForegroundColor Yellow
    }
  }
} else {
  Write-Host "  WARN openzca khong tim thay. Skip login." -ForegroundColor Yellow
}

# [6/6] Tao Scheduled Task de service tu chay
Write-Host "[6/6] Tao Scheduled Task..." -ForegroundColor Yellow
$psExe = (Get-Command powershell.exe).Source
$taskName = "ZaloMonitorListener"
$prevEAP = $ErrorActionPreference
$ErrorActionPreference = "Continue"
& cmd /c "schtasks /Delete /TN $taskName /F" 2>&1 | Out-Null
$action = '"' + $psExe + '" -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $wrapperPath + '"'
& cmd /c "schtasks /Create /TN $taskName /TR \`"$action\`" /SC ONLOGON /RL HIGHEST /F" 2>&1 | Out-Null
$createExit = $LASTEXITCODE
& cmd /c "schtasks /Run /TN $taskName" 2>&1 | Out-Null
$ErrorActionPreference = $prevEAP

# Test ket noi
try {
  $h = @{"Content-Type"="application/json";"X-Tenant-Id"=$TENANT_ID;"X-Webhook-Secret"=$SECRET}
  Invoke-WebRequest -Uri "$BACKEND_URL/api/setup/hook-test" -Method POST -Headers $h -Body '{}' -UseBasicParsing -TimeoutSec 10 | Out-Null
  Write-Host ""
  Write-Host "========================================" -ForegroundColor Green
  Write-Host "  OK Hoan tat - Listener dang chay ngam" -ForegroundColor Green
  Write-Host "  Mo dashboard: $DASHBOARD_URL/dashboard" -ForegroundColor White
  Write-Host "========================================" -ForegroundColor Green
} catch {
  Write-Host ""
  Write-Host "========================================" -ForegroundColor Red
  Write-Host "  X That bai: Khong ket noi duoc toi backend" -ForegroundColor Red
  Write-Host "  $DASHBOARD_URL/dashboard/settings/channels" -ForegroundColor Cyan
  Write-Host "========================================" -ForegroundColor Red
  exit 1
}
`
}

function generateLinuxInstaller(backendUrl: string, dashboardUrl: string, secret: string, tenantId: string, tenantName: string) {
  // Escape single quotes cho an toàn khi nhúng vào bash literals
  const safeTenantName = tenantName.replace(/'/g, "'\\''")
  return `#!/bin/bash
# Zalo Monitor — Listener Installer (Linux/Mac)
# Tenant: ${safeTenantName}
# Cài Node + openzca + zalo-listener.mjs + systemd user service
set -euo pipefail

TENANT_ID="${tenantId}"
BACKEND_URL="\${BACKEND_URL:-${backendUrl}}"
DASHBOARD_URL="${dashboardUrl}"
SECRET="${secret}"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  📦 Zalo Monitor Hook Installer"
echo "  Tenant : ${safeTenantName}"
echo "  Backend: $BACKEND_URL"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# ── Bước 1/5: Cài Node + npm nếu chưa có ────────
echo "[1/5] Kiểm tra Node.js..."
if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  echo "  ⚠️  Node.js chưa có, đang tự cài..."
  if command -v apt-get >/dev/null 2>&1; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - >/dev/null 2>&1 || true
    sudo apt-get install -y nodejs >/dev/null 2>&1 || true
  elif command -v yum >/dev/null 2>&1; then
    curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash - >/dev/null 2>&1 || true
    sudo yum install -y nodejs >/dev/null 2>&1 || true
  elif command -v apk >/dev/null 2>&1; then
    apk add --no-cache nodejs npm >/dev/null 2>&1 || sudo apk add --no-cache nodejs npm >/dev/null 2>&1 || true
  elif [ "$(uname)" = "Darwin" ]; then
    # macOS: tải tarball pre-built không cần sudo, lưu vào ~/.local + PATH
    if command -v brew >/dev/null 2>&1; then
      brew install node >/dev/null 2>&1 || true
    fi
    if ! command -v node >/dev/null 2>&1; then
      echo "  📥 Tải Node.js pre-built cho macOS (không cần sudo)..."
      NODE_VER="v20.18.1"
      MAC_ARCH="$(uname -m)"
      [ "$MAC_ARCH" = "x86_64" ] && MAC_ARCH="x64"
      [ "$MAC_ARCH" = "arm64" ] && MAC_ARCH="arm64"
      NODE_DIR="$HOME/.local/node-$NODE_VER-darwin-$MAC_ARCH"
      mkdir -p "$HOME/.local"
      curl -fsSL "https://nodejs.org/dist/$NODE_VER/node-$NODE_VER-darwin-$MAC_ARCH.tar.gz" \
        | tar -xzf - -C "$HOME/.local" 2>/dev/null || true
      if [ -x "$NODE_DIR/bin/node" ]; then
        export PATH="$NODE_DIR/bin:$PATH"
        # Thêm vào shell rc để mọi lần mở Terminal đều có
        SHELL_RC="$HOME/.zshrc"
        [ -f "$HOME/.bash_profile" ] && [ ! -f "$SHELL_RC" ] && SHELL_RC="$HOME/.bash_profile"
        if ! grep -q "node-$NODE_VER-darwin" "$SHELL_RC" 2>/dev/null; then
          echo "" >> "$SHELL_RC"
          echo "# Added by zalo-monitor installer" >> "$SHELL_RC"
          echo 'export PATH="'$NODE_DIR'/bin:$PATH"' >> "$SHELL_RC"
        fi
        echo "  ✅ Đã cài Node vào $NODE_DIR (no-sudo)"
      fi
    fi
  fi
  if ! command -v node >/dev/null 2>&1; then
    echo "  ❌ Không tự cài Node được."
    if [ "$(uname)" = "Darwin" ]; then
      echo "     Cài thủ công: tải pkg từ https://nodejs.org/en/download — chạy installer → mở Terminal mới → chạy lại lệnh này."
    else
      echo "     Cài thủ công: https://nodejs.org rồi chạy lại."
    fi
    exit 1
  fi
fi
echo "  ✅ node $(node -v), npm $(npm -v)"

# ── Bước 2/5: Cài openzca CLI (nếu chưa có) ─────
echo "[2/5] Kiểm tra openzca..."
if ! command -v openzca >/dev/null 2>&1; then
  echo "  📥 Đang cài openzca (npm install -g openzca)..."
  npm install -g openzca >/dev/null 2>&1 || sudo npm install -g openzca >/dev/null 2>&1 || {
    echo "  ❌ Cài openzca thất bại. Thử thủ công: sudo npm install -g openzca"
    exit 1
  }
fi
echo "  ✅ openzca: $(openzca --version 2>/dev/null || echo installed)"

# ── Bước 3/5: Tải zalo-listener.mjs ─────────────
echo "[3/5] Tải zalo-listener.mjs..."
LISTENER_DIR="$HOME/.zalo-monitor"
mkdir -p "$LISTENER_DIR"
curl -fsSL --connect-timeout 10 "$BACKEND_URL/api/setup/hook-files/zalo-listener.mjs" -o "$LISTENER_DIR/zalo-listener.mjs" \\
  && echo "  ✅ zalo-listener.mjs" \\
  || { echo "  ❌ Tải zalo-listener.mjs thất bại"; exit 1; }
chmod +x "$LISTENER_DIR/zalo-listener.mjs"

# Ghi env file riêng cho listener service
# PROFILE=zalo-monitor — tránh xung đột với OpenClaw của khách (default profile)
cat > "$LISTENER_DIR/.env" <<EOF
BACKEND_URL=$BACKEND_URL
WEBHOOK_SECRET=$SECRET
TENANT_ID=$TENANT_ID
PROFILE=zalo-monitor
EOF
chmod 600 "$LISTENER_DIR/.env"

# Login Zalo cho profile RIÊNG (không đụng OpenClaw default)
echo ""
echo "📱 Đăng nhập Zalo cho profile 'zalo-monitor' (KHÔNG đụng OpenClaw của bạn)..."
if ! openzca --profile zalo-monitor auth status >/dev/null 2>&1; then
  echo "  ℹ️  Profile 'zalo-monitor' chưa login. Hãy chạy lệnh sau để scan QR:"
  echo ""
  echo "     openzca --profile zalo-monitor auth login"
  echo ""
  echo "  → QR sẽ hiện trong terminal. Quét bằng Zalo điện thoại (chọn 'Thêm thiết bị')."
  echo "  → Listener tự kết nối khi profile login xong."
else
  echo "  ✅ Profile 'zalo-monitor' đã login — listener sẽ tự nhận messages"
fi

# ── Bước 4.7: Tạo systemd user service zalo-monitor-listener ────
NODE_BIN="$(command -v node || echo /usr/bin/node)"
if command -v systemctl >/dev/null 2>&1; then
  SVC_DIR="$HOME/.config/systemd/user"
  mkdir -p "$SVC_DIR"
  cat > "$SVC_DIR/zalo-monitor-listener.service" <<EOF
[Unit]
Description=Zalo Monitor Listener (openzca → backend webhook)
After=network.target

[Service]
Type=simple
EnvironmentFile=$LISTENER_DIR/.env
ExecStart=$NODE_BIN $LISTENER_DIR/zalo-listener.mjs
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=default.target
EOF
  systemctl --user daemon-reload
  systemctl --user enable --now zalo-monitor-listener.service 2>&1 | tail -3
  if systemctl --user is-active zalo-monitor-listener >/dev/null 2>&1; then
    echo "  ✅ Service zalo-monitor-listener đang chạy"
  else
    echo "  ⚠️  Service chưa active. Check log: journalctl --user -u zalo-monitor-listener -n 30"
  fi
elif [ "$(uname)" = "Darwin" ]; then
  # macOS: dùng launchd (systemd alternative). Service tự khởi động khi user login.
  PLIST_DIR="$HOME/Library/LaunchAgents"
  PLIST="$PLIST_DIR/com.datthongdong.zalo-monitor-listener.plist"
  mkdir -p "$PLIST_DIR"
  cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.datthongdong.zalo-monitor-listener</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE_BIN</string>
    <string>$LISTENER_DIR/zalo-listener.mjs</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>BACKEND_URL</key><string>$BACKEND_URL</string>
    <key>WEBHOOK_SECRET</key><string>$SECRET</string>
    <key>TENANT_ID</key><string>$TENANT_ID</string>
    <key>PROFILE</key><string>zalo-monitor</string>
    <key>PATH</key><string>/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:$HOME/.local/node-v20.18.1-darwin-arm64/bin:$HOME/.local/node-v20.18.1-darwin-x64/bin</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$LISTENER_DIR/listener.log</string>
  <key>StandardErrorPath</key><string>$LISTENER_DIR/listener.err</string>
</dict>
</plist>
EOF
  # Unload nếu đã có (tránh xung đột)
  launchctl unload "$PLIST" 2>/dev/null || true
  launchctl load "$PLIST" 2>&1 | head -3
  sleep 2
  if launchctl list | grep -q "com.datthongdong.zalo-monitor-listener"; then
    echo "  ✅ launchd service đang chạy (tự khởi động khi login Mac)"
  else
    echo "  ⚠️  Service chưa load được. Check log: tail $LISTENER_DIR/listener.err"
  fi
else
  echo "  ℹ️  Không tìm thấy systemd/launchd. Chạy thủ công:"
  echo "     BACKEND_URL=$BACKEND_URL WEBHOOK_SECRET=$SECRET TENANT_ID=$TENANT_ID node $LISTENER_DIR/zalo-listener.mjs"
fi

# ── Bước 5/5: Test kết nối ──────────────────────
echo "[5/5] Kiểm tra kết nối tới backend... (tối đa 10 giây)"
TEST_STATUS=$(curl -fsS --connect-timeout 10 --max-time 10 \\
  -o /tmp/zm-test.out -w "%{http_code}" \\
  -X POST "$BACKEND_URL/api/setup/hook-test" \\
  -H "Content-Type: application/json" \\
  -H "X-Tenant-Id: $TENANT_ID" \\
  -H "X-Webhook-Secret: $SECRET" \\
  -d '{}' 2>/dev/null || echo "000")

echo ""
if [ "$TEST_STATUS" = "200" ]; then
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  ✅ Hook đã cài và kết nối với dashboard"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""
  echo "  ✅ Listener đã cài + đang chạy ngầm."
  echo ""
  echo "  📱 Bước cuối — đăng nhập Zalo (1 lần):"
  echo "     1. Mở dashboard: $DASHBOARD_URL/dashboard/settings/channels"
  echo "     2. Bấm nút [Kết nối lại] / [Đổi tài khoản] → QR sẽ hiện ngay trên web"
  echo "     3. Mở Zalo điện thoại → Cài đặt → Thiết bị đã đăng nhập → Thêm thiết bị → quét"
  echo ""
  echo "  Sau khi quét: tin nhắn tự về dashboard."
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
elif [ "$TEST_STATUS" = "401" ]; then
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  ❌ Bước 5 thất bại: Secret không hợp lệ (HTTP 401)"
  echo "     → Lấy lại lệnh cài mới nhất từ dashboard rồi chạy lại."
  echo "  🔗 $DASHBOARD_URL/dashboard/settings/channels"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  exit 1
elif [ "$TEST_STATUS" = "000" ]; then
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  ❌ Bước 5 thất bại: Không kết nối được tới backend"
  echo "     → Kiểm tra firewall, domain, và backend có đang chạy không."
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  exit 1
else
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  ⚠️  Bước 5: Backend trả HTTP $TEST_STATUS"
  cat /tmp/zm-test.out 2>/dev/null || true
  echo "     Hook files đã cài nhưng chưa xác nhận kết nối."
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
fi
echo ""
`
}
