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
      msg_counts AS (
        SELECT date_trunc('day', m."createdAt")::date AS day, COUNT(*)::bigint AS count
        FROM messages m
        JOIN groups g ON m."groupId" = g.id
        WHERE g."tenantId" = $2 AND m."createdAt" >= $1
        GROUP BY 1
      ),
      alert_counts AS (
        SELECT date_trunc('day', "createdAt")::date AS day, COUNT(*)::bigint AS count
        FROM alerts
        WHERE "tenantId" = $2 AND "createdAt" >= $1
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

    const since24h = new Date(Date.now() - 24 * 3600 * 1000)
    const since7d = new Date(Date.now() - 7 * 24 * 3600 * 1000)

    const [totalGroups, activeGroups, totalMessages24h, openAlerts, complaints24h, opportunities24h, recentActivity] = await Promise.all([
      db.group.count({ where: { tenantId } }),
      db.group.count({ where: { tenantId, lastMessageAt: { gte: since24h } } }),
      db.message.count({ where: { group: { tenantId }, createdAt: { gte: since24h } } }),
      db.alert.count({ where: { tenantId, status: 'OPEN' } }),
      db.alert.count({ where: { tenantId, label: 'COMPLAINT', createdAt: { gte: since7d } } }),
      db.alert.count({ where: { tenantId, label: 'OPPORTUNITY', createdAt: { gte: since7d } } }),
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
        messages24h: totalMessages24h,
        openAlerts,
        complaints7d: complaints24h,
        opportunities7d: opportunities24h,
      },
      recentActivity,
    }
  })
}
