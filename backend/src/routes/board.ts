/**
 * Board access endpoints
 * GET  /api/board/mine           — list boards current user can view (own + granted)
 * GET  /api/board/:userId/viewers — list viewers of userId's board (owner only)
 * POST /api/board/:userId/viewers — grant viewer access to someone
 * DELETE /api/board/:userId/viewers/:viewerId — revoke access
 */
import type { FastifyPluginAsync } from 'fastify'
import { db } from '../services/db.js'

export const boardRoutes: FastifyPluginAsync = async (app) => {
  // GET /api/board/mine — boards accessible to current user
  app.get('/mine', async (req, reply) => {
    const auth = req.authUser
    if (!auth) return reply.status(401).send({ error: 'Unauthorized' })

    // Fetch own user info for display name
    const me = await db.user.findUnique({ where: { id: auth.userId }, select: { name: true } })

    // Own board (always accessible)
    const own = { userId: auth.userId, userName: me?.name ?? 'Me', isOwn: true, role: auth.role }

    // Boards granted to me
    const granted = await db.boardAccess.findMany({
      where: { viewerUserId: auth.userId, tenantId: auth.tenantId },
      include: { boardUser: { select: { id: true, name: true, role: true } } },
    })

    const boards = [
      own,
      ...granted.map(a => ({
        userId: a.boardUser.id,
        userName: a.boardUser.name,
        isOwn: false,
        role: a.boardUser.role,
      }))
    ]

    return { boards }
  })

  // GET /api/board/:userId/viewers — who can see userId's board
  app.get('/:userId/viewers', async (req, reply) => {
    const auth = req.authUser
    if (!auth) return reply.status(401).send({ error: 'Unauthorized' })
    const { userId } = req.params as { userId: string }

    // Only the board owner or manager/owner can view
    if (userId !== auth.userId && auth.role === 'STAFF') {
      return reply.status(403).send({ error: 'Không đủ quyền' })
    }

    const viewers = await db.boardAccess.findMany({
      where: { boardUserId: userId, tenantId: auth.tenantId },
      include: {
        viewerUser: { select: { id: true, name: true, email: true, role: true } },
      },
      orderBy: { createdAt: 'asc' },
    })

    // License check: how many viewers allowed
    const tenant = await db.tenant.findUnique({
      where: { id: auth.tenantId },
      select: { maxBoardViewers: true },
    })

    return {
      viewers: viewers.map(v => ({
        id: v.id,
        viewerUserId: v.viewerUserId,
        name: v.viewerUser.name,
        email: v.viewerUser.email,
        role: v.viewerUser.role,
        grantedAt: v.createdAt,
      })),
      count: viewers.length,
      maxViewers: tenant?.maxBoardViewers ?? 0, // 0 = unlimited
    }
  })

  // POST /api/board/:userId/viewers — grant view access
  app.post('/:userId/viewers', async (req, reply) => {
    const auth = req.authUser
    if (!auth) return reply.status(401).send({ error: 'Unauthorized' })
    const { userId } = req.params as { userId: string }

    // Only the board owner can grant access
    if (userId !== auth.userId) {
      return reply.status(403).send({ error: 'Chỉ chủ board mới được cấp quyền xem' })
    }

    const { viewerUserId } = req.body as { viewerUserId: string }
    if (!viewerUserId) return reply.status(400).send({ error: 'viewerUserId required' })

    // Verify viewer is in same tenant
    const viewer = await db.user.findFirst({ where: { id: viewerUserId, tenantId: auth.tenantId } })
    if (!viewer) return reply.status(404).send({ error: 'Người dùng không tồn tại' })

    // License check
    const tenant = await db.tenant.findUnique({ where: { id: auth.tenantId }, select: { maxBoardViewers: true } })
    if (tenant && tenant.maxBoardViewers > 0) {
      const currentCount = await db.boardAccess.count({ where: { boardUserId: userId, tenantId: auth.tenantId } })
      if (currentCount >= tenant.maxBoardViewers) {
        return reply.status(403).send({
          error: `Đã đạt giới hạn ${tenant.maxBoardViewers} người xem board. Nâng cấp license để thêm.`,
          code: 'LICENSE_LIMIT'
        })
      }
    }

    const access = await db.boardAccess.upsert({
      where: { boardUserId_viewerUserId: { boardUserId: userId, viewerUserId } },
      create: { tenantId: auth.tenantId, boardUserId: userId, viewerUserId, grantedBy: auth.userId },
      update: { grantedBy: auth.userId },
    })

    return { ok: true, id: access.id }
  })

  // DELETE /api/board/:userId/viewers/:viewerId — revoke
  app.delete('/:userId/viewers/:viewerId', async (req, reply) => {
    const auth = req.authUser
    if (!auth) return reply.status(401).send({ error: 'Unauthorized' })
    const { userId, viewerId } = req.params as { userId: string; viewerId: string }

    if (userId !== auth.userId && auth.role === 'STAFF') {
      return reply.status(403).send({ error: 'Không đủ quyền' })
    }

    await db.boardAccess.deleteMany({
      where: { boardUserId: userId, viewerUserId: viewerId, tenantId: auth.tenantId },
    })

    return { ok: true }
  })
}
