import type { FastifyPluginAsync } from 'fastify'
import { db } from '../services/db.js'
import { backfillCustomersFromAllMessages } from '../services/crm-extract.js'

export const customerRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', async (req, reply) => {
    const tenantId = req.headers['x-tenant-id'] as string
    if (!tenantId) return reply.status(400).send({ error: 'Missing tenant id' })
    const { tag, search } = req.query as { tag?: string; search?: string }

    const where: any = { tenantId }
    if (tag) where.tag = tag
    if (search) where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { phone: { contains: search } },
      { email: { contains: search, mode: 'insensitive' } },
    ]

    const customers = await db.customer.findMany({
      where,
      orderBy: { lastActivity: 'desc' },
      take: 200,
    })
    return customers
  })

  app.patch('/:id', async (req, reply) => {
    const tenantId = req.headers['x-tenant-id'] as string
    const { id } = req.params as { id: string }
    const body = req.body as any
    const customer = await db.customer.findFirst({ where: { id, tenantId } })
    if (!customer) return reply.status(404).send({ error: 'Not found' })

    return db.customer.update({
      where: { id },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.tag ? { tag: body.tag } : {}),
        ...(body.note !== undefined ? { note: body.note } : {}),
        ...(body.revenue !== undefined ? { revenue: body.revenue } : {}),
      },
    })
  })

  app.post('/backfill', async (req, reply) => {
    const tenantId = req.headers['x-tenant-id'] as string
    if (!tenantId) return reply.status(400).send({ error: 'Missing tenant id' })
    const r = await backfillCustomersFromAllMessages(tenantId)
    return { ok: true, ...r }
  })
}
