import type { FastifyPluginAsync } from 'fastify'
import { randomBytes } from 'node:crypto'
import { db } from '../services/db.js'
import { invalidateTenantCache } from '../services/tenant-guard.js'

// Gatekeeper: header x-super-admin-token phải khớp env SUPER_ADMIN_TOKEN
function requireSuperAdmin(req: any, reply: any): boolean {
  const token = req.headers['x-super-admin-token'] as string | undefined
  const expected = process.env.SUPER_ADMIN_TOKEN
  if (!expected) {
    reply.status(500).send({ error: 'SUPER_ADMIN_TOKEN not set on server' })
    return false
  }
  if (token !== expected) {
    reply.status(401).send({ error: 'Unauthorized' })
    return false
  }
  return true
}

function generateLicenseKey(): string {
  // ZM-XXXX-XXXX-XXXX (hex, dễ đọc)
  const hex = randomBytes(6).toString('hex').toUpperCase()
  return `ZM-${hex.slice(0, 4)}-${hex.slice(4, 8)}-${hex.slice(8, 12)}`
}

export const superAdminRoutes: FastifyPluginAsync = async (app) => {
  // Middleware áp dụng cho toàn bộ prefix
  app.addHook('preHandler', async (req, reply) => {
    if (!requireSuperAdmin(req, reply)) return reply
  })

  // GET /api/super-admin/tenants — list toàn bộ tenants + usage
  app.get('/tenants', async () => {
    const tenants = await db.tenant.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { groups: true, users: true, customers: true } },
      },
    })
    return tenants.map((t) => ({
      id: t.id,
      name: t.name,
      slug: t.slug,
      industry: t.industry,
      plan: t.plan,
      active: t.active,
      suspendedReason: t.suspendedReason,
      licenseKey: t.licenseKey,
      licenseExpiresAt: t.licenseExpiresAt,
      contactName: t.contactName,
      contactPhone: t.contactPhone,
      contactEmail: t.contactEmail,
      notes: t.notes,
      setupDone: t.setupDone,
      createdAt: t.createdAt,
      maxGroups: t.maxGroups,
      maxMessagesPerMonth: t.maxMessagesPerMonth,
      messagesThisMonth: t.messagesThisMonth,
      usageResetAt: t.usageResetAt,
      stats: {
        groups: t._count.groups,
        users: t._count.users,
        customers: t._count.customers,
      },
      // Trạng thái tính toán
      status: computeStatus(t.active, t.licenseExpiresAt),
    }))
  })

  // GET /api/super-admin/metrics — tổng quan hệ thống
  app.get('/metrics', async () => {
    const [tenants, active, expired, totalGroups, totalMessages, totalCustomers] =
      await Promise.all([
        db.tenant.count(),
        db.tenant.count({ where: { active: true } }),
        db.tenant.count({
          where: { licenseExpiresAt: { lt: new Date() }, active: true },
        }),
        db.group.count(),
        db.message.count(),
        db.customer.count(),
      ])

    const byPlan = await db.tenant.groupBy({
      by: ['plan'],
      _count: true,
    })

    // Tenants hết hạn trong 7 ngày tới
    const nextWeek = new Date(Date.now() + 7 * 86400 * 1000)
    const expiringSoon = await db.tenant.findMany({
      where: {
        active: true,
        licenseExpiresAt: { gte: new Date(), lte: nextWeek },
      },
      select: { id: true, name: true, licenseExpiresAt: true, contactName: true },
      orderBy: { licenseExpiresAt: 'asc' },
    })

    return {
      totals: {
        tenants,
        active,
        suspended: tenants - active,
        expired,
        groups: totalGroups,
        messages: totalMessages,
        customers: totalCustomers,
      },
      byPlan: byPlan.map((p) => ({ plan: p.plan, count: p._count })),
      expiringSoon,
    }
  })

  // PATCH /api/super-admin/tenants/:id — update tenant (plan, limits, contact)
  app.patch('/tenants/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const body = req.body as {
      plan?: string
      maxGroups?: number
      maxMessagesPerMonth?: number
      contactName?: string
      contactPhone?: string
      contactEmail?: string
      notes?: string
      licenseExpiresAt?: string | null
    }

    const tenant = await db.tenant.findUnique({ where: { id } })
    if (!tenant) return reply.status(404).send({ error: 'Tenant not found' })

    const updated = await db.tenant.update({
      where: { id },
      data: {
        ...(body.plan !== undefined ? { plan: body.plan } : {}),
        ...(body.maxGroups !== undefined ? { maxGroups: body.maxGroups } : {}),
        ...(body.maxMessagesPerMonth !== undefined
          ? { maxMessagesPerMonth: body.maxMessagesPerMonth }
          : {}),
        ...(body.contactName !== undefined ? { contactName: body.contactName } : {}),
        ...(body.contactPhone !== undefined ? { contactPhone: body.contactPhone } : {}),
        ...(body.contactEmail !== undefined ? { contactEmail: body.contactEmail } : {}),
        ...(body.notes !== undefined ? { notes: body.notes } : {}),
        ...(body.licenseExpiresAt !== undefined
          ? {
              licenseExpiresAt: body.licenseExpiresAt
                ? new Date(body.licenseExpiresAt)
                : null,
            }
          : {}),
      },
    })
    return updated
  })

  // POST /api/super-admin/tenants/:id/suspend — tạm ngưng
  app.post('/tenants/:id/suspend', async (req, reply) => {
    const { id } = req.params as { id: string }
    const { reason } = (req.body as { reason?: string }) ?? {}
    const tenant = await db.tenant.findUnique({ where: { id } })
    if (!tenant) return reply.status(404).send({ error: 'Tenant not found' })

    const updated = await db.tenant.update({
      where: { id },
      data: { active: false, suspendedReason: reason ?? 'Tạm ngưng bởi super-admin' },
    })
    invalidateTenantCache(id)
    return updated
  })

  // POST /api/super-admin/tenants/:id/activate — bật lại
  app.post('/tenants/:id/activate', async (req, reply) => {
    const { id } = req.params as { id: string }
    const tenant = await db.tenant.findUnique({ where: { id } })
    if (!tenant) return reply.status(404).send({ error: 'Tenant not found' })

    const updated = await db.tenant.update({
      where: { id },
      data: { active: true, suspendedReason: null },
    })
    invalidateTenantCache(id)
    return updated
  })

  // POST /api/super-admin/tenants/:id/license — cấp / gia hạn license
  app.post('/tenants/:id/license', async (req, reply) => {
    const { id } = req.params as { id: string }
    const body = req.body as {
      months?: number        // gia hạn thêm n tháng (tính từ hạn cũ hoặc now)
      expiresAt?: string     // set cụ thể
      regenerate?: boolean   // tạo key mới
    }

    const tenant = await db.tenant.findUnique({ where: { id } })
    if (!tenant) return reply.status(404).send({ error: 'Tenant not found' })

    let licenseExpiresAt = tenant.licenseExpiresAt
    if (body.expiresAt !== undefined) {
      licenseExpiresAt = body.expiresAt ? new Date(body.expiresAt) : null
    } else if (body.months && body.months > 0) {
      const base =
        tenant.licenseExpiresAt && tenant.licenseExpiresAt > new Date()
          ? tenant.licenseExpiresAt
          : new Date()
      const next = new Date(base)
      next.setMonth(next.getMonth() + body.months)
      licenseExpiresAt = next
    }

    const licenseKey =
      body.regenerate || !tenant.licenseKey ? generateLicenseKey() : tenant.licenseKey

    const updated = await db.tenant.update({
      where: { id },
      data: {
        licenseKey,
        licenseExpiresAt,
        // Gia hạn → tự động bật lại nếu đang bị suspend do hết hạn
        ...(licenseExpiresAt && licenseExpiresAt > new Date()
          ? { active: true, suspendedReason: null }
          : {}),
      },
    })
    invalidateTenantCache(id)
    return updated
  })

  // POST /api/super-admin/tenants/:id/reset-usage — reset counter message/tháng
  app.post('/tenants/:id/reset-usage', async (req, reply) => {
    const { id } = req.params as { id: string }
    const tenant = await db.tenant.findUnique({ where: { id } })
    if (!tenant) return reply.status(404).send({ error: 'Tenant not found' })

    const updated = await db.tenant.update({
      where: { id },
      data: { messagesThisMonth: 0, usageResetAt: new Date() },
    })
    return updated
  })

  // DELETE /api/super-admin/tenants/:id — XOÁ tenant (cascade message, group, v.v.)
  // CHỈ dùng khi khách huỷ dịch vụ, cần có body { confirm: 'DELETE' }
  app.delete('/tenants/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const { confirm } = (req.body as { confirm?: string }) ?? {}
    if (confirm !== 'DELETE') {
      return reply
        .status(400)
        .send({ error: 'Missing confirm=DELETE in body to confirm deletion' })
    }
    const tenant = await db.tenant.findUnique({ where: { id } })
    if (!tenant) return reply.status(404).send({ error: 'Tenant not found' })

    // Xoá theo thứ tự dependency (Prisma không có cascade nếu không khai báo)
    await db.$transaction([
      db.messageAnalysis.deleteMany({
        where: { message: { group: { tenantId: id } } },
      }),
      db.alert.deleteMany({ where: { tenantId: id } }),
      db.message.deleteMany({ where: { group: { tenantId: id } } }),
      db.group.deleteMany({ where: { tenantId: id } }),
      db.deal.deleteMany({ where: { tenantId: id } }),
      db.customer.deleteMany({ where: { tenantId: id } }),
      db.alertRule.deleteMany({ where: { tenantId: id } }),
      db.classificationConfig.deleteMany({ where: { tenantId: id } }),
      db.notificationChannel.deleteMany({ where: { tenantId: id } }),
      db.user.deleteMany({ where: { tenantId: id } }),
      db.tenant.delete({ where: { id } }),
    ])
    return { ok: true }
  })
}

function computeStatus(
  active: boolean,
  licenseExpiresAt: Date | null
): 'active' | 'trial' | 'expired' | 'suspended' {
  if (!active) return 'suspended'
  if (!licenseExpiresAt) return 'trial'
  if (licenseExpiresAt < new Date()) return 'expired'
  return 'active'
}
