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
      maxBoardViewers: t.maxBoardViewers,
      maxHistorySyncDepth: t.maxHistorySyncDepth,
      messagesThisMonth: t.messagesThisMonth,
      usageResetAt: t.usageResetAt,
      stats: {
        groups: t._count.groups,
        users: t._count.users,
        customers: t._count.customers,
      },
      // Trạng thái tính toán
      status: computeStatus(t.active, t.licenseExpiresAt, t.setupDone),
    }))
  })

  // GET /api/super-admin/metrics — tổng quan hệ thống
  app.get('/metrics', async () => {
    const [tenants, active, expired, pending, totalGroups, totalMessages, totalCustomers] =
      await Promise.all([
        db.tenant.count(),
        db.tenant.count({ where: { active: true } }),
        db.tenant.count({
          where: { licenseExpiresAt: { lt: new Date() }, active: true },
        }),
        db.tenant.count({
          where: { active: false, setupDone: false },
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
        pending,
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
      maxBoardViewers?: number
      maxHistorySyncDepth?: number
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
        ...(body.maxMessagesPerMonth !== undefined ? { maxMessagesPerMonth: body.maxMessagesPerMonth } : {}),
        ...(body.maxBoardViewers !== undefined ? { maxBoardViewers: body.maxBoardViewers } : {}),
        ...(body.maxHistorySyncDepth !== undefined ? { maxHistorySyncDepth: body.maxHistorySyncDepth } : {}),
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
      db.groupPermission.deleteMany({ where: { tenantId: id } }),
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

  // GET /api/super-admin/tenants/:id — chi tiết 1 tenant: owner, users, groups by channel
  app.get('/tenants/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const tenant = await db.tenant.findUnique({
      where: { id },
      include: {
        users: { select: { id: true, name: true, email: true, role: true, createdAt: true } },
        _count: { select: { groups: true, users: true, customers: true, alerts: true } },
      },
    }) as any
    if (!tenant) return reply.status(404).send({ error: 'Tenant not found' })

    // Groups by channel type
    const groupsByChannel = await db.group.groupBy({
      by: ['channelType'],
      where: { tenantId: id },
      _count: { id: true },
    })

    // Hosting mode: có licenseKey → self-hosted, không có → SaaS (chạy trên NAS/VPS của anh)
    const hostingMode = tenant.licenseKey ? 'self-hosted' : 'saas'
    const owner = tenant.users.find((u: any) => u.role === 'OWNER')

    return {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      industry: tenant.industry,
      plan: tenant.plan,
      active: tenant.active,
      suspendedReason: tenant.suspendedReason,
      licenseKey: tenant.licenseKey,
      licenseExpiresAt: tenant.licenseExpiresAt,
      contactName: tenant.contactName,
      contactPhone: tenant.contactPhone,
      contactEmail: tenant.contactEmail,
      notes: tenant.notes,
      setupDone: tenant.setupDone,
      createdAt: tenant.createdAt,
      maxGroups: tenant.maxGroups,
      maxMessagesPerMonth: tenant.maxMessagesPerMonth,
      maxBoardViewers: tenant.maxBoardViewers,
      maxHistorySyncDepth: tenant.maxHistorySyncDepth,
      messagesThisMonth: tenant.messagesThisMonth,
      usageResetAt: tenant.usageResetAt,
      enabledChannels: tenant.enabledChannels,
      hostingMode,
      owner: owner ?? null,
      users: tenant.users,
      stats: {
        groups: tenant._count.groups,
        users: tenant._count.users,
        customers: tenant._count.customers,
        alerts: tenant._count.alerts,
      },
      groupsByChannel: groupsByChannel.map(g => ({ channel: g.channelType, count: g._count.id })),
      status: computeStatus(tenant.active, tenant.licenseExpiresAt, tenant.setupDone),
    }
  })

  // ── Permissions management (super-admin set group access for staff) ──────────

  // GET /api/super-admin/tenants/:id/permissions-matrix
  // Trả về tất cả nhóm, nhân viên, ma trận quyền — để super-admin thấy và chỉnh
  app.get('/tenants/:id/permissions-matrix', async (req, reply) => {
    const { id: tenantId } = req.params as { id: string }
    const tenant = await db.tenant.findUnique({ where: { id: tenantId }, select: { id: true } })
    if (!tenant) return reply.status(404).send({ error: 'Tenant not found' })

    const [groups, users, perms] = await Promise.all([
      db.group.findMany({
        where: { tenantId },
        select: { id: true, name: true, channelType: true },
        orderBy: { name: 'asc' },
      }),
      db.user.findMany({
        where: { tenantId },
        select: { id: true, name: true, email: true, role: true },
        orderBy: { createdAt: 'asc' },
      }),
      db.groupPermission.findMany({
        where: { tenantId },
        select: { userId: true, groupId: true },
      }),
    ])

    const matrix: Record<string, string[]> = {}
    for (const p of perms) {
      if (!matrix[p.userId]) matrix[p.userId] = []
      matrix[p.userId].push(p.groupId)
    }

    return { groups, users, matrix }
  })

  // PUT /api/super-admin/tenants/:id/users/:userId/groups
  // Super-admin gán danh sách nhóm cho 1 nhân viên (thay thế toàn bộ)
  app.put('/tenants/:id/users/:userId/groups', async (req, reply) => {
    const { id: tenantId, userId } = req.params as { id: string; userId: string }
    const { groupIds } = req.body as { groupIds: string[] }

    if (!Array.isArray(groupIds)) {
      return reply.status(400).send({ error: 'groupIds must be an array' })
    }

    const [tenant, user] = await Promise.all([
      db.tenant.findUnique({ where: { id: tenantId }, select: { id: true } }),
      db.user.findFirst({ where: { id: userId, tenantId }, select: { id: true, role: true } }),
    ])
    if (!tenant) return reply.status(404).send({ error: 'Tenant not found' })
    if (!user) return reply.status(404).send({ error: 'User not found in tenant' })

    await db.groupPermission.deleteMany({ where: { tenantId, userId } })
    if (groupIds.length > 0) {
      await db.groupPermission.createMany({
        data: groupIds.map(groupId => ({ tenantId, groupId, userId })),
        skipDuplicates: true,
      })
    }
    return { ok: true, userId, assigned: groupIds.length }
  })

  // GET /api/super-admin/tenants/:id/license — get license info for a tenant
  app.get('/tenants/:id/license', async (req, reply) => {
    const { id } = req.params as { id: string }
    const tenant = await db.tenant.findUnique({
      where: { id },
      select: { licenseKey: true, licenseExpiresAt: true, plan: true },
    })
    if (!tenant) return reply.status(404).send({ error: 'Tenant not found' })
    return {
      licenseKey: tenant.licenseKey,
      plan: tenant.plan,
      licenseExpiresAt: tenant.licenseExpiresAt,
    }
  })

  // POST /api/super-admin/tenants/:id/license — generate/update license key
  app.post('/tenants/:id/license', async (req, reply) => {
    const { id } = req.params as { id: string }
    const body = req.body as { plan?: string; expiresAt?: string | null }

    const tenant = await db.tenant.findUnique({ where: { id } })
    if (!tenant) return reply.status(404).send({ error: 'Tenant not found' })

    // Generate new license key: zm_${plan}_${randomBytes(24).toString('hex')}
    const plan = body.plan ?? tenant.plan
    const licenseKey = `zm_${plan}_${randomBytes(24).toString('hex')}`

    const updated = await db.tenant.update({
      where: { id },
      data: {
        licenseKey,
        plan,
        ...(body.expiresAt !== undefined
          ? {
              licenseExpiresAt: body.expiresAt
                ? new Date(body.expiresAt)
                : null,
            }
          : {}),
      },
    })
    invalidateTenantCache(id)
    return {
      licenseKey: updated.licenseKey,
      plan: updated.plan,
      licenseExpiresAt: updated.licenseExpiresAt,
    }
  })

  // POST /api/super-admin/tenants/:id/license/revoke — set licenseKey=null, active=false
  app.post('/tenants/:id/license/revoke', async (req, reply) => {
    const { id } = req.params as { id: string }
    const tenant = await db.tenant.findUnique({ where: { id } })
    if (!tenant) return reply.status(404).send({ error: 'Tenant not found' })

    const updated = await db.tenant.update({
      where: { id },
      data: {
        licenseKey: null,
        active: false,
        suspendedReason: 'License revoked',
      },
    })
    invalidateTenantCache(id)
    return updated
  })

  // POST /api/super-admin/tenants/:id/issue-trial — grant trial/license to pending tenant
  app.post('/tenants/:id/issue-trial', async (req, reply) => {
    const { id } = req.params as { id: string }
    const { days } = (req.body as { days?: number }) ?? {}
    const trialDays = days ?? 30

    const tenant = await db.tenant.findUnique({ where: { id } })
    if (!tenant) return reply.status(404).send({ error: 'Tenant not found' })

    const expiresAt = new Date(Date.now() + trialDays * 86400000)

    const updated = await db.tenant.update({
      where: { id },
      data: {
        active: true,
        licenseExpiresAt: expiresAt,
        suspendedReason: null,
      },
    })
    invalidateTenantCache(id)
    return updated
  })
}

function computeStatus(
  active: boolean,
  licenseExpiresAt: Date | null,
  setupDone: boolean
): 'active' | 'trial' | 'expired' | 'suspended' | 'pending' {
  if (!active && !setupDone) return 'pending'
  if (!active) return 'suspended'
  if (!licenseExpiresAt) return 'trial'
  if (licenseExpiresAt < new Date()) return 'expired'
  return 'active'
}
