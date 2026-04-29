import type { FastifyPluginAsync } from 'fastify'
import { db } from '../services/db.js'

export const statsRoutes: FastifyPluginAsync = async (app) => {
  // GET /api/stats/trend?days=7 — daily message + alert counts
  app.get('/trend', async (req, reply) => {
    const tenantId = req.headers['x-tenant-id'] as string
    if (!tenantId) return reply.status(400).send({ error: 'Missing tenant id' })

    const days = Math.min(Number((req.query as any)?.days ?? 7), 30)
    const since = new Date(Date.now() - days * 24 * 3600 * 1000)

    // Raw SQL grouping by day
    const result = await db.$queryRawUnsafe<Array<{ day: string; messages: bigint; alerts: bigint }>>(`
      WITH days AS (
        SELECT generate_series(
          date_trunc('day', $1::timestamp),
          date_trunc('day', NOW()),
          '1 day'::interval
        )::date AS day
      ),
      -- Đồng bộ với analytics: dùng sentAt + senderType=CONTACT
      msg_counts AS (
        SELECT date_trunc('day', m."sentAt")::date AS day, COUNT(*)::bigint AS count
        FROM messages m
        JOIN groups g ON m."groupId" = g.id
        WHERE g."tenantId" = $2 AND m."sentAt" >= $1 AND m."senderType" = 'CONTACT'
        GROUP BY 1
      ),
      -- "alerts" trên trend = số tin Cơ hội + Khiếu nại + Rủi ro (đồng bộ với pie chart)
      alert_counts AS (
        SELECT date_trunc('day', m."sentAt")::date AS day, COUNT(*)::bigint AS count
        FROM messages m
        JOIN groups g ON m."groupId" = g.id
        JOIN message_analyses a ON a."messageId" = m.id
        WHERE g."tenantId" = $2 AND m."sentAt" >= $1
          AND m."senderType" = 'CONTACT'
          AND a.label IN ('OPPORTUNITY', 'COMPLAINT', 'RISK')
        GROUP BY 1
      )
      SELECT d.day::text AS day,
             COALESCE(m.count, 0) AS messages,
             COALESCE(a.count, 0) AS alerts
      FROM days d
      LEFT JOIN msg_counts m ON m.day = d.day
      LEFT JOIN alert_counts a ON a.day = d.day
      ORDER BY d.day;
    `, since, tenantId)

    return result.map(r => ({
      day: r.day,
      messages: Number(r.messages),
      alerts: Number(r.alerts),
    }))
  })

  app.get('/overview', async (req, reply) => {
    const tenantId = req.headers['x-tenant-id'] as string
    if (!tenantId) return reply.status(400).send({ error: 'Missing tenant id' })

    const days = Math.max(1, Number((req.query as any)?.days ?? 1))  // default 24h
    const since = new Date(Date.now() - days * 24 * 3600 * 1000)
    const since24h = new Date(Date.now() - 24 * 3600 * 1000)  // luôn 24h cho activeGroups

    // Đồng bộ với trang Phân tích: filter theo message.sentAt + senderType=CONTACT.
    const baseAnalysis = {
      message: { group: { tenantId }, sentAt: { gte: since }, senderType: 'CONTACT' as const },
    } as const
    const [totalGroups, activeGroups, totalMessages, openAlerts, complaints, opportunities, recentActivity] = await Promise.all([
      db.group.count({ where: { tenantId } }),
      db.group.count({ where: { tenantId, lastMessageAt: { gte: since24h } } }),
      db.message.count({ where: { group: { tenantId }, sentAt: { gte: since }, senderType: 'CONTACT' } }),
      db.alert.count({ where: { tenantId, status: 'OPEN' } }),
      db.messageAnalysis.count({ where: { ...baseAnalysis, label: 'COMPLAINT' } }),
      db.messageAnalysis.count({ where: { ...baseAnalysis, label: 'OPPORTUNITY' } }),
      db.message.findMany({
        where: { group: { tenantId } },
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: {
          group: { select: { id: true, name: true, category: true } },
          analysis: { select: { label: true, priority: true } },
        },
      }),
    ])

    return {
      stats: {
        totalGroups, activeGroups,
        messagesInRange: totalMessages,
        openAlerts,
        complaintsInRange: complaints,
        opportunitiesInRange: opportunities,
        // Aliases backward-compat (cũ): để không vỡ caller cũ
        messages24h: totalMessages,
        complaints7d: complaints,
        opportunities7d: opportunities,
      },
      recentActivity,
    }
  })
}
