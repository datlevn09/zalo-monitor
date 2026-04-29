/**
 * Analytics endpoints cho dashboard Analytics page.
 * Compute group health, user engagement, heatmap, trends, funnels, etc.
 */

import type { FastifyPluginAsync } from 'fastify'
import { db } from '../services/db.js'

function requireTenant(req: any, reply: any): string | null {
  const tenantId = req.headers['x-tenant-id'] as string
  if (!tenantId) {
    reply.status(400).send({ error: 'Missing tenant id' })
    return null
  }
  return tenantId
}

// Filter SQL fragment: WHERE g.isDirect = true / false / both
function filterClause(filter: string): string {
  if (filter === 'group') return 'AND g."isDirect" = false'
  if (filter === 'dm') return 'AND g."isDirect" = true'
  return ''
}

/**
 * RBAC helper — trả về list groupIds user được xem, dựa trên scope + boardUserId.
 * Trả null = không filter (full tenant — chỉ Manager/Owner với scope=all).
 * Trả [] = không có gì → endpoint return empty.
 * Trả [...ids] = filter WHERE g.id IN (ids).
 */
async function getAllowedGroupIds(req: any, tenantId: string): Promise<string[] | null> {
  const auth = req.authUser
  const scope = req.query?.scope as string | undefined
  const boardUserIdQ = req.query?.boardUserId as string | undefined
  if (!auth) return [] // no auth — return empty

  // Manager/Owner toàn tenant
  if (scope === 'all' && (auth.role === 'OWNER' || auth.role === 'MANAGER')) return null

  // Tất cả board của tôi (gộp): own + sharers
  if (scope === 'all_shared') {
    const accesses = await db.boardAccess.findMany({
      where: { tenantId, viewerUserId: auth.userId },
      select: { boardUserId: true },
    })
    const sharerIds = accesses.map(a => a.boardUserId)
    const groups = await db.group.findMany({
      where: {
        tenantId,
        OR: [
          { ownerUserId: auth.userId },
          { ownerUserId: { in: sharerIds } },
        ],
      },
      select: { id: true },
    })
    return groups.map(g => g.id)
  }

  // Board của user khác (đã pass auth-guard BoardAccess check)
  if (boardUserIdQ && boardUserIdQ !== auth.userId && !boardUserIdQ.startsWith('__')) {
    const groups = await db.group.findMany({
      where: { tenantId, ownerUserId: boardUserIdQ },
      select: { id: true },
    })
    return groups.map(g => g.id)
  }

  // Default = Board của tôi (own + GroupPermission)
  const [groups, perms] = await Promise.all([
    db.group.findMany({ where: { tenantId, ownerUserId: auth.userId }, select: { id: true } }),
    db.groupPermission.findMany({ where: { tenantId, userId: auth.userId }, select: { groupId: true } }),
  ])
  return Array.from(new Set([...groups.map(g => g.id), ...perms.map(p => p.groupId)]))
}

/** Returns SQL clause `AND g.id IN ('id1','id2')` hoặc empty string nếu null (no filter). */
function groupIdsClause(ids: string[] | null, alias = 'g'): string {
  if (ids === null) return ''
  if (ids.length === 0) return `AND ${alias}."id" = '__none__'` // force empty result
  const escaped = ids.map(id => `'${id.replace(/'/g, "''")}'`).join(',')
  return `AND ${alias}."id" IN (${escaped})`
}

