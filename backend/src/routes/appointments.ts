import type { FastifyInstance } from 'fastify'
import { db } from '../services/db.js'

export async function appointmentRoutes(app: FastifyInstance) {
  // List
  app.get('/', async (req) => {
    const tenantId = req.headers['x-tenant-id'] as string
    const { status, from, to } = req.query as Record<string, string>
    return db.appointment.findMany({
      where: {
        tenantId,
        ...(status ? { status: status as any } : {}),
        ...(from || to ? {
          scheduledAt: {
            ...(from ? { gte: new Date(from) } : {}),
            ...(to   ? { lte: new Date(to)   } : {}),
          },
        } : {}),
      },
      orderBy: { scheduledAt: 'asc' },
    })
  })

  // Create
  app.post<{ Body: {
    title: string; description?: string; customerId?: string; groupId?: string
    assignedTo?: string; scheduledAt: string; remindBefore?: number
  } }>('/', async (req, reply) => {
    const tenantId = req.headers['x-tenant-id'] as string
    const { title, description, customerId, groupId, assignedTo, scheduledAt, remindBefore } = req.body
    if (!title || !scheduledAt) return reply.status(400).send({ error: 'title và scheduledAt là bắt buộc' })
    return db.appointment.create({
      data: {
        tenantId, title, description, customerId, groupId, assignedTo,
        scheduledAt: new Date(scheduledAt),
        remindBefore: remindBefore ?? 30,
      },
    })
  })

  // Update
  app.patch<{ Params: { id: string }; Body: Record<string, any> }>('/:id', async (req, reply) => {
    const tenantId = req.headers['x-tenant-id'] as string
    const appt = await db.appointment.findFirst({ where: { id: req.params.id, tenantId } })
    if (!appt) return reply.status(404).send({ error: 'Not found' })
    const { title, description, customerId, groupId, assignedTo, scheduledAt, remindBefore, status } = req.body
    return db.appointment.update({
      where: { id: req.params.id },
      data: {
        ...(title       !== undefined ? { title }                           : {}),
        ...(description !== undefined ? { description }                     : {}),
        ...(customerId  !== undefined ? { customerId }                      : {}),
        ...(groupId     !== undefined ? { groupId }                         : {}),
        ...(assignedTo  !== undefined ? { assignedTo }                      : {}),
        ...(scheduledAt !== undefined ? { scheduledAt: new Date(scheduledAt), reminderSent: false } : {}),
        ...(remindBefore!== undefined ? { remindBefore }                    : {}),
        ...(status      !== undefined ? { status }                          : {}),
      },
    })
  })

  // Delete
  app.delete<{ Params: { id: string } }>('/:id', async (req, reply) => {
    const tenantId = req.headers['x-tenant-id'] as string
    const appt = await db.appointment.findFirst({ where: { id: req.params.id, tenantId } })
    if (!appt) return reply.status(404).send({ error: 'Not found' })
    await db.appointment.delete({ where: { id: req.params.id } })
    return { ok: true }
  })
}
