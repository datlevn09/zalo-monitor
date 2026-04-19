import type { FastifyPluginAsync } from 'fastify'
import { db } from '../services/db.js'

// Public endpoint để liệt kê tenants — dùng cho quick-login trong setup page
export const tenantRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', async () => {
    const tenants = await db.tenant.findMany({
      select: {
        id: true, name: true, slug: true, industry: true,
        setupDone: true, createdAt: true,
        _count: { select: { groups: true } },
      },
      orderBy: { createdAt: 'desc' },
    })
    return tenants
  })

  // GET /api/tenants/current — thông tin tenant hiện tại (từ header)
  app.get('/current', async (req, reply) => {
    const tenantId = req.headers['x-tenant-id'] as string
    if (!tenantId) return reply.status(400).send({ error: 'Missing tenant id' })
    const tenant = await db.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true, name: true, slug: true, industry: true,
        enabledChannels: true, setupDone: true,
      },
    })
    if (!tenant) return reply.status(404).send({ error: 'Not found' })
    return tenant
  })

  // PATCH /api/tenants/current — update settings
  app.patch('/current', async (req, reply) => {
    const tenantId = req.headers['x-tenant-id'] as string
    if (!tenantId) return reply.status(400).send({ error: 'Missing tenant id' })

    const body = req.body as { name?: string; industry?: string; enabledChannels?: string[] }
    const updated = await db.tenant.update({
      where: { id: tenantId },
      data: {
        ...(body.name ? { name: body.name } : {}),
        ...(body.industry !== undefined ? { industry: body.industry } : {}),
        ...(body.enabledChannels ? { enabledChannels: body.enabledChannels } : {}),
      },
    })
    return updated
  })
}
