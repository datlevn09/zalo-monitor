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

    // Board scope: user chọn 1 board cụ thể (của mình hoặc của người khác)
    if (boardUserId) {
      const isOwnBoard = boardUserId === auth?.userId
      // Nếu xem board người khác → cần BoardAccess
      if (!isOwnBoard) {
        const hasAccess = await db.boardAccess.findFirst({
          where: { boardUserId, viewerUserId: auth?.userId ?? '', tenantId },
        })
        if (!hasAccess) return reply.status(403).send({ error: 'Không có quyền xem board này' })
      }
      // Board của tôi: groups owned (ownerUserId = me) HOẶC legacy (ownerUserId IS NULL)
      // Board người khác (đã pass BoardAccess): chỉ groups họ sở hữu
      const where: any = isOwnBoard
        ? { tenantId, OR: [{ ownerUserId: boardUserId }, { ownerUserId: null }] }
        : { tenantId, ownerUserId: boardUserId }
      const groups = await db.group.findMany({
        where,
        orderBy: { lastMessageAt: 'desc' },
        include: {
          _count: { select: { messages: true, alerts: true } },
          ownerUser: { select: { id: true, name: true } },
          messages: {
            orderBy: { sentAt: 'desc' },
            take: 1,
            select: { content: true, contentType: true, senderName: true, senderType: true, sentAt: true },
          },
        },
      })
      return groups
    }

    // 'Board của tôi' = CHỈ groups của user đang login (mọi role, kể cả OWNER/MANAGER).
    // - Manager xem nhân viên/CEO chia sẻ → switch qua BoardSwitcher (boardUserId)
    // - Manager xem tổng tenant → ?scope=all (admin view)
    // Legacy null-owner KHÔNG còn hiện ở 'Board của tôi' (đã backfill về OWNER của tenant).
    const seeAll = scope === 'all' && auth && (auth.role === 'OWNER' || auth.role === 'MANAGER')

    const where: any = { tenantId }
    if (!seeAll && auth) {
      const perms = await db.groupPermission.findMany({
        where: { tenantId, userId: auth.userId },
        select: { groupId: true },
      })
      const permGroupIds = perms.map(p => p.groupId)
      where.OR = [
        { ownerUserId: auth.userId },
        { id: { in: permGroupIds } },
      ]
    }

    // Apply pinned filter: if user is STAFF and has pinnedGroupIds, or if ?pinned=true
    let groups = await db.group.findMany({
      where,
      orderBy: { lastMessageAt: 'desc' },
      include: {
        _count: { select: { messages: true, alerts: true } },
        ownerUser: { select: { id: true, name: true } },
        messages: {
          orderBy: { sentAt: 'desc' },
          take: 1,
          select: { content: true, contentType: true, senderName: true, senderType: true, sentAt: true },
        },
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

  // POST /api/groups/bulk-monitor — bật/tắt monitor cho tất cả nhóm Zalo cùng lúc
  // Body: { enabled: true | false, channelType?: 'ZALO' | 'TELEGRAM' | ... }
  app.post('/bulk-monitor', async (req, reply) => {
    const tenantId = req.headers['x-tenant-id'] as string
    if (!tenantId) return reply.status(400).send({ error: 'Missing tenant id' })
    const auth = req.authUser
    if (!auth || (auth.role !== 'OWNER' && auth.role !== 'MANAGER')) {
      return reply.status(403).send({ error: 'Cần quyền OWNER hoặc MANAGER' })
    }
    const body = req.body as { enabled?: boolean; channelType?: string }
    if (typeof body.enabled !== 'boolean') return reply.status(400).send({ error: 'enabled (boolean) bắt buộc' })

    const result = await db.group.updateMany({
      where: {
        tenantId,
        ...(body.channelType ? { channelType: body.channelType as any } : {}),
      },
      data: { monitorEnabled: body.enabled },
    })
    return { ok: true, updated: result.count }
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

  // POST /api/groups/:id/upload — upload file (ảnh/video/file) → trả URL public
  app.post('/:id/upload', async (req, reply) => {
    const tenantId = req.headers['x-tenant-id'] as string
    if (!tenantId) return reply.status(400).send({ error: 'Missing tenant id' })
    const auth = req.authUser
    if (!auth) return reply.status(401).send({ error: 'Unauthorized' })

    const data = await (req as any).file()
    if (!data) return reply.status(400).send({ error: 'No file' })

    const fs = await import('node:fs')
    const path = await import('node:path')
    const crypto = await import('node:crypto')
    const UPLOAD_DIR = process.env.UPLOAD_DIR || '/app/uploads'
    const subDir = path.join(UPLOAD_DIR, tenantId)
    fs.mkdirSync(subDir, { recursive: true })

    const ext = path.extname(data.filename || '') || '.bin'
    const filename = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`
    const filepath = path.join(subDir, filename)
    const buffer = await data.toBuffer()
    fs.writeFileSync(filepath, buffer)

    const publicUrl = `${process.env.PUBLIC_BACKEND_URL || ''}/uploads/${tenantId}/${filename}`
    const mime = data.mimetype || 'application/octet-stream'
    const mediaType = mime.startsWith('image/') ? 'image' : mime.startsWith('video/') ? 'video' : 'file'

    return { ok: true, url: publicUrl, mediaType, filename: data.filename, size: buffer.length, mime }
  })

  // POST /api/groups/:id/send — gửi tin nhắn (text/image/video/file) vào nhóm Zalo
  app.post('/:id/send', async (req, reply) => {
    const tenantId = req.headers['x-tenant-id'] as string
    const auth = req.authUser
    const { id } = req.params as { id: string }
    const { text, mediaUrl, mediaType } = req.body as {
      text?: string
      mediaUrl?: string
      mediaType?: 'image' | 'video' | 'file'
    }

    if (!text?.trim() && !mediaUrl?.trim()) {
      return reply.status(400).send({ error: 'Cần text hoặc mediaUrl' })
    }

    const group = await db.group.findFirst({ where: { id, tenantId } })
    if (!group) return reply.status(404).send({ error: 'Group not found' })
    if (group.channelType !== 'ZALO') return reply.status(400).send({ error: 'Chỉ hỗ trợ gửi tin cho nhóm Zalo' })

    const trimmedText = (text ?? '').trim()
    const cleanMediaUrl = mediaUrl?.trim() || null
    const cleanMediaType = (cleanMediaUrl ? (mediaType ?? 'file') : null)

    // Listener architecture mới: luôn queue (docker exec đã bị bỏ)
    await db.sendQueue.create({
      data: {
        tenantId,
        groupExternalId: group.externalId,
        text: trimmedText,
        mediaUrl: cleanMediaUrl,
        mediaType: cleanMediaType,
      },
    })

    // Optimistic update DB để UI thấy tin ngay (status pending)
    const msg = await db.message.create({
      data: {
        groupId: group.id,
        externalId: `sent-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        senderType: 'SELF',
        senderId: auth?.userId ?? 'bot',
        senderName: 'Bot',
        contentType: cleanMediaType === 'image' ? 'IMAGE' : cleanMediaType === 'video' ? 'VIDEO' : cleanMediaType === 'file' ? 'FILE' : 'TEXT',
        content: trimmedText || cleanMediaUrl || '',
        attachments: cleanMediaUrl ? [cleanMediaUrl] : undefined,
        sentAt: new Date(),
      },
    })
    await db.group.update({ where: { id }, data: { lastMessageAt: new Date() } })
    return { ok: true, queued: true, message: msg }
  })
}