// Stop words tiếng Việt + Anh — bỏ khi tạo word cloud
const STOP_WORDS = new Set([
  // Vietnamese function words
  'và', 'là', 'của', 'có', 'được', 'cho', 'với', 'này', 'đó', 'những', 'các', 'một', 'không',
  'cũng', 'để', 'thì', 'mà', 'như', 'nên', 'còn', 'đã', 'sẽ', 'rồi', 'đang', 'lại', 'vào', 'ra',
  'lên', 'xuống', 'từ', 'bằng', 'theo', 'qua', 'hay', 'hoặc', 'nhưng', 'nếu', 'khi', 'sau', 'trước',
  'trong', 'ngoài', 'trên', 'dưới', 'giữa', 'bên', 'thế', 'rất', 'quá', 'lắm', 'thật', 'mới', 'cũ',
  'chỉ', 'chứ', 'đi', 'làm', 'nói', 'biết', 'thấy', 'gì', 'sao', 'nào', 'ai', 'đâu', 'bao',
  'ạ', 'ơi', 'ấy', 'em', 'anh', 'chị', 'bạn', 'mình', 'tôi', 'mẹ', 'ba', 'cha', 'tớ', 'nhé', 'nha',
  'oke', 'ok', 'oki', 'vâng', 'dạ', 'ừm', 'ừ', 'à', 'ờ', 'ê', 'ahihi', 'huhu', 'haha',
  // English common
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had',
  'do', 'does', 'did', 'will', 'would', 'should', 'could', 'may', 'might', 'must', 'can',
  'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her', 'us', 'them',
  'this', 'that', 'these', 'those', 'and', 'or', 'but', 'if', 'when', 'while', 'as', 'because',
  'of', 'in', 'on', 'at', 'to', 'from', 'by', 'with', 'for', 'about', 'against', 'between',
  // Common chat noise
  'http', 'https', 'www', 'com', 'vn', 'jpg', 'png', 'gif', 'mp4', 'pdf',
  'media', 'attached', 'image', 'video', 'file', 'sticker', 'voice',
])

function tokenizeForCloud(text: string): string[] {
  if (!text) return []
  // Lower + bỏ URL + bỏ media attached
  let t = text.toLowerCase()
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/\[media[^\]]*\]/g, ' ')
    .replace(/[\d]+/g, ' ')   // bỏ số (sđt, giá)
    .replace(/[^\p{L}\s]/gu, ' ')   // chỉ giữ chữ cái Unicode
  return t.split(/\s+/).filter(w => w.length >= 3 && !STOP_WORDS.has(w))
}

