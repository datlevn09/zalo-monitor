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

  // PATCH /api/groups/:id — cập nhật category, monitorEnabled
  app.patch('/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const body = req.body as { category?: string; monitorEnabled?: boolean; name?: string }
    const group = await db.group.update({ where: { id }, data: body })
    return group
  })
}
