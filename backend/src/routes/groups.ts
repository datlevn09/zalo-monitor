import type { FastifyPluginAsync } from 'fastify'
import { db } from '../services/db.js'

export const groupRoutes: FastifyPluginAsync = async (app) => {
  // GET /api/groups — list groups visible to current user.
  // STAFF: chỉ thấy groups mà họ sở hữu (ownerUserId = userId của họ) + groups chung
  //        (ownerUserId = null, từ legacy hoặc shared).
  // OWNER/MANAGER: thấy hết tenant (trừ khi ?scope=mine).
  app.get('/', async (req, reply) => {
    const tenantId = req.headers['x-tenant-id'] as string
    if (!tenantId) return reply.status(400).send({ error: 'Missing tenant id' })

    const auth = req.authUser
    const scope = (req.query as any)?.scope as string | undefined
    const seeAll = auth && (auth.role === 'OWNER' || auth.role === 'MANAGER') && scope !== 'mine'

    const where: any = { tenantId }
    if (!seeAll && auth) {
      where.OR = [{ ownerUserId: auth.userId }, { ownerUserId: null }]
    }

    const groups = await db.group.findMany({
      where,
      orderBy: { lastMessageAt: 'desc' },
      include: {
        _count: { select: { messages: true, alerts: true } },
        ownerUser: { select: { id: true, name: true } },
      },
    })
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
}
