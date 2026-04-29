/**
 * Zalo admin endpoints — quản lý openzalo config
 * (per-group allowlist, requireMention bypass)
 */

import type { FastifyPluginAsync } from 'fastify'
import fs from 'node:fs'
import { execSync } from 'node:child_process'
import { syncZaloGroups, syncZaloGroupHistory, rerankTopGroups } from '../services/zalo-sync.js'
import { syncAllAvatars } from '../services/zalo-avatar.js'
import { hookPings, getQrFromStore, getQrEntryFromStore } from './setup.js'

const OPENCLAW_CONFIG = process.env.OPENCLAW_CONFIG ?? '/root/.openclaw/openclaw.json'
const OPENCLAW_LOG    = process.env.OPENCLAW_LOG ?? '/tmp/gw.log'
const OPENCLAW_CONTAINER = process.env.OPENCLAW_CONTAINER ?? 'openclaw'

// Cache check container running để không spam stderr khi container đã chết.
let openclawAvailable: boolean | null = null
let openclawCheckAt = 0
function isOpenclawRunning(): boolean {
  // Re-check mỗi 60s
  if (openclawAvailable !== null && Date.now() - openclawCheckAt < 60_000) return openclawAvailable
  try {
    const out = execSync(`docker inspect -f '{{.State.Running}}' ${OPENCLAW_CONTAINER} 2>/dev/null`, { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] })
    openclawAvailable = out.trim() === 'true'
  } catch {
    openclawAvailable = false
  }
  openclawCheckAt = Date.now()
  return openclawAvailable
}

function execInContainer(cmd: string): string {
  if (!isOpenclawRunning()) throw new Error('openclaw container not running')
  return execSync(`docker exec ${OPENCLAW_CONTAINER} ${cmd}`, { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] })
}

