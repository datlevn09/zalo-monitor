/**
 * Zalo admin endpoints — quản lý openzalo config
 * (per-group allowlist, requireMention bypass)
 */

import type { FastifyPluginAsync } from 'fastify'
import fs from 'node:fs'
import { execSync } from 'node:child_process'
import { syncZaloGroups, syncZaloGroupHistory, rerankTopGroups } from '../services/zalo-sync.js'
import { syncAllAvatars } from '../services/zalo-avatar.js'

const OPENCLAW_CONFIG = process.env.OPENCLAW_CONFIG ?? '/root/.openclaw/openclaw.json'
const OPENCLAW_LOG    = process.env.OPENCLAW_LOG ?? '/tmp/gw.log'
const OPENCLAW_CONTAINER = process.env.OPENCLAW_CONTAINER ?? 'openclaw'

function execInContainer(cmd: string): string {
  return execSync(`docker exec ${OPENCLAW_CONTAINER} ${cmd}`, { encoding: 'utf-8' })
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

    // Check openclaw container is running
    let containerRunning = false
    try {
      const out = execSync(`docker inspect --format="{{.State.Running}}" ${OPENCLAW_CONTAINER}`, { encoding: 'utf-8', timeout: 3000 }).trim()
      containerRunning = out === 'true'
    } catch { /* docker not available or container not found */ }

    // Check QR file — nếu qr.png mới (<5 phút) → đang chờ scan, chưa kết nối
    let qrPending = false
    let qrFileAge: number | null = null
    try {
      const qrStat = execInContainer('stat -c %Y /app/qr.png 2>/dev/null || echo 0')
      const qrMtime = parseInt(qrStat.trim(), 10) * 1000
      qrFileAge = Date.now() - qrMtime
      qrPending = qrFileAge < 5 * 60 * 1000 // fresher than 5 minutes = waiting for scan
    } catch { /* ignore */ }

    return {
      connected: !qrPending && !!recentMsg,
      qrPending,
      containerRunning,
      lastMessageAt: recentMsg?.sentAt ?? null,
      qrFileAgeSeconds: qrFileAge !== null ? Math.round(qrFileAge / 1000) : null,
    }
  })

  // GET /api/zalo/qr — trả QR code PNG dưới dạng base64 data URL để dashboard hiện
  // Dashboard poll endpoint này mỗi 5s khi cần đăng nhập lại
  app.get('/qr', async (req, reply) => {
    const tenantId = req.headers['x-tenant-id'] as string
    if (!tenantId) return reply.status(400).send({ error: 'Missing tenant id' })

    try {
      const b64 = execInContainer('base64 -w0 /app/qr.png 2>/dev/null')
      if (!b64.trim()) return reply.status(404).send({ error: 'QR not available' })
      return { dataUrl: `data:image/png;base64,${b64.trim()}` }
    } catch (err: any) {
      return reply.status(500).send({ error: 'Cannot read QR: ' + err.message })
    }
  })

  // POST /api/zalo/reconnect — khởi động lại openclaw để Zalo re-login
  // Chỉ admin mới gọi được (tenant guard)
  app.post('/reconnect', async (req, reply) => {
    const auth = req.authUser
    if (auth?.role === 'STAFF') return reply.status(403).send({ error: 'Không đủ quyền' })

    try {
      execSync(`docker restart ${OPENCLAW_CONTAINER}`, { timeout: 10000 })
      return { ok: true, message: 'OpenClaw restarting... QR sẽ xuất hiện sau ~10 giây' }
    } catch (err: any) {
      return reply.status(500).send({ error: err.message })
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
}
