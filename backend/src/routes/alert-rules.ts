import type { FastifyPluginAsync } from 'fastify'
import { db } from '../services/db.js'

export const alertRuleRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', async (req, reply) => {
    const tenantId = req.headers['x-tenant-id'] as string
    if (!tenantId) return reply.status(400).send({ error: 'Missing tenant id' })
    return db.alertRule.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' } })
  })

  app.post('/', async (req, reply) => {
    const tenantId = req.headers['x-tenant-id'] as string
    const body = req.body as any
    return db.alertRule.create({
      data: {
        tenantId,
        name: body.name,
        enabled: body.enabled ?? true,
        keywords: body.keywords ?? [],
        groupIds: body.groupIds ?? [],
        labels: body.labels ?? [],
        minPriority: body.minPriority ?? 'HIGH',
        notifyVia: body.notifyVia ?? ['telegram'],
        cooldownMin: body.cooldownMin ?? 10,
      },
    })
  })

  app.patch('/:id', async (req, reply) => {
    const tenantId = req.headers['x-tenant-id'] as string
    const { id } = req.params as { id: string }
    const rule = await db.alertRule.findFirst({ where: { id, tenantId } })
    if (!rule) return reply.status(404).send({ error: 'Not found' })
    return db.alertRule.update({ where: { id }, data: req.body as any })
  })

  app.delete('/:id', async (req, reply) => {
    const tenantId = req.headers['x-tenant-id'] as string
    const { id } = req.params as { id: string }
    const rule = await db.alertRule.findFirst({ where: { id, tenantId } })
    if (!rule) return reply.status(404).send({ error: 'Not found' })
    await db.alertRule.delete({ where: { id } })
    return { ok: true }
  })
}
