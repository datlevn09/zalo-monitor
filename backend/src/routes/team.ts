import type { FastifyPluginAsync } from 'fastify'
import { db } from '../services/db.js'
import { createHash, randomBytes } from 'crypto'
import { sendMail } from '../services/mailer.js'

function hashPassword(p: string) {
  return createHash('sha256').update(p).digest('hex')
}

export const teamRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', async (req, reply) => {
    const tenantId = req.headers['x-tenant-id'] as string
    if (!tenantId) return reply.status(400).send({ error: 'Missing tenant id' })

    const users = await db.user.findMany({
      where: { tenantId },
      select: {
        id: true, name: true, email: true, role: true, createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    })
    // Count assigned alerts per user
    const counts = await db.alert.groupBy({
      by: ['assignedTo'], where: { tenantId },
      _count: { id: true },
    })
    const countMap = new Map(counts.filter(c => c.assignedTo).map(c => [c.assignedTo, c._count.id]))
    return users.map(u => ({ ...u, assignedAlerts: countMap.get(u.id) ?? 0 }))
  })

  // Invite — OWNER nhập email + role, hệ thống gửi email "Set password" cho người được mời.
  // Tạo user với random password + reset token (hạn 7 ngày — dài hơn forgot-password vì chưa
  // login bao giờ). Khi người được mời click link → đặt pass → tự login.
  app.post('/invite', async (req, reply) => {
    const tenantId = req.headers['x-tenant-id'] as string
    if (!tenantId) return reply.status(400).send({ error: 'Missing tenant id' })

    const body = req.body as { name: string; email: string; role?: 'MANAGER' | 'STAFF' }
    if (!body.name || !body.email) return reply.status(400).send({ error: 'Thiếu tên hoặc email' })

    // Check duplicate trong tenant
    const existing = await db.user.findFirst({ where: { tenantId, email: body.email } })
    if (existing) return reply.status(409).send({ error: 'Email đã tồn tại trong doanh nghiệp này' })

    const tenant = await db.tenant.findUnique({ where: { id: tenantId }, select: { name: true } })
    const inviteToken = randomBytes(32).toString('hex')
    const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 ngày

    // Random password — user sẽ set lại qua link, giá trị này không dùng được để login
    const tempPass = randomBytes(16).toString('hex')

    const user = await db.user.create({
      data: {
        tenantId,
        name: body.name,
        email: body.email,
        passwordHash: hashPassword(tempPass),
        role: body.role ?? 'STAFF',
        resetToken: inviteToken,
        resetTokenExpires: expires,
      },
    })

    const base = process.env.DASHBOARD_URL ?? 'http://localhost:3000'
    const inviteLink = `${base}/reset-password?token=${inviteToken}&invite=1`

    await sendMail({
      to: body.email,
      subject: `[${tenant?.name ?? 'Zalo Monitor'}] Bạn được mời tham gia dashboard`,
      text: `Xin chào ${body.name},

Bạn được mời tham gia dashboard Zalo Monitor của ${tenant?.name ?? 'doanh nghiệp'} với vai trò ${body.role ?? 'STAFF'}.

Bấm vào link dưới đây để đặt mật khẩu và bắt đầu sử dụng:

${inviteLink}

Link hết hạn sau 7 ngày.

— Zalo Monitor`,
      html: `<p>Xin chào <b>${body.name}</b>,</p>
<p>Bạn được mời tham gia dashboard <b>${tenant?.name ?? 'Zalo Monitor'}</b> với vai trò <code>${body.role ?? 'STAFF'}</code>.</p>
<p>
  <a href="${inviteLink}" style="display:inline-block;padding:12px 24px;background:#2563eb;color:white;border-radius:12px;text-decoration:none;font-weight:600;">
    Đặt mật khẩu & đăng nhập
  </a>
</p>
<p style="color:#6b7280;font-size:12px;">Link hết hạn sau 7 ngày.</p>`,
    }).catch(err => req.log.error(err, 'Failed to send invite email'))

    return { id: user.id, email: user.email, role: user.role, invited: true }
  })

  app.patch('/:id', async (req, reply) => {
    const tenantId = req.headers['x-tenant-id'] as string
    const { id } = req.params as { id: string }
    const body = req.body as { role?: 'OWNER' | 'MANAGER' | 'STAFF'; name?: string }

    const user = await db.user.findFirst({ where: { id, tenantId } })
    if (!user) return reply.status(404).send({ error: 'Not found' })

    return db.user.update({
      where: { id },
      data: {
        ...(body.role ? { role: body.role } : {}),
        ...(body.name ? { name: body.name } : {}),
      },
    })
  })

  app.delete('/:id', async (req, reply) => {
    const tenantId = req.headers['x-tenant-id'] as string
    const { id } = req.params as { id: string }
    const user = await db.user.findFirst({ where: { id, tenantId } })
    if (!user) return reply.status(404).send({ error: 'Not found' })
    if (user.role === 'OWNER') return reply.status(400).send({ error: 'Cannot delete owner' })
    await db.user.delete({ where: { id } })
    return { ok: true }
  })

  // Assign alert to user
  app.post('/assign/:alertId', async (req, reply) => {
    const tenantId = req.headers['x-tenant-id'] as string
    const { alertId } = req.params as { alertId: string }
    const { userId } = req.body as { userId: string | null }

    const alert = await db.alert.findFirst({ where: { id: alertId, tenantId } })
    if (!alert) return reply.status(404).send({ error: 'Alert not found' })

    return db.alert.update({
      where: { id: alertId },
      data: { assignedTo: userId ?? null, status: userId ? 'IN_PROGRESS' : 'OPEN' },
    })
  })

  // GET /api/team/:id/groups — danh sách nhóm của 1 thành viên
  app.get('/:id/groups', async (req, reply) => {
    const tenantId = req.headers['x-tenant-id'] as string
    const { id } = req.params as { id: string }
    const user = await db.user.findFirst({ where: { id, tenantId } })
    if (!user) return reply.status(404).send({ error: 'Not found' })

    const perms = await db.groupPermission.findMany({
      where: { tenantId, userId: id },
      include: {
        group: {
          select: { id: true, name: true, channelType: true, lastMessageAt: true, _count: { select: { messages: true } } }
        }
      }
    })
    return perms.map(p => p.group)
  })

  // PUT /api/team/:id/groups — gán danh sách nhóm cho thành viên (thay thế toàn bộ)
  app.put('/:id/groups', async (req, reply) => {
    const tenantId = req.headers['x-tenant-id'] as string
    const auth = req.authUser
    if (auth?.role === 'STAFF') return reply.status(403).send({ error: 'Không đủ quyền' })
    const { id } = req.params as { id: string }
    const { groupIds } = req.body as { groupIds: string[] }

    const user = await db.user.findFirst({ where: { id, tenantId } })
    if (!user) return reply.status(404).send({ error: 'Not found' })

    // Delete all existing permissions for this user
    await db.groupPermission.deleteMany({ where: { tenantId, userId: id } })

    // Create new permissions
    if (groupIds.length > 0) {
      await db.groupPermission.createMany({
        data: groupIds.map(groupId => ({ tenantId, groupId, userId: id })),
        skipDuplicates: true,
      })
    }
    return { ok: true, assigned: groupIds.length }
  })

  // GET /api/team/permissions-matrix — all groups + all staff with permission status
  app.get('/permissions-matrix', async (req, reply) => {
    const tenantId = req.headers['x-tenant-id'] as string
    const auth = req.authUser
    if (auth?.role === 'STAFF') return reply.status(403).send({ error: 'Không đủ quyền' })

    const [groups, users, perms] = await Promise.all([
      db.group.findMany({
        where: { tenantId },
        select: { id: true, name: true, channelType: true },
        orderBy: { name: 'asc' }
      }),
      db.user.findMany({
        where: { tenantId },
        select: { id: true, name: true, role: true },
        orderBy: { createdAt: 'asc' }
      }),
      db.groupPermission.findMany({
        where: { tenantId },
        select: { userId: true, groupId: true }
      }),
    ])

    const matrix: Record<string, string[]> = {}
    for (const p of perms) {
      if (!matrix[p.userId]) matrix[p.userId] = []
      matrix[p.userId].push(p.groupId)
    }

    return { groups, users, matrix }
  })
}
