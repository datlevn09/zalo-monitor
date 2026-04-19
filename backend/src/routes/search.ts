/**
 * Full-text search endpoint — tìm tin nhắn theo text + filter.
 */

import type { FastifyPluginAsync } from 'fastify'
import { db } from '../services/db.js'

export const searchRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', async (req, reply) => {
    const tenantId = req.headers['x-tenant-id'] as string
    if (!tenantId) return reply.status(400).send({ error: 'Missing tenant id' })

    const { q, label, groupId, days, limit } = req.query as {
      q?: string; label?: string; groupId?: string; days?: string; limit?: string
    }

    const take = Math.min(Number(limit ?? 50), 200)
    const sinceDays = days ? Number(days) : 30
    const since = new Date(Date.now() - sinceDays * 24 * 3600 * 1000)

    const where: any = {
      group: { tenantId },
      sentAt: { gte: since },
    }
    if (q) where.content = { contains: q, mode: 'insensitive' }
    if (groupId) where.groupId = groupId
    if (label) where.analysis = { label: label as any }

    const [messages, totalCount] = await Promise.all([
      db.message.findMany({
        where,
        orderBy: { sentAt: 'desc' },
        take,
        include: {
          group: { select: { id: true, name: true, channelType: true } },
          analysis: { select: { label: true, priority: true, reason: true } },
        },
      }),
      db.message.count({ where }),
    ])

    return { messages, totalCount, returned: messages.length }
  })
}
