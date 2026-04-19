import type { FastifyPluginAsync } from 'fastify'
import { db } from '../services/db.js'

export const alertRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', async (req, reply) => {
    const tenantId = req.headers['x-tenant-id'] as string
    if (!tenantId) return reply.status(400).send({ error: 'Missing tenant id' })

    const { status, limit = '50' } = req.query as { status?: string; limit?: string }
    const alerts = await db.alert.findMany({
      where: { tenantId, ...(status ? { status: status as any } : {}) },
      orderBy: { createdAt: 'desc' },
      take: Number(limit),
      include: { group: { select: { name: true, category: true, externalId: true, channelType: true } } },
    })
    return alerts
  })

  app.patch('/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const body = req.body as { status: 'IN_PROGRESS' | 'RESOLVED' | 'IGNORED' }
    const alert = await db.alert.update({
      where: { id },
      data: { status: body.status, ...(body.status === 'RESOLVED' ? { resolvedAt: new Date() } : {}) },
    })
    return alert
  })
}
