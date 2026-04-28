import type { FastifyPluginAsync } from 'fastify'
import { db } from '../services/db.js'
import { sendZaloMessage } from '../services/zalo-sync.js'

export const groupRoutes: FastifyPluginAsync = async (app) => {
  // GET /api/groups — list groups visible to current user.
  // STAFF: chỉ thấy groups mà họ sở hữu (ownerUserId = userId của họ) + groups chung
  //        (ownerUserId = null, từ legacy hoặc shared).
  // OWNER/MANAGER: thấy hết tenant (trừ khi ?scope=mine).
  // Pinned filter: nếu user có pinnedGroupIds không trống và là STAFF (hoặc ?pinned=true),
  //               chỉ show groups trong pinnedGroupIds.
  app.get('/', async (req, reply) => {
    const tenantId = req.headers['x-tenant-id'] as string
    if (!tenantId) return reply.status(400).send({ error: 'Missing tenant id' })

    const auth = req.authUser
    const scope = (req.query as any)?.scope as string | undefined
    const pinned = (req.query as any)?.pinned === 'true'
    const boardUserId = (req.query as any)?.boardUserId as string | undefined

    // Board scope: viewing someone else's board
    if (boardUserId && boardUserId !== auth?.userId) {
      // Must have BoardAccess to view this board
      const hasAccess = await db.boardAccess.findFirst({
        where: { boardUserId, viewerUserId: auth?.userId ?? '', tenantId },
      })
      if (!hasAccess) return reply.status(403).send({ error: 'Không có quyền xem board này' })

      // Return groups owned by the board user
      const groups = await db.group.findMany({
        where: { tenantId, ownerUserId: boardUserId },
        orderBy: { lastMessageAt: 'desc' },
        include: { _count: { select: { messages: true, alerts: true } }, ownerUser: { select: { id: true, name: true } } },
      })
      return groups
    }

    const seeAll = auth && (auth.role === 'OWNER' || auth.role === 'MANAGER') && scope !== 'mine'

    const where: any = { tenantId }
    if (!seeAll && auth) {
      // Get group IDs this staff has permission for via GroupPermission
      const perms = await db.groupPermission.findMany({
        where: { tenantId, userId: auth.userId },
        select: { groupId: true },
      })
      const permGroupIds = perms.map(p => p.groupId)
      // Show groups with explicit permission OR legacy groups (ownerUserId=null)
      where.OR = [
        { id: { in: permGroupIds } },
        { ownerUserId: null },
      ]
    }

    // Apply pinned filter: if user is STAFF and has pinnedGroupIds, or if ?pinned=true
    let groups = await db.group.findMany({
      where,
      orderBy: { lastMessageAt: 'desc' },
      include: {
        _count: { select: { messages: true, alerts: true } },
        ownerUser: { select: { id: true, name: true } },
      },
    })

    // Get user's pinnedGroupIds if STAFF or pinned=true
    if (auth && (auth.role === 'STAFF' || pinned)) {
      const user = await db.user.findUnique({
        where: { id: auth.userId },
        select: { pinnedGroupIds: true },
      })
      if (user && user.pinnedGroupIds.length > 0) {
        groups = groups.filter(g => user.pinnedGroupIds.includes(g.id))
      }
    }

    return groups
  })

  // PATCH /api/groups/:id — cập nhật category, monitorEnabled, ownerUserId
  app.patch('/:id', async (req, reply) => {
    const tenantId = req.headers['x-tenant-id'] as string
    const auth = req.authUser
    const { id } = req.params as { id: string }
    const body = req.body as { category?: string; monitorEnabled?: boolean; name?: string; ownerUserId?: string | null }

    // Chỉ OWNER/MANAGER mới được phân công lại nhóm
    if ('ownerUserId' in body && auth?.role === 'STAFF') {
      return reply.status(403).send({ error: 'Không đủ quyền' })
    }

    const group = await db.group.update({ where: { id }, data: body })
    return group
  })

  // GET /api/groups/unassigned — nhóm chưa phân công (ownerUserId = null)
  app.get('/unassigned', async (req) => {
    const tenantId = req.headers['x-tenant-id'] as string
    return db.group.findMany({
      where: { tenantId, ownerUserId: null },
      orderBy: { lastMessageAt: 'desc' },
      select: { id: true, name: true, channelType: true, lastMessageAt: true },
    })
  })

  // GET /api/groups/pins — get current user's pinned group IDs
  app.get('/pins', async (req, reply) => {
    const userId = req.authUser?.userId
    if (!userId) return reply.status(401).send({ error: 'Unauthorized' })

    const user = await db.user.findUnique({
      where: { id: userId },
      select: { pinnedGroupIds: true },
    })
    return { pinnedGroupIds: user?.pinnedGroupIds ?? [] }
  })

  // PUT /api/groups/pins — update user's pinned groups
  app.put('/pins', async (req, reply) => {
    const userId = req.authUser?.userId
    if (!userId) return reply.status(401).send({ error: 'Unauthorized' })

    const { groupIds } = req.body as { groupIds: string[] }
    if (!Array.isArray(groupIds)) {
      return reply.status(400).send({ error: 'groupIds must be an array' })
    }

    const user = await db.user.update({
      where: { id: userId },
      data: { pinnedGroupIds: groupIds },
      select: { pinnedGroupIds: true },
    })
    return { ok: true, pinnedGroupIds: user.pinnedGroupIds }
  })

  // POST /api/groups/:id/send — gửi tin nhắn vào nhóm Zalo
  app.post('/:id/send', async (req, reply) => {
    const tenantId = req.headers['x-tenant-id'] as string
    const auth = req.authUser
    const { id } = req.params as { id: string }
    const { text } = req.body as { text?: string }

    if (!text?.trim()) return reply.status(400).send({ error: 'text is required' })

    const group = await db.group.findFirst({ where: { id, tenantId } })
    if (!group) return reply.status(404).send({ error: 'Group not found' })
    if (group.channelType !== 'ZALO') return reply.status(400).send({ error: 'Chỉ hỗ trợ gửi tin cho nhóm Zalo' })

    const trimmed = text.trim()

    // Try docker exec directly first
    try {
      sendZaloMessage(group.externalId, trimmed)
      const msg = await db.message.create({
        data: {
          groupId: group.id,
          externalId: `sent-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          senderType: 'SELF',
          senderId: auth?.userId ?? 'bot',
          senderName: 'Bot',
          contentType: 'TEXT',
          content: trimmed,
          sentAt: new Date(),
        },
      })
      await db.group.update({ where: { id }, data: { lastMessageAt: new Date() } })
      return { ok: true, queued: false, message: msg }
    } catch {
      // Docker exec failed → queue for hook to pick up
      await db.sendQueue.create({
        data: { tenantId, groupExternalId: group.externalId, text: trimmed },
      })
      return { ok: true, queued: true }
    }
  })
}
