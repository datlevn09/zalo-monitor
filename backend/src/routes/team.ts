import type { FastifyPluginAsync } from 'fastify'
import { db } from '../services/db.js'
import { createHash } from 'crypto'

function hashPassword(p: string) {
  return createHash('sha256').update(p).digest('hex')
}

export const teamRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', async (req, reply) => {
    const tenantId = req.headers['x-tenant-id'] as string
    if (!tenantId) return reply.status(400).send({ error: 'Missing tenant id' })

    const users = await db.user.findMany({
      where: { tenantId },
      select: {
        id: true, name: true, email: true, role: true, createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    })
    // Count assigned alerts per user
    const counts = await db.alert.groupBy({
      by: ['assignedTo'], where: { tenantId },
      _count: { id: true },
    })
    const countMap = new Map(counts.filter(c => c.assignedTo).map(c => [c.assignedTo, c._count.id]))
    return users.map(u => ({ ...u, assignedAlerts: countMap.get(u.id) ?? 0 }))
  })

  app.post('/invite', async (req, reply) => {
    const tenantId = req.headers['x-tenant-id'] as string
    const body = req.body as { name: string; email: string; password: string; role?: 'MANAGER' | 'STAFF' }

    const user = await db.user.create({
      data: {
        tenantId, name: body.name, email: body.email,
        passwordHash: hashPassword(body.password),
        role: body.role ?? 'STAFF',
      },
    })
    return { id: user.id, email: user.email, role: user.role }
  })

  app.patch('/:id', async (req, reply) => {
    const tenantId = req.headers['x-tenant-id'] as string
    const { id } = req.params as { id: string }
    const body = req.body as { role?: 'OWNER' | 'MANAGER' | 'STAFF'; name?: string }

    const user = await db.user.findFirst({ where: { id, tenantId } })
    if (!user) return reply.status(404).send({ error: 'Not found' })

    return db.user.update({
      where: { id },
      data: {
        ...(body.role ? { role: body.role } : {}),
        ...(body.name ? { name: body.name } : {}),
      },
    })
  })

  app.delete('/:id', async (req, reply) => {
    const tenantId = req.headers['x-tenant-id'] as string
    const { id } = req.params as { id: string }
    const user = await db.user.findFirst({ where: { id, tenantId } })
    if (!user) return reply.status(404).send({ error: 'Not found' })
    if (user.role === 'OWNER') return reply.status(400).send({ error: 'Cannot delete owner' })
    await db.user.delete({ where: { id } })
    return { ok: true }
  })

  // Assign alert to user
  app.post('/assign/:alertId', async (req, reply) => {
    const tenantId = req.headers['x-tenant-id'] as string
    const { alertId } = req.params as { alertId: string }
    const { userId } = req.body as { userId: string | null }

    const alert = await db.alert.findFirst({ where: { id: alertId, tenantId } })
    if (!alert) return reply.status(404).send({ error: 'Alert not found' })

    return db.alert.update({
      where: { id: alertId },
      data: { assignedTo: userId ?? null, status: userId ? 'IN_PROGRESS' : 'OPEN' },
    })
  })
}
