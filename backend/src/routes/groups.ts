import type { FastifyPluginAsync } from 'fastify'
import { db } from '../services/db.js'

export const groupRoutes: FastifyPluginAsync = async (app) => {
  // GET /api/groups — list tất cả groups của tenant
  app.get('/', async (req, reply) => {
    const tenantId = req.headers['x-tenant-id'] as string
    if (!tenantId) return reply.status(400).send({ error: 'Missing tenant id' })

    const groups = await db.group.findMany({
      where: { tenantId },
      orderBy: { lastMessageAt: 'desc' },
      include: {
        _count: { select: { messages: true, alerts: true } },
      },
    })
    return groups
  })

  // PATCH /api/groups/:id — cập nhật category, monitorEnabled
  app.patch('/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const body = req.body as { category?: string; monitorEnabled?: boolean; name?: string }
    const group = await db.group.update({ where: { id }, data: body })
    return group
  })
}
