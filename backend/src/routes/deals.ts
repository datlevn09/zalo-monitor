import type { FastifyPluginAsync } from 'fastify'
import { db } from '../services/db.js'

export const dealRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', async (req, reply) => {
    const tenantId = req.headers['x-tenant-id'] as string
    if (!tenantId) return reply.status(400).send({ error: 'Missing tenant id' })

    const deals = await db.deal.findMany({
      where: { tenantId },
      include: { customer: { select: { id: true, name: true, phone: true, tag: true } } },
      orderBy: { createdAt: 'desc' },
    })
    return deals
  })

  app.post('/', async (req, reply) => {
    const tenantId = req.headers['x-tenant-id'] as string
    const body = req.body as any
    return db.deal.create({
      data: {
        tenantId, title: body.title,
        stage: body.stage ?? 'NEW',
        value: body.value ?? 0,
        description: body.description,
        customerId: body.customerId,
        assignedTo: body.assignedTo,
        dueDate: body.dueDate ? new Date(body.dueDate) : null,
      },
    })
  })

  app.patch('/:id', async (req, reply) => {
    const tenantId = req.headers['x-tenant-id'] as string
    const { id } = req.params as { id: string }
    const body = req.body as any
    const deal = await db.deal.findFirst({ where: { id, tenantId } })
    if (!deal) return reply.status(404).send({ error: 'Not found' })

    const closedAt = (body.stage === 'WON' || body.stage === 'LOST') ? new Date() : null

    return db.deal.update({
      where: { id },
      data: {
        ...(body.title !== undefined ? { title: body.title } : {}),
        ...(body.stage ? { stage: body.stage, closedAt } : {}),
        ...(body.value !== undefined ? { value: body.value } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
        ...(body.assignedTo !== undefined ? { assignedTo: body.assignedTo } : {}),
      },
    })
  })

  app.delete('/:id', async (req, reply) => {
    const tenantId = req.headers['x-tenant-id'] as string
    const { id } = req.params as { id: string }
    const deal = await db.deal.findFirst({ where: { id, tenantId } })
    if (!deal) return reply.status(404).send({ error: 'Not found' })
    await db.deal.delete({ where: { id } })
    return { ok: true }
  })
}