export const zaloAdminRoutes: FastifyPluginAsync = async (app) => {
  // POST /api/zalo/sync-avatars — fetch avatar URLs từ openzca
  app.post('/sync-avatars', async (req, reply) => {
    const tenantId = req.headers['x-tenant-id'] as string
    if (!tenantId) return reply.status(400).send({ error: 'Missing tenant id' })
    const r = await syncAllAvatars(tenantId)
    return { ok: true, ...r }
  })

  // POST /api/zalo/rerank — chỉ giữ top maxGroups monitor
  app.post('/rerank', async (req, reply) => {
    const tenantId = req.headers['x-tenant-id'] as string
    if (!tenantId) return reply.status(400).send({ error: 'Missing tenant id' })
    const result = await rerankTopGroups(tenantId)
    return { ok: true, ...result }
  })

  // POST /api/zalo/sync-groups — sync 50 nhóm gần nhất từ openzca
  app.post('/sync-groups', async (req, reply) => {
    const tenantId = req.headers['x-tenant-id'] as string
    if (!tenantId) return reply.status(400).send({ error: 'Missing tenant id' })
    const limit = Number((req.body as any)?.limit ?? 50)

    try {
      const result = await syncZaloGroups(tenantId, limit)
      return { ok: true, ...result }
    } catch (err: any) {
      return reply.status(500).send({ error: err.message })
    }
  })

  // POST /api/zalo/sync-history/:groupId — backfill 50 tin cũ
  app.post('/sync-history/:groupId', async (req, reply) => {
    const tenantId = req.headers['x-tenant-id'] as string
    const { groupId } = req.params as { groupId: string }
    const limit = Number((req.body as any)?.limit ?? 50)

    try {
      const result = await syncZaloGroupHistory(tenantId, groupId, limit)
      return { ok: true, ...result }
    } catch (err: any) {
      return reply.status(500).send({ error: err.message })
    }
  })

  // POST /api/zalo/sync-all-history — backfill top N groups (mỗi nhóm 50 tin)
  app.post('/sync-all-history', async (req, reply) => {
    const tenantId = req.headers['x-tenant-id'] as string
    const { db } = await import('../services/db.js')
    const groups = await db.group.findMany({
      where: { tenantId, channelType: 'ZALO', monitorEnabled: true },
      orderBy: { lastMessageAt: 'desc' },
      take: Number((req.body as any)?.groups ?? 50),
      select: { id: true, name: true },
    })

    const limit = Number((req.body as any)?.limit ?? 50)
    const results: Array<{ groupName: string; imported?: number; error?: string }> = []

    // Chạy tuần tự (tránh rate limit Zalo)
    for (const g of groups) {
      try {
        const r = await syncZaloGroupHistory(tenantId, g.id, limit)
        results.push({ groupName: g.name, imported: r.imported })
      } catch (err: any) {
        results.push({ groupName: g.name, error: err.message })
      }
      // Small delay để không spam API
      await new Promise(r => setTimeout(r, 300))
    }

    const totalImported = results.reduce((s, r) => s + (r.imported ?? 0), 0)
    return { ok: true, groupsProcessed: results.length, totalImported, results }
  })

  // GET /api/zalo/pending-groups — list groups bị drop do chưa allowlist
  app.get('/pending-groups', async () => {
    try {
      const log = execInContainer(`tail -500 ${OPENCLAW_LOG}`)
      const ids = new Set<string>()
      for (const m of log.matchAll(/drop group (\d+)/g)) ids.add(m[1])
      return { pendingGroupIds: Array.from(ids) }
    } catch {
      return { pendingGroupIds: [], error: 'Cannot read OpenClaw log' }
    }
  })

  // POST /api/zalo/allowlist — add group(s) vào allowlist
  app.post('/allowlist', async (req, reply) => {
    const body = req.body as { groupIds: string[] }
    if (!body.groupIds?.length) return reply.status(400).send({ error: 'groupIds required' })

    try {
      // Read openclaw.json
      const raw = execInContainer(`cat ${OPENCLAW_CONFIG}`)
      const cfg = JSON.parse(raw)
      const oz = cfg.channels?.openzalo
      if (!oz) return reply.status(400).send({ error: 'openzalo channel not configured' })

      const groups = oz.groups ??= {}
      let added = 0
      for (const gid of body.groupIds) {
        if (!groups[gid]) {
          groups[gid] = { enabled: true, requireMention: false }
          added++
        }
      }

      // Write back (through docker exec tee)
      const json = JSON.stringify(cfg, null, 2)
      // Escape single quotes then use heredoc via temp file
      execInContainer(`bash -c 'cat > ${OPENCLAW_CONFIG}.tmp <<"EOZM"\n${json}\nEOZM\nmv ${OPENCLAW_CONFIG}.tmp ${OPENCLAW_CONFIG}'`)

      // Restart gateway để apply
      try {
        execInContainer(`bash -c 'pkill -9 -f openclaw-gateway; sleep 2; rm -f /tmp/*.lock ~/.openclaw/*.lock'`)
      } catch {}
      execSync(`docker exec -d ${OPENCLAW_CONTAINER} bash -c 'nohup openclaw gateway --bind lan > /tmp/gw.log 2>&1 &'`)

      return { ok: true, added, totalGroups: Object.keys(groups).length }
    } catch (err: any) {
      return reply.status(500).send({ error: err.message })
    }
  })

  // ── Zalo connection status + QR login ────────────────────────────────────

  // GET /api/zalo/connection-status — kiểm tra Zalo có đang kết nối không
  // Dùng để dashboard hiện badge "Online" / "Offline"
  app.get('/connection-status', async (req, reply) => {
    const tenantId = req.headers['x-tenant-id'] as string
    if (!tenantId) return reply.status(400).send({ error: 'Missing tenant id' })

    // Heuristic: nếu có tin nhắn Zalo trong 10 phút qua → đang kết nối
    const { db } = await import('../services/db.js')
    const tenMinsAgo = new Date(Date.now() - 10 * 60 * 1000)
    const recentMsg = await db.message.findFirst({
      where: { group: { tenantId, channelType: 'ZALO' }, sentAt: { gte: tenMinsAgo } },
      select: { sentAt: true },
      orderBy: { sentAt: 'desc' },
    })

    // Lấy thông tin Zalo account đang dùng (từ SELF message gần nhất)
    const selfMsg = await db.message.findFirst({
      where: { group: { tenantId, channelType: 'ZALO' }, senderType: 'SELF' },
      select: { senderName: true, senderId: true },
      orderBy: { sentAt: 'desc' },
    })

    // Check openclaw is running: Docker container OR native process (via recent hook ping)
    let containerRunning = false
    try {
      const out = execSync(`docker inspect --format="{{.State.Running}}" ${OPENCLAW_CONTAINER}`, { encoding: 'utf-8', timeout: 3000 }).trim()
      containerRunning = out === 'true'
    } catch { /* docker not available or not containerised */ }
    // Fallback: if hook pinged within last 10 minutes, OpenClaw IS running (native mode)
    if (!containerRunning) {
      const lastPing = hookPings.get(tenantId)
      if (lastPing && Date.now() - lastPing < 10 * 60 * 1000) containerRunning = true
    }

    // Check QR pending: Docker container file OR hook-pushed QR (native/VPS mode)
    let qrPending = false
    let qrFileAge: number | null = null
    // Check hook-pushed QR store first (works for all setups)
    if (getQrFromStore(tenantId)) {
      qrPending = true
    } else {
      // Fallback: check Docker container QR file (NAS self-contained setup)
      try {
        const qrStat = execInContainer('stat -c %Y /app/qr.png 2>/dev/null || echo 0')
        const qrMtime = parseInt(qrStat.trim(), 10) * 1000
        qrFileAge = Date.now() - qrMtime
        qrPending = qrFileAge < 5 * 60 * 1000
      } catch { /* ignore */ }
    }

    // Source of truth: zaloLoggedInTenants (in-memory, ping <2min)
    // Fallback: lastHookPingAt (DB persist — survives backend restart)
    const { zaloLoggedInTenants } = await import('./setup.js')
    const zaloLoginAt = zaloLoggedInTenants.get(tenantId)
    let zaloLoggedIn = !!zaloLoginAt && Date.now() - zaloLoginAt < 2 * 60 * 1000
    // Fallback DB nếu in-memory clear (vd backend restart)
    if (!zaloLoggedIn) {
      const t = await db.tenant.findUnique({ where: { id: tenantId }, select: { lastHookPingAt: true } })
      if (t?.lastHookPingAt && Date.now() - t.lastHookPingAt.getTime() < 5 * 60 * 1000) {
        zaloLoggedIn = true
      }
    }
    return {
      connected: zaloLoggedIn,
      qrPending,
      containerRunning,
      lastMessageAt: recentMsg?.sentAt ?? null,
      qrFileAgeSeconds: qrFileAge !== null ? Math.round(qrFileAge / 1000) : null,
      // Zalo account info (từ SELF message gần nhất)
      zaloName: selfMsg?.senderName ?? null,
      zaloPhone: selfMsg?.senderId?.startsWith('84') ? selfMsg.senderId : null,
    }
  })

  // GET /api/zalo/qr — trả QR code PNG dưới dạng base64 data URL để dashboard hiện
  // Dashboard poll endpoint này mỗi 5s khi cần đăng nhập lại
  app.get('/qr', async (req, reply) => {
    const tenantId = req.headers['x-tenant-id'] as string
    if (!tenantId) return reply.status(400).send({ error: 'Missing tenant id' })

    // Check in-memory store first (pushed by hook — works for all setups)
    const entry = getQrEntryFromStore(tenantId)
    if (entry) return { dataUrl: entry.dataUrl, pushedAt: entry.pushedAt, source: 'hook' }

    // Fallback: Docker container method (NAS self-contained setup only)
    try {
      const statOut = execInContainer('stat -c %Y /app/qr.png 2>/dev/null || echo 0')
      const mtime = parseInt(statOut.trim(), 10) * 1000
      const age = Date.now() - mtime
      if (age > 5 * 60 * 1000) return reply.status(404).send({ error: 'QR not available' })

      const b64 = execInContainer('base64 -w0 /app/qr.png 2>/dev/null')
      if (!b64.trim()) return reply.status(404).send({ error: 'QR not available' })
      return { dataUrl: `data:image/png;base64,${b64.trim()}`, pushedAt: mtime, source: 'docker' }
    } catch (err: any) {
      return reply.status(404).send({ error: 'QR not available' })
    }
  })

  // POST /api/zalo/clear-qr — khách đã scan xong, xóa QR khỏi store
  app.post('/clear-qr', async (req, reply) => {
    const auth = req.authUser
    if (!auth) return reply.status(401).send({ error: 'Unauthorized' })
    const { clearQrFromStore } = await import('./setup.js')
    clearQrFromStore(auth.tenantId)
    return { ok: true }
  })

  // POST /api/zalo/sync-history-server — yêu cầu listener server tự sync history
  // Listener đã login Zalo → tự chạy zalo-history-push.mjs → push DB
  // User KHÔNG cần làm gì trên máy mình (không phải quét QR lần 2).
  app.post('/sync-history-server', async (req, reply) => {
    const auth = req.authUser
    if (auth?.role === 'STAFF') return reply.status(403).send({ error: 'Không đủ quyền' })
    const { queueAction } = await import('./setup.js')
    queueAction(auth!.tenantId, 'sync_history')
    return { ok: true, message: 'Đã gửi lệnh đồng bộ — listener server sẽ tự chạy trong vài giây' }
  })

  // POST /api/zalo/reconnect — gửi yêu cầu login Zalo qua hook (không cần SSH)
  // Hook sẽ poll /api/setup/pending-actions, thấy 'login_zalo' → exec `openzca login`
  // → QR file sinh ra → existing watcher push lên backend → dashboard hiện QR
  app.post('/reconnect', async (req, reply) => {
    const auth = req.authUser
    if (auth?.role === 'STAFF') return reply.status(403).send({ error: 'Không đủ quyền' })

    const { queueAction } = await import('./setup.js')
    queueAction(auth!.tenantId, 'login_zalo')

    // Optional: nếu OpenClaw chạy local trong cùng container backend (NAS mode)
    // thì restart để clear session cũ — bỏ qua nếu lỗi
    let restarted = false
    try {
      execSync(`docker restart ${OPENCLAW_CONTAINER}`, { timeout: 10000 })
      restarted = true
    } catch { /* native mode hoặc không có docker — hook tự xử lý */ }

    return {
      ok: true,
      restarted,
      message: 'Đã gửi yêu cầu đăng nhập tới OpenClaw — QR sẽ xuất hiện trong vài giây',
      nativeMode: !restarted,
    }
  })

  // POST /api/zalo/auto-allowlist — tự động lấy pending + add hết
  app.post('/auto-allowlist', async (req, reply) => {
    const pendingRes = await fetch(`http://localhost:${process.env.PORT ?? 3001}/api/zalo/pending-groups`)
    const { pendingGroupIds } = await pendingRes.json() as { pendingGroupIds: string[] }

    if (!pendingGroupIds?.length) return { ok: true, added: 0, message: 'No pending groups' }

    const addRes = await fetch(`http://localhost:${process.env.PORT ?? 3001}/api/zalo/allowlist`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ groupIds: pendingGroupIds }),
    })
    return addRes.json()
  })

  // POST /api/zalo/reset-sync — xóa lastAutoSyncAt để trigger re-backfill lần tiếp
  app.post('/reset-sync', async (req, reply) => {
    const tenantId = req.headers['x-tenant-id'] as string
    const auth = req.authUser
    if (auth?.role === 'STAFF') return reply.status(403).send({ error: 'Không đủ quyền' })
    if (!tenantId) return reply.status(400).send({ error: 'Missing tenant id' })

    const { db } = await import('../services/db.js')
    await db.tenant.update({
      where: { id: tenantId },
      data: { lastAutoSyncAt: null },
    })
    return { ok: true, message: 'Sync đã được reset. Hook sẽ tự sync lại trong lần kết nối tiếp theo.' }
  })

  // GET /api/zalo/session-health — trả thông tin sức khỏe session để dashboard hiện
  app.get('/session-health', async (req, reply) => {
    const tenantId = req.headers['x-tenant-id'] as string
    if (!tenantId) return reply.status(400).send({ error: 'Missing tenant id' })

    const { db } = await import('../services/db.js')
    const tenant = await db.tenant.findUnique({
      where: { id: tenantId },
      select: { lastHookPingAt: true, lastAutoSyncAt: true, setupDone: true },
    })
    if (!tenant) return reply.status(404).send({ error: 'Tenant not found' })

    const now = Date.now()
    // Lấy lastPing tốt nhất giữa: hookPings in-memory (poll/qr-push) HOẶC DB (lastHookPingAt từ message webhook)
    const memPing = hookPings.get(tenantId) ?? null
    const dbPing = tenant.lastHookPingAt?.getTime() ?? null
    const lastPing = memPing && dbPing ? Math.max(memPing, dbPing) : (memPing ?? dbPing)
    const msSincePing = lastPing ? now - lastPing : null
    const hoursSincePing = msSincePing ? Math.floor(msSincePing / 3_600_000) : null

    const status: 'healthy' | 'warning' | 'dead' | 'never' =
      !lastPing ? 'never' :
      msSincePing! < 30 * 60_000 ? 'healthy' :
      msSincePing! < 2 * 60 * 60_000 ? 'warning' :
      'dead'

    // Sync status: never → pending (reset/first) → syncing (running now) → done
    const lastSync = tenant.lastAutoSyncAt?.getTime() ?? null
    const msSinceSync = lastSync ? now - lastSync : null
    const syncStatus: 'never' | 'pending' | 'syncing' | 'done' =
      !lastSync ? 'pending' :                           // null = reset or never ran
      msSinceSync! < 10 * 60_000 ? 'syncing' :         // < 10min = likely still running
      'done'

    return {
      status,
      lastHookPingAt: tenant.lastHookPingAt,
      hoursSincePing,
      lastAutoSyncAt: tenant.lastAutoSyncAt,
      syncStatus,
      setupDone: tenant.setupDone,
    }
  })

  // GET /api/zalo/history-push-config — trả thông tin để chạy script import lịch sử
  // Chỉ OWNER mới xem được (có webhookSecret)
  app.get('/history-push-config', async (req, reply) => {
    const tenantId = req.headers['x-tenant-id'] as string
    const auth = req.authUser
    if (!tenantId) return reply.status(400).send({ error: 'Missing tenant id' })

    const { db } = await import('../services/db.js')
    const tenant = await db.tenant.findUnique({
      where: { id: tenantId },
      select: { webhookSecret: true },
    })
    if (!tenant) return reply.status(404).send({ error: 'Tenant not found' })

    // Chỉ OWNER mới thấy webhookSecret
    const secret = auth?.role === 'OWNER' ? tenant.webhookSecret : '***hidden***'

    // Derive backend URL from request
    const proto = (req.headers['x-forwarded-proto'] as string) || 'https'
    const host = (req.headers['x-forwarded-host'] as string) || req.headers.host || 'localhost:3001'
    const backendUrl = `${proto}://${host}`

    return {
      backendUrl,
      tenantId,
      webhookSecret: secret,
      isOwner: auth?.role === 'OWNER',
      scriptDownloadUrl: `${backendUrl}/api/setup/hook-files/zalo-history-push.mjs`,
    }
  })
}