export const analyticsRoutes: FastifyPluginAsync = async (app) => {
  // GET /api/analytics/group-health?days=7&filter=all|group|dm
  app.get('/group-health', async (req, reply) => {
    const tenantId = requireTenant(req, reply); if (!tenantId) return
    // Plan-gated max: free 30, pro 90, business 365, unlimited 3650
    const reqDays = Number((req.query as any)?.days ?? 7)
    const t = await db.tenant.findUnique({ where: { id: tenantId }, select: { plan: true } })
    const planMax: Record<string, number> = { free: 30, pro: 90, business: 365, unlimited: 3650 }
    const days = Math.min(reqDays, planMax[t?.plan ?? 'free'] ?? 30)
    const filter = String((req.query as any)?.filter ?? 'all')
    const filterSql = filterClause(filter)
    const since = new Date(Date.now() - days * 24 * 3600 * 1000)

    const allowedIds = await getAllowedGroupIds(req, tenantId)
    const rbacClause = groupIdsClause(allowedIds, 'g')

    // Query: per group, count by label
    const rows = await db.$queryRawUnsafe<Array<{
      id: string; name: string; member_count: number | null;
      last_at: Date | null;
      total_msgs: bigint; positive_msgs: bigint; complaint_msgs: bigint;
      risk_msgs: bigint; opportunity_msgs: bigint;
    }>>(`
      SELECT
        g.id,
        g.name,
        g."memberCount" AS member_count,
        g."lastMessageAt" AS last_at,
        COUNT(m.id)::bigint AS total_msgs,
        COUNT(CASE WHEN a.label='POSITIVE' THEN 1 END)::bigint AS positive_msgs,
        COUNT(CASE WHEN a.label='COMPLAINT' THEN 1 END)::bigint AS complaint_msgs,
        COUNT(CASE WHEN a.label='RISK' THEN 1 END)::bigint AS risk_msgs,
        COUNT(CASE WHEN a.label='OPPORTUNITY' THEN 1 END)::bigint AS opportunity_msgs
      FROM groups g
      LEFT JOIN messages m ON m."groupId" = g.id AND m."sentAt" >= $2 AND m."senderType"='CONTACT'
      LEFT JOIN message_analyses a ON a."messageId" = m.id
      WHERE g."tenantId" = $1 AND g."monitorEnabled" = true ${filterSql}
        ${rbacClause}
      GROUP BY g.id, g.name, g."memberCount", g."lastMessageAt"
    `, tenantId, since)

    const groups = rows.map(r => {
      const total = Number(r.total_msgs)
      const pos = Number(r.positive_msgs)
      const comp = Number(r.complaint_msgs)
      const risk = Number(r.risk_msgs)
      const opp = Number(r.opportunity_msgs)
      const negative = comp + risk
      return {
        id: r.id, name: r.name, memberCount: r.member_count,
        lastMessageAt: r.last_at,
        totalMessages: total,
        positive: pos, complaint: comp, risk, opportunity: opp,
        positiveRatio: total > 0 ? pos / total : 0,
        negativeRatio: total > 0 ? negative / total : 0,
        daysInactive: r.last_at ? Math.floor((Date.now() - new Date(r.last_at).getTime()) / 86400000) : 999,
      }
    })

    return {
      topPositive:   [...groups].filter(g => g.totalMessages >= 3).sort((a,b) => b.positiveRatio - a.positiveRatio).slice(0, 10),
      topNegative:   [...groups].filter(g => g.totalMessages >= 3).sort((a,b) => b.negativeRatio - a.negativeRatio).slice(0, 10),
      topOpportunity:[...groups].sort((a,b) => b.opportunity - a.opportunity).filter(g => g.opportunity > 0).slice(0, 10),
      topComplaint:  [...groups].sort((a,b) => b.complaint - a.complaint).filter(g => g.complaint > 0).slice(0, 10),
      zombie:        [...groups].filter(g => g.daysInactive >= 7).sort((a,b) => b.daysInactive - a.daysInactive).slice(0, 15),
    }
  })

  // GET /api/analytics/slow-reply?days=7
  app.get('/slow-reply', async (req, reply) => {
    const tenantId = requireTenant(req, reply); if (!tenantId) return
    const days = Number((req.query as any)?.days ?? 7)
    const since = new Date(Date.now() - days * 24 * 3600 * 1000)

    // Lag = avg(first SELF msg after CONTACT msg) - CONTACT sentAt
    // Simple heuristic: per group, average gap between CONTACT → next SELF
    const rows = await db.$queryRawUnsafe<Array<{ id: string; name: string; avg_lag_sec: number | null; open_msgs: bigint }>>(`
      WITH paired AS (
        SELECT
          m."groupId",
          m."sentAt" AS contact_at,
          (
            SELECT MIN(s."sentAt")
            FROM messages s
            WHERE s."groupId" = m."groupId"
              AND s."senderType" = 'SELF'
              AND s."sentAt" > m."sentAt"
              AND s."sentAt" < m."sentAt" + INTERVAL '24 hours'
          ) AS reply_at
        FROM messages m
        WHERE m."senderType" = 'CONTACT' AND m."sentAt" >= $2
          AND m."groupId" IN (SELECT id FROM groups WHERE "tenantId" = $1)
      )
      SELECT g.id, g.name,
        AVG(EXTRACT(EPOCH FROM (p.reply_at - p.contact_at))) AS avg_lag_sec,
        COUNT(CASE WHEN p.reply_at IS NULL THEN 1 END)::bigint AS open_msgs
      FROM groups g
      JOIN paired p ON p."groupId" = g.id
      WHERE g."tenantId" = $1
      GROUP BY g.id, g.name
      HAVING COUNT(*) >= 2
      ORDER BY AVG(EXTRACT(EPOCH FROM (p.reply_at - p.contact_at))) DESC NULLS LAST
      LIMIT 10
    `, tenantId, since)

    return rows.map(r => ({
      id: r.id, name: r.name,
      avgLagSec: r.avg_lag_sec != null ? Math.round(r.avg_lag_sec) : null,
      openMessages: Number(r.open_msgs),
    }))
  })

  // GET /api/analytics/top-senders?days=7
  app.get('/top-senders', async (req, reply) => {
    const tenantId = requireTenant(req, reply); if (!tenantId) return
    const days = Number((req.query as any)?.days ?? 7)
    const since = new Date(Date.now() - days * 24 * 3600 * 1000)

    const rows = await db.$queryRawUnsafe<Array<{
      sender_id: string; sender_name: string | null; avatar: string | null; phone: string | null;
      msg_count: bigint; group_count: bigint;
      positive: bigint; negative: bigint;
    }>>(`
      SELECT
        m."senderId" AS sender_id,
        COALESCE(NULLIF(MAX(m."senderName"), ''), c.name) AS sender_name,
        c."avatarUrl" AS avatar,
        c.phone,
        COUNT(m.id)::bigint AS msg_count,
        COUNT(DISTINCT m."groupId")::bigint AS group_count,
        COUNT(CASE WHEN a.label='POSITIVE' THEN 1 END)::bigint AS positive,
        COUNT(CASE WHEN a.label IN ('COMPLAINT','RISK') THEN 1 END)::bigint AS negative
      FROM messages m
      JOIN groups g ON g.id = m."groupId"
      LEFT JOIN message_analyses a ON a."messageId" = m.id
      LEFT JOIN customers c ON c."zaloId" = m."senderId" AND c."tenantId" = g."tenantId"
      WHERE g."tenantId" = $1
        AND m."senderType" = 'CONTACT'
        AND m."sentAt" >= $2
      GROUP BY m."senderId", c.name, c."avatarUrl", c.phone
      ORDER BY msg_count DESC
      LIMIT 15
    `, tenantId, since)

    return rows.map(r => ({
      senderId: r.sender_id,
      senderName: r.sender_name ?? 'Ẩn danh',
      avatarUrl: r.avatar,
      phone: r.phone,
      messageCount: Number(r.msg_count),
      groupCount: Number(r.group_count),
      positive: Number(r.positive),
      negative: Number(r.negative),
    }))
  })

  // GET /api/analytics/heatmap?days=7
  // Returns 7x24 grid: rows = weekday (0=Sun), cols = hour
  app.get('/heatmap', async (req, reply) => {
    const tenantId = requireTenant(req, reply); if (!tenantId) return
    const days = Number((req.query as any)?.days ?? 7)
    const since = new Date(Date.now() - days * 24 * 3600 * 1000)

    const rows = await db.$queryRawUnsafe<Array<{ dow: number; hour: number; count: bigint }>>(`
      SELECT
        EXTRACT(DOW FROM m."sentAt" AT TIME ZONE 'Asia/Ho_Chi_Minh')::int AS dow,
        EXTRACT(HOUR FROM m."sentAt" AT TIME ZONE 'Asia/Ho_Chi_Minh')::int AS hour,
        COUNT(*)::bigint AS count
      FROM messages m
      JOIN groups g ON g.id = m."groupId"
      WHERE g."tenantId" = $1 AND m."sentAt" >= $2
      GROUP BY 1, 2
    `, tenantId, since)

    // Build 7x24 grid
    const grid: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0))
    for (const r of rows) grid[r.dow][r.hour] = Number(r.count)

    return { grid, maxValue: Math.max(...grid.flat()) }
  })

  // GET /api/analytics/word-cloud?days=7&filter=all|group|dm
  // Trả top từ khoá xuất hiện trong tin nhắn của khách hàng (CONTACT)
  app.get('/word-cloud', async (req, reply) => {
    const tenantId = requireTenant(req, reply); if (!tenantId) return
    const reqDays = Number((req.query as any)?.days ?? 7)
    const t = await db.tenant.findUnique({ where: { id: tenantId }, select: { plan: true } })
    const planMax: Record<string, number> = { free: 30, pro: 90, business: 365, unlimited: 3650 }
    const days = Math.min(reqDays, planMax[t?.plan ?? 'free'] ?? 30)
    const filter = String((req.query as any)?.filter ?? 'all')
    const filterSql = filterClause(filter)
    const since = new Date(Date.now() - days * 24 * 3600 * 1000)

    // Lấy content từ messages (giới hạn 5000 tin để không tốn RAM)
    const rows = await db.$queryRawUnsafe<Array<{ content: string | null }>>(`
      SELECT m.content
      FROM messages m
      JOIN groups g ON g.id = m."groupId"
      WHERE g."tenantId" = $1 AND g."monitorEnabled" = true ${filterSql}
        AND m."sentAt" >= $2 AND m."senderType" = 'CONTACT'
        AND m.content IS NOT NULL AND length(m.content) > 0
      ORDER BY m."sentAt" DESC
      LIMIT 5000
    `, tenantId, since)

    const counts = new Map<string, number>()
    for (const row of rows) {
      const tokens = tokenizeForCloud(row.content || '')
      for (const tk of tokens) {
        counts.set(tk, (counts.get(tk) ?? 0) + 1)
      }
    }
    // Top 60 từ
    const top = Array.from(counts.entries())
      .filter(([, c]) => c >= 2)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 60)
      .map(([word, count]) => ({ word, count }))

    return { words: top, total: rows.length }
  })

  // GET /api/analytics/sentiment-trend?days=30
  app.get('/sentiment-trend', async (req, reply) => {
    const tenantId = requireTenant(req, reply); if (!tenantId) return
    const days = Math.min(Number((req.query as any)?.days ?? 30), 60)
    const since = new Date(Date.now() - days * 24 * 3600 * 1000)
    const allowedIds = await getAllowedGroupIds(req, tenantId)
    const rbacClause = groupIdsClause(allowedIds, 'g')

    const rows = await db.$queryRawUnsafe<Array<{
      day: string; positive: bigint; negative: bigint; neutral: bigint;
    }>>(`
      WITH days AS (
        SELECT generate_series(
          date_trunc('day', $2::timestamp),
          date_trunc('day', NOW()),
          '1 day'::interval
        )::date AS day
      ),
      stats AS (
        SELECT
          date_trunc('day', m."sentAt")::date AS day,
          COUNT(CASE WHEN a.label='POSITIVE' THEN 1 END)::bigint AS positive,
          COUNT(CASE WHEN a.label IN ('COMPLAINT','RISK') THEN 1 END)::bigint AS negative,
          COUNT(CASE WHEN a.label='NEUTRAL' OR a.label IS NULL THEN 1 END)::bigint AS neutral
        FROM messages m
        JOIN groups g ON g.id = m."groupId"
        LEFT JOIN message_analyses a ON a."messageId" = m.id
        WHERE g."tenantId" = $1 AND m."sentAt" >= $2
          ${rbacClause}
        GROUP BY 1
      )
      SELECT d.day::text AS day,
        COALESCE(s.positive, 0)::bigint AS positive,
        COALESCE(s.negative, 0)::bigint AS negative,
        COALESCE(s.neutral, 0)::bigint AS neutral
      FROM days d LEFT JOIN stats s ON s.day = d.day
      ORDER BY d.day
    `, tenantId, since)

    return rows.map(r => ({
      day: r.day,
      positive: Number(r.positive),
      negative: Number(r.negative),
      neutral: Number(r.neutral),
    }))
  })

  // GET /api/analytics/weekly-compare?days=7&filter=all|group|dm
  // KPI cards: dùng CÙNG criteria với pie chart label-distribution để các con số khớp nhau:
  //  - Source: message_analyses (AI label)
  //  - Time field: sentAt
  //  - senderType = 'CONTACT' (chỉ tin nhận, đồng bộ với "Phân loại tin")
  //  - filter group/dm áp dụng qua g.isDirect
  // total = tổng tin CONTACT trong cùng window (= tổng pie chart).
  app.get('/weekly-compare', async (req, reply) => {
    const tenantId = requireTenant(req, reply); if (!tenantId) return
    const days = Math.max(1, Number((req.query as any)?.days ?? 7))
    const filter = String((req.query as any)?.filter ?? 'all')
    const now = Date.now()
    const periodMs = days * 86400000
    const sinceCurr = new Date(now - periodMs)
    const sincePrev = new Date(now - periodMs * 2)

    const isDirectClause =
      filter === 'group' ? 'AND g."isDirect" = false' :
      filter === 'dm'    ? 'AND g."isDirect" = true' : ''
    const allowedIds = await getAllowedGroupIds(req, tenantId)
    const rbacClause = groupIdsClause(allowedIds, 'g')

    const fetchWindow = async (from: Date, to: Date) => {
      const rows = await db.$queryRawUnsafe<Array<{ label: string | null; count: bigint }>>(`
        SELECT COALESCE(a.label, 'NEUTRAL') AS label, COUNT(*)::bigint AS count
        FROM messages m
        JOIN groups g ON g.id = m."groupId"
        LEFT JOIN message_analyses a ON a."messageId" = m.id
        WHERE g."tenantId" = $1
          AND m."sentAt" >= $2 AND m."sentAt" < $3
          AND m."senderType" = 'CONTACT'
          ${isDirectClause}
          ${rbacClause}
        GROUP BY 1
      `, tenantId, from, to)
      const acc = { total: 0, opportunity: 0, complaint: 0, positive: 0 }
      for (const r of rows) {
        const c = Number(r.count); acc.total += c
        if (r.label === 'OPPORTUNITY') acc.opportunity = c
        else if (r.label === 'COMPLAINT') acc.complaint = c
        else if (r.label === 'POSITIVE') acc.positive = c
      }
      return acc
    }

    const [thisWeek, lastWeek] = await Promise.all([
      fetchWindow(sinceCurr, new Date(now)),
      fetchWindow(sincePrev, sinceCurr),
    ])

    const delta = (curr: number, prev: number) =>
      prev === 0 ? (curr > 0 ? 100 : 0) : Math.round(((curr - prev) / prev) * 100)

    return {
      thisWeek, lastWeek,
      delta: {
        total:       delta(thisWeek.total, lastWeek.total),
        opportunity: delta(thisWeek.opportunity, lastWeek.opportunity),
        complaint:   delta(thisWeek.complaint, lastWeek.complaint),
        positive:    delta(thisWeek.positive, lastWeek.positive),
      },
    }
  })

  // GET /api/analytics/label-distribution?days=7&filter=all|group|dm
  // CÙNG criteria với weekly-compare → tổng count phải khớp KPI "Tin nhắn".
  app.get('/label-distribution', async (req, reply) => {
    const tenantId = requireTenant(req, reply); if (!tenantId) return
    const days = Number((req.query as any)?.days ?? 7)
    const filter = String((req.query as any)?.filter ?? 'all')
    const since = new Date(Date.now() - days * 24 * 3600 * 1000)
    const isDirectClause =
      filter === 'group' ? 'AND g."isDirect" = false' :
      filter === 'dm'    ? 'AND g."isDirect" = true' : ''
    const allowedIds = await getAllowedGroupIds(req, tenantId)
    const rbacClause = groupIdsClause(allowedIds, 'g')

    const rows = await db.$queryRawUnsafe<Array<{ label: string | null; count: bigint }>>(`
      SELECT COALESCE(a.label, 'NEUTRAL') AS label, COUNT(*)::bigint AS count
      FROM messages m
      JOIN groups g ON g.id = m."groupId"
      LEFT JOIN message_analyses a ON a."messageId" = m.id
      WHERE g."tenantId" = $1 AND m."sentAt" >= $2
        AND m."senderType" = 'CONTACT'
        ${isDirectClause}
        ${rbacClause}
      GROUP BY 1
      ORDER BY count DESC
    `, tenantId, since)

    return rows.map(r => ({ label: r.label ?? 'NEUTRAL', count: Number(r.count) }))
  })

  // GET /api/analytics/channel-breakdown?days=7
  app.get('/channel-breakdown', async (req, reply) => {
    const tenantId = requireTenant(req, reply); if (!tenantId) return
    const days = Number((req.query as any)?.days ?? 7)
    const since = new Date(Date.now() - days * 24 * 3600 * 1000)

    const rows = await db.$queryRawUnsafe<Array<{
      channel: string; total: bigint; positive: bigint; negative: bigint; opportunity: bigint;
    }>>(`
      SELECT
        g."channelType" AS channel,
        COUNT(m.id)::bigint AS total,
        COUNT(CASE WHEN a.label='POSITIVE' THEN 1 END)::bigint AS positive,
        COUNT(CASE WHEN a.label IN ('COMPLAINT','RISK') THEN 1 END)::bigint AS negative,
        COUNT(CASE WHEN a.label='OPPORTUNITY' THEN 1 END)::bigint AS opportunity
      FROM groups g
      LEFT JOIN messages m ON m."groupId" = g.id AND m."sentAt" >= $2 AND m."senderType"='CONTACT'
      LEFT JOIN message_analyses a ON a."messageId" = m.id
      WHERE g."tenantId" = $1
      GROUP BY g."channelType"
    `, tenantId, since)

    return rows.map(r => ({
      channel: r.channel,
      total: Number(r.total),
      positive: Number(r.positive),
      negative: Number(r.negative),
      opportunity: Number(r.opportunity),
    }))
  })
}
