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
export function queueAction(tenantId: string, action: string) {
  if (!pendingActions.has(tenantId)) pendingActions.set(tenantId, new Set())
  pendingActions.get(tenantId)!.add(action)
  // Auto cleanup sau 5 phút (phòng hook offline, không xử lý)
  setTimeout(() => pendingActions.get(tenantId)?.delete(action), 5 * 60 * 1000)
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
      // Chạy trực tiếp trên máy cài OpenClaw (host mode)
      oneLineCommand: `curl -fsSL "${backendUrl}/api/setup/inject.sh?${qs}" | bash`,
      // OpenClaw chạy trong Docker — exec vào container openclaw
      dockerCommand: `docker exec openclaw bash -c 'curl -fsSL "${backendUrl}/api/setup/inject.sh?${qs}" | bash'`,
      // Windows PowerShell
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
    return generateOpenClawHookInstaller(backendUrl, dashboardUrl, secret, tenantId, displayName)
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
    const allowlist = new Set(['HOOK.md', 'handler.ts', 'zalo-history-push.mjs'])
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
  app.get('/pending-sends', async (req, reply) => {
    const secret = req.headers['x-webhook-secret'] as string
    if (!secret) return reply.status(401).send({ error: 'Missing secret' })
    const tenant = await db.tenant.findFirst({ where: { webhookSecret: secret } })
    if (!tenant) return reply.status(403).send({ error: 'Invalid secret' })
    const pending = await db.sendQueue.findMany({
      where: { tenantId: tenant.id, status: 'pending' },
      orderBy: { createdAt: 'asc' },
      take: 20,
      select: { id: true, groupExternalId: true, text: true },
    })
    return pending
  })

  // POST /api/setup/ack-send — hook reports send result
  app.post('/ack-send', async (req, reply) => {
    const secret = req.headers['x-webhook-secret'] as string
    if (!secret) return reply.status(401).send({ error: 'Missing secret' })
    const { id, status } = req.body as { id: string; status: 'sent' | 'failed' }
    const tenant = await db.tenant.findFirst({ where: { webhookSecret: secret } })
    if (!tenant) return reply.status(403).send({ error: 'Invalid secret' })
    await db.sendQueue.update({ where: { id, tenantId: tenant.id }, data: { status } })
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
  app.get('/pending-actions', async (req, reply) => {
    const secret = req.headers['x-webhook-secret'] as string
    if (!secret) return reply.status(401).send({ error: 'Missing secret' })
    const tenant = await db.tenant.findFirst({ where: { webhookSecret: secret } })
    if (!tenant) return reply.status(403).send({ error: 'Invalid secret' })
    // Hook đang poll → cập nhật ping để dashboard biết hook còn sống
    hookPings.set(tenant.id, Date.now())
    const set = pendingActions.get(tenant.id)
    const actions = set ? Array.from(set) : []
    if (set) set.clear() // consume — hook đã nhận, không gửi lại
    return { actions }
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
  return `# Zalo Monitor Hook Installer for Windows (PowerShell)
# Run: iwr -useb "${backendUrl}/api/setup/inject.ps1?tenantId=${tenantId}" | iex
$ErrorActionPreference = "Stop"
$BACKEND_URL = "${backendUrl}"
$TENANT_ID   = "${tenantId}"
$SECRET      = "${secret}"
$DISPLAY_NAME = "${displayName}"
$DASHBOARD_URL = "${dashboardUrl}"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Zalo Monitor Hook Installer (Windows)" -ForegroundColor Cyan
Write-Host "  Tenant : $DISPLAY_NAME" -ForegroundColor White
Write-Host "  Backend: $BACKEND_URL" -ForegroundColor White
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# [1/5] Check / auto-install Node.js
Write-Host "[1/5] Kiem tra Node.js..." -ForegroundColor Yellow
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host "  Node.js chua cai. Dang tu dong cai dat..." -ForegroundColor Yellow
  $node_ok = $false
  # Try winget (Windows 10 1709+)
  if (Get-Command winget -ErrorAction SilentlyContinue) {
    Write-Host "  Dang cai qua winget (vui long doi ~60 giay)..." -ForegroundColor White
    winget install OpenJS.NodeJS.LTS --silent --accept-package-agreements --accept-source-agreements 2>&1 | Out-Null
    # Refresh PATH
    $env:PATH = [System.Environment]::GetEnvironmentVariable("PATH","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("PATH","User")
    if (Get-Command node -ErrorAction SilentlyContinue) { $node_ok = $true }
  }
  if (-not $node_ok) {
    Write-Host "  Khong the tu dong cai Node.js. Tai tai: https://nodejs.org" -ForegroundColor Red
    Write-Host "  Sau khi cai xong, khoi dong lai PowerShell roi chay lai lenh nay." -ForegroundColor White
    exit 1
  }
  Write-Host "  OK Node.js da cai xong" -ForegroundColor Green
}
Write-Host "  OK Node.js $(node --version)" -ForegroundColor Green

# [2/5] Check / install OpenClaw
Write-Host "[2/5] Kiem tra OpenClaw..." -ForegroundColor Yellow
$openclaw_dir = $null

# Scan common install paths first
$oc_candidates = @(
  (Join-Path $env:USERPROFILE ".openclaw"),
  (Join-Path $env:APPDATA "openclaw"),
  "C:\\openclaw\\.openclaw",
  "C:\\Program Files\\openclaw\\.openclaw",
  "C:\\Program Files (x86)\\openclaw\\.openclaw"
)
foreach ($c in $oc_candidates) {
  if ($c -and (Test-Path $c)) { $openclaw_dir = $c; break }
}

if (-not $openclaw_dir) {
  Write-Host "  Chua tim thay thu muc OpenClaw." -ForegroundColor Yellow
  Write-Host "  OpenClaw la nen tang chay hook Zalo Monitor (cau noi doc va forward tin Zalo)." -ForegroundColor White
  Write-Host ""
  $install_oc = Read-Host "  Cai OpenClaw ngay tren may nay? [Y/n]"
  if ($install_oc -ne 'n' -and $install_oc -ne 'N') {
    Write-Host "  Dang cai openclaw (vui long doi ~60 giay)..." -ForegroundColor White
    npm install -g "openclaw" 2>&1
    Write-Host "  Dang khoi tao config..." -ForegroundColor White
    try { openclaw init --yes 2>&1 | Out-Null } catch {}
    # Refresh PATH
    $env:PATH = [System.Environment]::GetEnvironmentVariable("PATH","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("PATH","User")
    foreach ($c in @((Join-Path $env:USERPROFILE ".openclaw"), (Join-Path $env:APPDATA "openclaw"))) {
      if ($c -and (Test-Path $c)) { $openclaw_dir = $c; break }
    }
    if (-not $openclaw_dir) {
      Write-Host "  Cai xong nhung khong tim thay config. Thu chay: openclaw init" -ForegroundColor Red; exit 1
    }
    Write-Host "  OK Cai xong: $openclaw_dir" -ForegroundColor Green
  } else {
    Write-Host "  Tim kiem them tren may..." -ForegroundColor White
    # Deeper scan: all user profile dirs
    $user_roots = @($env:USERPROFILE, $env:APPDATA, $env:LOCALAPPDATA) | Where-Object { $_ }
    foreach ($root in $user_roots) {
      $p = Join-Path $root ".openclaw"
      if (Test-Path $p) { $openclaw_dir = $p; break }
    }
    if (-not $openclaw_dir) {
      Write-Host ""
      $manual = Read-Host "  Nhap duong dan thu muc .openclaw (Enter de bo qua)"
      if ($manual -and (Test-Path $manual)) {
        $openclaw_dir = $manual
        Write-Host "  OK Dung: $openclaw_dir" -ForegroundColor Green
      } else {
        Write-Host "  Cai thu cong: npm install -g openclaw && openclaw onboard --install-daemon" -ForegroundColor Yellow
        Write-Host "  Huong dan: $DASHBOARD_URL/docs/install-zalo" -ForegroundColor Cyan
        exit 0
      }
    } else {
      Write-Host "  OK Tim thay: $openclaw_dir" -ForegroundColor Green
    }
  }
}
Write-Host "  OK OpenClaw: $openclaw_dir" -ForegroundColor Green

try {
  $zalo_info = & openzca --profile default auth status 2>&1
  Write-Host "  Zalo: $zalo_info" -ForegroundColor Green
} catch {
  Write-Host "  Zalo: chua dang nhap (se hien QR sau khi cai)" -ForegroundColor Yellow
}

# [3/5] Download hook files
Write-Host "[3/5] Tai hook files..." -ForegroundColor Yellow
$hook_dir = Join-Path $openclaw_dir "hooks" | Join-Path -ChildPath "zalo-monitor"
New-Item -ItemType Directory -Force -Path $hook_dir | Out-Null
foreach ($f in @("HOOK.md","handler.ts")) {
  Invoke-WebRequest -Uri "$BACKEND_URL/api/setup/hook-files/$f" -OutFile (Join-Path $hook_dir $f) -UseBasicParsing
  Write-Host "  OK $f" -ForegroundColor Green
}

# [4/5] Write config
Write-Host "[4/5] Ghi config..." -ForegroundColor Yellow
$env_file = Join-Path $hook_dir ".env"
Set-Content -Path $env_file -Value "BACKEND_URL=$BACKEND_URL\`nWEBHOOK_SECRET=$SECRET\`nTENANT_ID=$TENANT_ID" -Encoding UTF8
Write-Host "  OK .env da ghi: $env_file" -ForegroundColor Green

try {
  & openclaw hooks enable zalo-monitor 2>&1 | Out-Null
  Write-Host "  OK Hook enabled" -ForegroundColor Green
} catch {
  Write-Host "  Hook se tu load khi OpenClaw khoi dong lai" -ForegroundColor Yellow
}

# [4.5] Kiem tra / khoi dong OpenClaw gateway — SAU KHI hook files da co mat
Write-Host ""
Write-Host "[4.5] Kiem tra OpenClaw gateway..." -ForegroundColor Yellow
$gateway_running = $false
try {
  $r = Invoke-WebRequest "http://localhost:18789/__openclaw__/canvas/" -UseBasicParsing -TimeoutSec 3 -ErrorAction Stop
  $gateway_running = $true
} catch {}
if (-not $gateway_running) {
  $gateway_running = [bool](Get-Process -Name "openclaw","node" -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like "*openclaw*" })
}

if (Get-Command openclaw -ErrorAction SilentlyContinue) {
  if ($gateway_running) {
    Write-Host "  Gateway dang chay — restart de load hook moi..." -ForegroundColor White
    # Try service restart
    $svc = Get-Service -Name "openclaw" -ErrorAction SilentlyContinue
    if ($svc) {
      Restart-Service -Name "openclaw" -Force 2>&1 | Out-Null
      Write-Host "  OK Gateway restarted (Windows Service)" -ForegroundColor Green
    } else {
      # Fallback: kill and restart via onboard
      Get-Process -Name "node" -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like "*openclaw*" } | Stop-Process -Force -ErrorAction SilentlyContinue
      Start-Sleep -Seconds 2
      $daemon_job = Start-Job { openclaw onboard --install-daemon 2>&1 }
      Wait-Job $daemon_job -Timeout 30 | Out-Null
      Remove-Job $daemon_job -Force 2>&1 | Out-Null
      Write-Host "  OK Gateway restarted" -ForegroundColor Green
    }
  } else {
    Write-Host "  Khoi dong OpenClaw daemon..." -ForegroundColor White
    Write-Host "  (Lenh: openclaw onboard --install-daemon)" -ForegroundColor Gray
    $daemon_job = Start-Job { openclaw onboard --install-daemon 2>&1 }
    if (Wait-Job $daemon_job -Timeout 60) {
      Write-Host "  OK OpenClaw daemon da chay — hook duoc load tu dong" -ForegroundColor Green
    } else {
      Stop-Job $daemon_job
      Write-Host "  Khong tu khoi dong duoc. Chay thu cong:" -ForegroundColor Yellow
      Write-Host ""
      Write-Host "     openclaw onboard --install-daemon" -ForegroundColor Cyan
      Write-Host ""
      Write-Host "  Huong dan: https://docs.openclaw.ai/start/getting-started" -ForegroundColor White
      Write-Host ""
    }
    Remove-Job $daemon_job -Force 2>&1 | Out-Null
  }
} else {
  Write-Host "  Lenh openclaw chua co trong PATH. Chay thu cong:" -ForegroundColor Yellow
  Write-Host ""
  Write-Host "     openclaw onboard --install-daemon" -ForegroundColor Cyan
  Write-Host ""
  Write-Host "  Huong dan: https://docs.openclaw.ai/start/getting-started" -ForegroundColor White
  Write-Host ""
}

# [5/5] Test connection
Write-Host "[5/5] Kiem tra ket noi toi backend... (toi da 10 giay)" -ForegroundColor Yellow
try {
  $headers = @{"Content-Type"="application/json";"X-Tenant-Id"=$TENANT_ID;"X-Webhook-Secret"=$SECRET}
  $resp = Invoke-WebRequest -Uri "$BACKEND_URL/api/setup/hook-test" -Method POST -Headers $headers -Body '{}' -UseBasicParsing -TimeoutSec 10
  if ($resp.StatusCode -eq 200) {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "  OK Hook da cai va ket noi voi dashboard" -ForegroundColor Green
    Write-Host ""

    # Check Zalo login
    $logged_in = $false
    try { & openzca --profile default auth status 2>&1 | Out-Null; if ($LASTEXITCODE -eq 0) { $logged_in = $true } } catch {}

    if ($logged_in) {
      Write-Host "  OK Zalo da dang nhap - san sang theo doi nhom!" -ForegroundColor Green
      Write-Host ""
      Write-Host "  Mo dashboard:" -ForegroundColor Cyan
      Write-Host "  $DASHBOARD_URL/dashboard" -ForegroundColor White
    } else {
      Write-Host "  [!] Buoc cuoi: Dang nhap Zalo (quet QR)" -ForegroundColor Yellow
      Write-Host ""
      Write-Host "  +------------------------------------------+" -ForegroundColor Cyan
      Write-Host "  |  Mo san Zalo tren dien thoai truoc khi   |" -ForegroundColor Cyan
      Write-Host "  |  nhan Y -- QR chi hieu luc ~60 giay      |" -ForegroundColor Cyan
      Write-Host "  +------------------------------------------+" -ForegroundColor Cyan
      Write-Host ""
      $qr_confirm = Read-Host "  Da mo Zalo tren dien thoai, san sang quet? [Y/n]"
      if ($qr_confirm -eq 'n' -or $qr_confirm -eq 'N') {
        Write-Host ""
        Write-Host "  OK - mo Zalo roi vao day de quet:" -ForegroundColor White
        Write-Host "  $DASHBOARD_URL/dashboard/settings/channels" -ForegroundColor Cyan
      } else {
      Write-Host ""
      Write-Host "  Dang chuan bi QR..." -ForegroundColor White
      # Look for QR file
      $qr_paths = @(
        "$env:USERPROFILE\\qr.png",
        (Join-Path $env:USERPROFILE ".openclaw\\qr.png"),
        "$env:APPDATA\\openclaw\\qr.png"
      )
      $qr_found = $false
      foreach ($qr in $qr_paths) {
        if (Test-Path $qr) {
          Write-Host "  Tim thay QR: $qr" -ForegroundColor Green
          Write-Host "  Dang mo anh QR..." -ForegroundColor White
          Start-Process $qr
          $qr_found = $true
          break
        }
      }
      if (-not $qr_found) {
        Write-Host "  Cach 1 - Mo OpenClaw Canvas de quet QR:" -ForegroundColor White
        Write-Host "  http://localhost:18789/__openclaw__/canvas/" -ForegroundColor Cyan
        $open_browser = Read-Host "  Mo ngay trong trinh duyet? (Y/n)"
        if ($open_browser -ne 'n' -and $open_browser -ne 'N') {
          Start-Process "http://localhost:18789/__openclaw__/canvas/"
        }
        Write-Host ""
        Write-Host "  Cach 2 - Quet qua dashboard:" -ForegroundColor White
        Write-Host "  $DASHBOARD_URL/dashboard/settings/channels" -ForegroundColor Cyan
      }
      Write-Host ""
      Write-Host "  Sau khi quet: dashboard tu cap nhat OK" -ForegroundColor Yellow
      } # end qr_confirm check
    }
    Write-Host "========================================" -ForegroundColor Green
  }
} catch {
  $status = $_.Exception.Response.StatusCode.value__
  Write-Host ""
  Write-Host "========================================" -ForegroundColor Red
  if ($status -eq 401) {
    Write-Host "  X Buoc 5 that bai: Secret khong hop le (HTTP 401)" -ForegroundColor Red
    Write-Host "    -> Lay lai lenh cai moi nhat tu dashboard roi chay lai." -ForegroundColor White
  } else {
    Write-Host "  X Buoc 5 that bai: Khong ket noi duoc toi backend" -ForegroundColor Red
    Write-Host "    -> Kiem tra firewall, domain, va backend co dang chay khong." -ForegroundColor White
  }
  Write-Host "  $DASHBOARD_URL/dashboard/settings/channels" -ForegroundColor Cyan
  Write-Host "========================================" -ForegroundColor Red
  exit 1
}
Write-Host ""
`
}

function generateOpenClawHookInstaller(backendUrl: string, dashboardUrl: string, secret: string, tenantId: string, tenantName: string) {
  // Escape single quotes cho an toàn khi nhúng vào bash literals
  const safeTenantName = tenantName.replace(/'/g, "'\\''")
  return `#!/bin/bash
# Zalo Monitor — OpenClaw Hook Installer
# Tenant: ${safeTenantName}
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

# ── Bước 1/5: Kiểm tra phụ thuộc ────────────────
echo "[1/5] Kiểm tra phụ thuộc..."
for cmd in curl; do
  command -v "$cmd" >/dev/null 2>&1 || { echo "  ❌ Thiếu lệnh: $cmd"; exit 1; }
done
echo "  ✅ OK"

# ── Bước 2/5: Kiểm tra & cài OpenClaw ───────────
echo "[2/5] Kiểm tra OpenClaw..."

# Nếu có OPENCLAW_DIR từ env thì dùng luôn
OPENCLAW_DIR="\${OPENCLAW_DIR:-}"

# (không gọi openclaw CLI để detect path — lệnh không chuẩn, dễ hang)

if [ -z "$OPENCLAW_DIR" ]; then
  # Quét các vị trí phổ biến + tất cả home dirs
  CANDIDATES=(
    "$HOME/.openclaw"
    "/root/.openclaw"
    "/home/openclaw/.openclaw"
    "/opt/openclaw/.openclaw"
    "/var/lib/openclaw/.openclaw"
  )
  # Thêm tất cả user home dirs trên hệ thống
  while IFS=: read -r _ _ _ _ _ homedir _; do
    [ -d "\${homedir:-}/.openclaw" ] && CANDIDATES+=("$homedir/.openclaw")
  done < /etc/passwd 2>/dev/null || true

  for dir in "\${CANDIDATES[@]}"; do
    if [ -d "\${dir:-}" ]; then OPENCLAW_DIR="$dir"; break; fi
  done
fi

if [ -z "$OPENCLAW_DIR" ]; then
  echo "  ⚠️  Không tìm thấy OpenClaw trên máy này."
  echo ""

  if command -v npm >/dev/null 2>&1; then
    echo "  ℹ️  OpenClaw là nền tảng chạy hook Zalo Monitor (cầu nối đọc & forward tin nhắn từ Zalo)."
    printf "  ❓ Cài OpenClaw ngay trên máy này không? [Y/n] "
    read -r CONFIRM_INSTALL </dev/tty
    if [ "\${CONFIRM_INSTALL,,}" != "n" ] && [ "\${CONFIRM_INSTALL,,}" != "no" ]; then
      echo "  📥 Đang cài OpenClaw (vui lòng đợi ~60 giây)..."
      npm install -g openclaw
      echo "  🔧 Đang khởi tạo config..."
      openclaw init --yes 2>/dev/null || true
      for dir in "$HOME/.openclaw" "/root/.openclaw"; do
        [ -d "$dir" ] && { OPENCLAW_DIR="$dir"; break; }
      done
      if [ -n "$OPENCLAW_DIR" ]; then
        echo "  ✅ Cài xong: $OPENCLAW_DIR"
      else
        echo "  ❌ Cài xong nhưng không tìm thấy config. Thử chạy: openclaw init"
        exit 1
      fi
    else
      echo ""
      echo "  Nếu OpenClaw đã cài ở chỗ khác, nhập đường dẫn thư mục .openclaw:"
      echo "     (Ví dụ: /home/myuser/.openclaw — Enter để thoát)"
      printf "  Đường dẫn: "
      read -r MANUAL_DIR </dev/tty
      if [ -n "$MANUAL_DIR" ] && [ -d "$MANUAL_DIR" ]; then
        OPENCLAW_DIR="$MANUAL_DIR"
        echo "  ✅ Dùng: $OPENCLAW_DIR"
      else
        echo ""
        echo "  Cài thủ công rồi chạy lại script này:"
        echo "     npm install -g openclaw && openclaw onboard --install-daemon"
        echo "  Hướng dẫn: $DASHBOARD_URL/docs/install-zalo"
        exit 0
      fi
    fi
  else
    echo "  Cài Node.js + OpenClaw rồi chạy lại:"
    echo "     curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -"
    echo "     sudo apt install -y nodejs"
    echo "     npm install -g openclaw && openclaw onboard --install-daemon"
    echo "  Hướng dẫn: $DASHBOARD_URL/docs/install-zalo"
    exit 0
  fi
fi
echo "  ✅ OpenClaw: $OPENCLAW_DIR"

# ⚠️  Docker warning
if [ -f /proc/1/cgroup ] && grep -q "docker\\|containerd\\|kubepods" /proc/1/cgroup 2>/dev/null; then
  if ! mount | grep -q "$OPENCLAW_DIR" 2>/dev/null; then
    echo "  ⚠️  Đang chạy trong Docker — hook sẽ MẤT khi recreate nếu chưa mount volume."
  fi
fi

# Detect tài khoản đang login trong OpenClaw
CONFIG_FILE="$OPENCLAW_DIR/openclaw.json"
ZALO_FOUND=false

if [ -f "$CONFIG_FILE" ] && command -v python3 >/dev/null 2>&1; then
  python3 - "$CONFIG_FILE" "$OPENCLAW_DIR" <<'PYEOF'
import json, sys, os, glob, re

cfg_file  = sys.argv[1]
oclaw_dir = sys.argv[2]

try:
  cfg = json.load(open(cfg_file))
except:
  sys.exit(0)

channels = cfg.get('channels', {})

# ── Zalo ────────────────────────────────────────
oz = channels.get('openzalo', {})
if oz:
  enabled = oz.get('enabled', True)
  status_icon = '✅' if enabled else '⏸ '
  # Lấy danh sách profiles để tìm tài khoản đang login
  accounts = oz.get('accounts', {})
  profiles_to_check = []
  if accounts:
    for acc_id, acc_cfg in accounts.items():
      profiles_to_check.append((acc_id, acc_cfg.get('profile', 'default')))
  else:
    profiles_to_check = [('default', oz.get('profile', 'default'))]

  print('')
  print('  📱 Zalo:')
  zca_bin = oz.get('zcaBinary') or 'openzca'
  for acc_id, profile_name in profiles_to_check:
    # Ưu tiên: gọi `openzca auth status --json` để lấy session HIỆN TẠI (không cache)
    name, phone, logged_in = '', '', False
    try:
      import subprocess
      result = subprocess.run(
        [zca_bin, '--profile', profile_name, 'auth', 'status'],
        capture_output=True, text=True, timeout=5
      )
      out = (result.stdout or '') + (result.stderr or '')
      # openzca trả output dạng: { profile: 'default', loggedIn: true, userId: '...', displayName: '...' }
      m_logged = re.search(r"loggedIn:\s*true", out)
      m_name = re.search(r"displayName:\s*['\"]?([^'\"\n,}]+)", out)
      if m_logged:
        logged_in = True
        if m_name: name = m_name.group(1).strip()
    except: pass

    label = f'profile:{profile_name}'
    if name:  label = name
    state = 'đang bật' if (logged_in and enabled) else 'CHƯA login' if not logged_in else 'tắt'
    print(f'  {status_icon} {label} — {state}')

# ── Telegram ────────────────────────────────────
tg = channels.get('telegram', {})
if tg and tg.get('botToken'):
  token   = tg['botToken']
  enabled = tg.get('enabled', True)
  status_icon = '✅' if enabled else '⏸ '
  # Gọi Telegram API lấy tên bot
  try:
    import urllib.request
    resp = urllib.request.urlopen(
      f'https://api.telegram.org/bot{token}/getMe', timeout=5)
    data = json.loads(resp.read())
    bot  = data.get('result', {})
    uname = bot.get('username', '')
    bname = bot.get('first_name', '')
    label = f'@{uname}' if uname else bname or 'Telegram bot'
    state = 'đang bật' if enabled else 'tắt'
    print(f'')
    print(f'  ✈️  Telegram:')
    print(f'  {status_icon} {label} — {state}')
  except:
    print(f'')
    print(f'  ✈️  Telegram: đã cấu hình (không lấy được tên bot)')
PYEOF
fi
echo ""

HOOK_DIR="$OPENCLAW_DIR/hooks/zalo-monitor"
mkdir -p "$HOOK_DIR"

# ── Bước 3/5: Tải hook files ────────────────────
echo "[3/5] Tải hook files về $HOOK_DIR ..."
curl -fsSL --connect-timeout 10 "$BACKEND_URL/api/setup/hook-files/HOOK.md"    -o "$HOOK_DIR/HOOK.md"    && echo "  ✅ HOOK.md"    || { echo "  ❌ Tải HOOK.md thất bại"; exit 1; }
curl -fsSL --connect-timeout 10 "$BACKEND_URL/api/setup/hook-files/handler.ts" -o "$HOOK_DIR/handler.ts" && echo "  ✅ handler.ts" || { echo "  ❌ Tải handler.ts thất bại"; exit 1; }

# ── Bước 4/5: Ghi config ────────────────────────
echo "[4/5] Ghi config..."
cat > "$HOOK_DIR/.env" <<EOF
BACKEND_URL=$BACKEND_URL
WEBHOOK_SECRET=$SECRET
TENANT_ID=$TENANT_ID
EOF
chmod 600 "$HOOK_DIR/.env"
echo "  ✅ .env đã ghi (mode 600)"

if command -v openclaw >/dev/null 2>&1; then
  timeout 5 openclaw hooks enable zalo-monitor >/dev/null 2>&1 && echo "  ✅ Hook enabled (openclaw CLI)" || echo "  ℹ️  Hook sẽ tự load khi OpenClaw khởi động lại"
else
  echo "  ℹ️  openclaw CLI không tìm thấy — hook sẽ tự load khi OpenClaw khởi động"
fi

# Set channels.openzalo.groupPolicy=open để OpenClaw không block group messages
OC_CONFIG="$OPENCLAW_DIR/openclaw.json"
if [ -f "$OC_CONFIG" ] && command -v python3 >/dev/null 2>&1; then
  python3 - "$OC_CONFIG" <<'PYEOF' && echo "  ✅ Cấu hình OpenClaw: nhận tất cả tin nhóm (không cần @mention)"
import json, sys
p = sys.argv[1]
with open(p) as f: d = json.load(f)
oz = d.setdefault('channels', {}).setdefault('openzalo', {})
oz['groupPolicy'] = 'open'
oz.setdefault('groups', {})['*'] = {'requireMention': False}
with open(p, 'w') as f: json.dump(d, f, indent=2)
PYEOF
fi

# ── Khởi động / restart OpenClaw gateway (SAU KHI hook files đã có) ────
echo ""
echo "[4.5] Kiểm tra OpenClaw gateway..."
GATEWAY_RUNNING=false
if curl -sf "http://localhost:18789/__openclaw__/canvas/" >/dev/null 2>&1 || \
   pgrep -f "openclaw" >/dev/null 2>&1; then
  GATEWAY_RUNNING=true
fi

if command -v openclaw >/dev/null 2>&1; then
  if [ "$GATEWAY_RUNNING" = "true" ]; then
    echo "  ℹ️  Gateway đang chạy — restart để load hook mới..."
    # Thử platform-specific restart
    if command -v systemctl >/dev/null 2>&1 && systemctl --user is-active openclaw >/dev/null 2>&1; then
      systemctl --user restart openclaw && echo "  ✅ Gateway restarted (systemd)" || true
    elif command -v launchctl >/dev/null 2>&1; then
      launchctl kickstart -k "gui/$(id -u)/com.openclaw.gateway" 2>/dev/null \
        && echo "  ✅ Gateway restarted (launchd)" \
        || { pkill -HUP openclaw 2>/dev/null && echo "  ✅ Gateway reload (SIGHUP)"; } \
        || true
    else
      pkill -HUP openclaw 2>/dev/null && echo "  ✅ Gateway reload (SIGHUP)" || true
    fi
  else
    echo "  🚀 Khởi động OpenClaw daemon..."
    echo "     (Lệnh: openclaw onboard --install-daemon)"
    if timeout 60 openclaw onboard --install-daemon 2>/dev/null; then
      echo "  ✅ OpenClaw daemon đã chạy — hook được load tự động"
    else
      echo "  ⚠️  Không tự khởi động được. Chạy thủ công:"
      echo ""
      echo "     openclaw onboard --install-daemon"
      echo ""
      echo "  📖 Hướng dẫn: https://docs.openclaw.ai/start/getting-started"
      echo ""
    fi
  fi
else
  echo "  ⚠️  Lệnh openclaw không tìm thấy trong PATH. Chạy thủ công:"
  echo ""
  echo "     openclaw onboard --install-daemon"
  echo ""
  echo "  📖 Hướng dẫn: https://docs.openclaw.ai/start/getting-started"
  echo ""
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
  # ── Kiểm tra Zalo đã login chưa ──────────────────
  ZALO_LOGGED_IN=false
  if command -v openzca >/dev/null 2>&1; then
    if openzca --profile default auth status >/dev/null 2>&1; then
      ZALO_LOGGED_IN=true
    fi
  fi

  if [ "$ZALO_LOGGED_IN" = "true" ]; then
    echo "  ✅ Zalo đã đăng nhập — sẵn sàng theo dõi nhóm!"
    echo ""
    echo "  🔗 Mở dashboard:"
    echo "     $DASHBOARD_URL/dashboard"
  else
    echo "  📱 Bước cuối: Đăng nhập Zalo (quét QR)"
    echo ""
    echo "  ┌─────────────────────────────────────────┐"
    echo "  │  Mở sẵn Zalo trên điện thoại trước khi  │"
    echo "  │  bấm Y — QR chỉ hiệu lực ~60 giây       │"
    echo "  └─────────────────────────────────────────┘"
    echo ""
    printf "  Đã mở Zalo trên điện thoại, sẵn sàng quét? [Y/n] "
    read -r QR_CONFIRM </dev/tty
    if [ "\${QR_CONFIRM,,}" = "n" ]; then
      echo ""
      echo "  OK — mở Zalo rồi vào đây để quét:"
      echo "  🔗 $DASHBOARD_URL/dashboard/settings/channels"
      echo ""
      echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    else

    # Tìm canvas port openclaw (mặc định 18789)
    CANVAS_PORT=18789
    SERVER_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "localhost")

    # Thử lấy QR qua openzca auth login (sinh file qr.png)
    QR_FILE=""
    if command -v openzca >/dev/null 2>&1; then
      echo ""
      echo "  Đang tạo QR..."
      openzca --profile default auth login --qr-path /tmp/zalo-qr.png >/dev/null 2>&1 &
      OPENZCA_PID=$!
      # Chờ file QR xuất hiện tối đa 10s
      for _i in $(seq 1 10); do
        for _f in /tmp/zalo-qr.png ~/qr.png ~/.openclaw/qr.png /root/qr.png; do
          if [ -f "$_f" ] && [ -s "$_f" ]; then
            QR_FILE="$_f"
            break 2
          fi
        done
        sleep 1
      done
      kill $OPENZCA_PID 2>/dev/null || true
    fi

    if [ -n "$QR_FILE" ]; then
      # Thử mở QR file bằng GUI viewer
      if command -v open >/dev/null 2>&1; then
        open "$QR_FILE" 2>/dev/null && echo "  📂 Đã mở QR trong Preview — quét bằng Zalo trên điện thoại." || true
      elif command -v xdg-open >/dev/null 2>&1; then
        xdg-open "$QR_FILE" 2>/dev/null && echo "  📂 Đã mở QR — quét bằng Zalo trên điện thoại." || true
      else
        echo "  📂 File QR: $QR_FILE"
        echo "     Mở file này và quét bằng Zalo trên điện thoại."
      fi
      echo ""
      echo "  Hoặc quét trên dashboard (QR đang được đẩy tự động):"
      echo "  🔗 $DASHBOARD_URL/dashboard/settings/channels"
    else
      # Fallback: openclaw canvas UI
      echo "  Cách 1 — Quét qua OpenClaw Canvas (mở trên máy này):"
      echo "  🔗 http://$SERVER_IP:$CANVAS_PORT/__openclaw__/canvas/"
      echo ""
      echo "  Cách 2 — Quét qua dashboard (sau khi QR xuất hiện ~30s):"
      echo "  🔗 $DASHBOARD_URL/dashboard/settings/channels"
      echo "     → Bấm [Kết nối lại] nếu chưa tự hiện"
    fi
    echo ""
    echo "  ⚠️  Sau khi quét: dashboard tự cập nhật ✅"
    fi # end QR_CONFIRM check
  fi
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
