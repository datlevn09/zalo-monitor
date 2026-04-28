import type { FastifyPluginAsync } from 'fastify'
import { db } from '../services/db.js'

export const messageRoutes: FastifyPluginAsync = async (app) => {
  // GET /api/messages?groupId=xxx&limit=50
  app.get('/', async (req, reply) => {
    const tenantId = req.headers['x-tenant-id'] as string
    const { groupId, limit = '50', cursor, showDeleted } = req.query as { groupId?: string; limit?: string; cursor?: string; showDeleted?: string }
    if (!tenantId) return reply.status(400).send({ error: 'Missing tenant id' })
    if (!groupId) return reply.status(400).send({ error: 'groupId required' })

    const group = await db.group.findFirst({ where: { id: groupId, tenantId } })
    if (!group) return reply.status(404).send({ error: 'Group not found' })

    // Per-user: STAFF chỉ đọc được message của group họ sở hữu (hoặc group shared ownerUserId=null)
    const auth = req.authUser
    if (auth && auth.role === 'STAFF' && group.ownerUserId && group.ownerUserId !== auth.userId) {
      return reply.status(403).send({ error: 'Group thuộc người khác, không có quyền xem' })
    }

    // Mặc định ẩn tin đã thu hồi. ?showDeleted=1 + role OWNER/MANAGER mới thấy
    const includeDeleted = showDeleted === '1' && (auth?.role === 'OWNER' || auth?.role === 'MANAGER')
    const messages = await db.message.findMany({
      where: {
        groupId,
        ...(includeDeleted ? {} : { deletedAt: null }),
      },
      orderBy: { sentAt: 'desc' },
      take: Number(limit),
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      include: { analysis: true },
    })
    return messages.reverse()
  })

  // POST /api/messages/classify-backlog — enqueue messages chưa classify
  app.post('/classify-backlog', async (req, reply) => {
    const tenantId = req.headers['x-tenant-id'] as string
    if (!tenantId) return reply.status(400).send({ error: 'Missing tenant id' })

    const { aiQueue } = await import('../services/queue.js')
    const msgs = await db.message.findMany({
      where: {
        group: { tenantId },
        senderType: 'CONTACT',
        analysis: null,
        content: { not: null },
      },
      select: { id: true, groupId: true, content: true },
      take: 500,
    })

    let enqueued = 0
    for (const m of msgs) {
      if (!m.content || m.content.trim().length < 3) continue
      await aiQueue.add('classify', { messageId: m.id, tenantId, groupId: m.groupId })
      enqueued++
    }
    return { ok: true, enqueued, total: msgs.length }
  })

  // POST /api/messages/sync-group — backfill historical messages
  app.post('/sync-group', async (req, reply) => {
    const tenantId = req.headers['x-tenant-id'] as string
    const { groupId } = req.body as { groupId: string }
    const group = await db.group.findFirst({ where: { id: groupId, tenantId } })
    if (!group) return reply.status(404).send({ error: 'Group not found' })

    // MVP stub — per-channel implementation comes later
    const capabilities: Record<string, { supported: boolean; note: string }> = {
      ZALO:     { supported: true,  note: 'Sẽ fetch qua zca-js (chưa implement)' },
      TELEGRAM: { supported: false, note: 'Telegram Bot API không hỗ trợ đọc tin cũ' },
      LARK:     { supported: false, note: 'Lark/Feishu chưa implement' },
    }
    const cap = capabilities[group.channelType] ?? { supported: false, note: 'Channel không được hỗ trợ' }

    return {
      ok: false,
      supported: cap.supported,
      message: cap.note,
      firstMessageAt: (await db.message.findFirst({
        where: { groupId },
        orderBy: { sentAt: 'asc' },
        select: { sentAt: true },
      }))?.sentAt,
    }
  })

  // GET /api/messages/:id — single message with context
  app.get('/:id/context', async (req, reply) => {
    const tenantId = req.headers['x-tenant-id'] as string
    const { id } = req.params as { id: string }

    const message = await db.message.findFirst({
      where: { id, group: { tenantId } },
      include: { group: true, analysis: true },
    })
    if (!message) return reply.status(404).send({ error: 'Not found' })

    const [before, after] = await Promise.all([
      db.message.findMany({
        where: { groupId: message.groupId, sentAt: { lt: message.sentAt } },
        orderBy: { sentAt: 'desc' },
        take: 5,
        include: { analysis: true },
      }),
      db.message.findMany({
        where: { groupId: message.groupId, sentAt: { gt: message.sentAt } },
        orderBy: { sentAt: 'asc' },
        take: 5,
        include: { analysis: true },
      }),
    ])

    return {
      message,
      context: [...before.reverse(), message, ...after],
    }
  })
}
