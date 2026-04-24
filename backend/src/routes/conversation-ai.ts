import type { FastifyInstance } from 'fastify'
import { db } from '../services/db.js'
import { analyzeConversation } from '../services/ai.js'

export async function conversationAiRoutes(app: FastifyInstance) {
  app.post<{ Params: { id: string } }>('/:id/analyze', async (req, reply) => {
    const tenantId = req.headers['x-tenant-id'] as string
    const { id } = req.params

    const group = await db.group.findFirst({ where: { id, tenantId } })
    if (!group) return reply.status(404).send({ error: 'Group not found' })

    const messages = await db.message.findMany({
      where: { groupId: id },
      orderBy: { sentAt: 'asc' },
      take: 30,
      select: { content: true, senderName: true, senderType: true, sentAt: true },
    })

    const result = await analyzeConversation(messages)
    return result
  })
}
