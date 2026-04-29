import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { db } from '../services/db.js'
import { createHash, randomBytes } from 'crypto'
import { sendMail } from '../services/mailer.js'

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  // tenantSlug optional — nếu user có 1 tenant duy nhất thì không cần
  tenantSlug: z.string().optional(),
})

const registerSchema = z.object({
  companyName: z.string().min(2),
  ownerName: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
  phone: z.string().optional(),
})

const forgotSchema = z.object({
  email: z.string().email(),
})

const resetSchema = z.object({
  token: z.string().min(10),
  password: z.string().min(6),
})

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
})

function hashPassword(password: string) {
  return createHash('sha256').update(password).digest('hex')
}

function publicUser(u: any) {
  return { id: u.id, name: u.name, email: u.email, role: u.role }
}

export const authRoutes: FastifyPluginAsync = async (app) => {
  // ── Register ────────────────────────────────────────────────────────────
  app.post('/register', async (req, reply) => {
    const body = registerSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: 'Invalid input' })

    const { companyName, ownerName, email, password, phone } = body.data

    // Email đã có → cho phép tạo tenant MỚI (1 user nhiều doanh nghiệp = nhiều Zalo)
    // Nhưng password phải MATCH user cũ để xác thực cùng người
    const existing = await db.user.findFirst({ where: { email } })
    let reusePasswordHash: string | null = null
    if (existing) {
      const inputHash = hashPassword(password)
      if (inputHash !== existing.passwordHash) {
        return reply.status(400).send({
          error: 'Email đã đăng ký với mật khẩu khác. Để tạo doanh nghiệp mới với cùng email, vui lòng nhập đúng mật khẩu hiện tại của email này.',
          code: 'PASSWORD_MISMATCH_EXISTING_EMAIL',
        })
      }
      reusePasswordHash = existing.passwordHash
    }

    // Generate slug from companyName (lowercase, spaces → hyphens, add random suffix)
    const baseSlug = companyName
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '')
      .slice(0, 30)
    const randomSuffix = randomBytes(3).toString('hex')
    const slug = `${baseSlug}-${randomSuffix}`

    // Create tenant: active=false, plan='trial', setupDone=false
    const tenant = await db.tenant.create({
      data: {
        name: companyName,
        slug,
        active: false,
        plan: 'trial',
        setupDone: false,
        contactName: ownerName,
        contactPhone: phone,
        contactEmail: email,
      },
    })

    // Create owner user: role='OWNER'. Reuse passwordHash nếu email đã có (cùng người, nhiều DN/Zalo)
    await db.user.create({
      data: {
        tenantId: tenant.id,
        name: ownerName,
        email,
        passwordHash: reusePasswordHash ?? hashPassword(password),
        role: 'OWNER',
      },
    })

    return {
      ok: true,
      tenantId: tenant.id,
      message: 'Đăng ký thành công. Chờ admin kích hoạt.',
    }
  })

  // ── Login ───────────────────────────────────────────────────────────────
  app.post('/login', async (req, reply) => {
    const body = loginSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: 'Invalid input' })

    const { email, password, tenantSlug } = body.data

    const user = await db.user.findFirst({
      where: {
        email,
        passwordHash: hashPassword(password),
        ...(tenantSlug ? { tenant: { slug: tenantSlug } } : {}),
      },
      include: { tenant: true },
    })

    if (!user) return reply.status(401).send({ error: 'Sai email hoặc mật khẩu' })
    if (!user.tenant.active) return reply.status(403).send({ error: 'Tài khoản bị tạm ngưng' })

    const token = app.jwt.sign(
      { userId: user.id, tenantId: user.tenantId, role: user.role },
      { expiresIn: '30d' }
    )

    return {
      token,
      user: publicUser(user),
      tenant: { id: user.tenant.id, name: user.tenant.name, slug: user.tenant.slug },
    }
  })

  // ── /me — kiểm tra token còn hiệu lực + trả info user ──────────────────
  app.get('/me', async (req, reply) => {
    const auth = req.headers.authorization
    if (!auth?.startsWith('Bearer ')) return reply.status(401).send({ error: 'No token' })
    try {
      const p: any = app.jwt.verify(auth.slice(7))
      const user = await db.user.findUnique({
        where: { id: p.userId },
        include: { tenant: { select: { id: true, name: true, slug: true, active: true } } },
      })
      if (!user || !user.tenant.active) return reply.status(401).send({ error: 'Invalid' })
      return { user: publicUser(user), tenant: user.tenant }
    } catch {
      return reply.status(401).send({ error: 'Invalid token' })
    }
  })

  // ── /my-tenants — list tất cả tenant mà email user đang login đăng ký ──
  // Multi-tenant v2: 1 email có thể own/là member của nhiều tenant.
  app.get('/my-tenants', async (req, reply) => {
    const auth = req.headers.authorization
    if (!auth?.startsWith('Bearer ')) return reply.status(401).send({ error: 'No token' })
    let p: any
    try { p = app.jwt.verify(auth.slice(7)) } catch { return reply.status(401).send({ error: 'Invalid token' }) }
    const me = await db.user.findUnique({ where: { id: p.userId }, select: { email: true } })
    if (!me?.email) return reply.status(404).send({ error: 'User not found' })
    const users = await db.user.findMany({
      where: { email: me.email },
      select: {
        id: true, role: true,
        tenant: {
          select: {
            id: true, name: true, slug: true, plan: true, active: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    })
    return users
      .filter(u => u.tenant.active)
      .map(u => ({
        userId: u.id,
        role: u.role,
        tenantId: u.tenant.id,
        tenantName: u.tenant.name,
        slug: u.tenant.slug,
        plan: u.tenant.plan,
        isCurrent: u.id === p.userId,
      }))
  })

  // ── /add-tenant — tạo tenant + user mới với email hiện tại (multi-Zalo) ──
  app.post('/add-tenant', async (req, reply) => {
    const auth = req.headers.authorization
    if (!auth?.startsWith('Bearer ')) return reply.status(401).send({ error: 'No token' })
    let p: any
    try { p = app.jwt.verify(auth.slice(7)) } catch { return reply.status(401).send({ error: 'Invalid token' }) }
    const me = await db.user.findUnique({
      where: { id: p.userId },
      select: { email: true, name: true, passwordHash: true },
    })
    if (!me?.email || !me.passwordHash) return reply.status(404).send({ error: 'User not found' })

    const body = req.body as { companyName?: string; phone?: string }
    const companyName = (body?.companyName ?? '').toString().trim().slice(0, 200)
    if (!companyName) return reply.status(400).send({ error: 'Thiếu companyName' })

    const baseSlug = companyName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').slice(0, 30)
    const randomSuffix = randomBytes(3).toString('hex')
    const slug = `${baseSlug}-${randomSuffix}`

    const tenant = await db.tenant.create({
      data: {
        name: companyName,
        slug,
        active: false,                  // chờ admin kích hoạt như register thường
        plan: 'trial',
        setupDone: false,
        contactName: me.name,
        contactPhone: body?.phone,
        contactEmail: me.email,
      },
    })

    await db.user.create({
      data: {
        tenantId: tenant.id,
        name: me.name,
        email: me.email,
        passwordHash: me.passwordHash,  // reuse hash → đổi pass 1 chỗ apply tất cả tenant
        role: 'OWNER',
      },
    })

    return { ok: true, tenantId: tenant.id, slug, message: 'Tạo doanh nghiệp mới — chờ admin kích hoạt.' }
  })

  // ── /switch-tenant — re-issue JWT với tenantId khác (cùng email) ──
  app.post('/switch-tenant', async (req, reply) => {
    const auth = req.headers.authorization
    if (!auth?.startsWith('Bearer ')) return reply.status(401).send({ error: 'No token' })
    let p: any
    try { p = app.jwt.verify(auth.slice(7)) } catch { return reply.status(401).send({ error: 'Invalid token' }) }

    const body = req.body as { tenantId?: string }
    const targetTenantId = (body?.tenantId ?? '').toString()
    if (!targetTenantId) return reply.status(400).send({ error: 'Thiếu tenantId' })

    const me = await db.user.findUnique({ where: { id: p.userId }, select: { email: true } })
    if (!me?.email) return reply.status(404).send({ error: 'User not found' })

    const targetUser = await db.user.findFirst({
      where: { email: me.email, tenantId: targetTenantId },
      include: { tenant: { select: { id: true, name: true, slug: true, active: true } } },
    })
    if (!targetUser) return reply.status(403).send({ error: 'Tenant không thuộc email này' })
    if (!targetUser.tenant.active) return reply.status(403).send({ error: 'Tenant chưa kích hoạt' })

    const token = app.jwt.sign(
      { userId: targetUser.id, tenantId: targetUser.tenantId, role: targetUser.role },
      { expiresIn: '30d' }
    )
    return {
      token,
      user: publicUser(targetUser),
      tenant: { id: targetUser.tenant.id, name: targetUser.tenant.name, slug: targetUser.tenant.slug },
    }
  })

  // ── /my-privacy — GET/PATCH privacy settings per-user (monitorDMs, allowedDMIds)
  app.get('/my-privacy', async (req, reply) => {
    const auth = req.headers.authorization
    if (!auth?.startsWith('Bearer ')) return reply.status(401).send({ error: 'No token' })
    let p: any
    try { p = app.jwt.verify(auth.slice(7)) } catch { return reply.status(401).send({ error: 'Invalid token' }) }
    const user = await db.user.findUnique({
      where: { id: p.userId },
      select: { monitorDMs: true, allowedDMIds: true },
    })
    if (!user) return reply.status(404).send({ error: 'User not found' })
    return user
  })

  app.patch('/my-privacy', async (req, reply) => {
    const auth = req.headers.authorization
    if (!auth?.startsWith('Bearer ')) return reply.status(401).send({ error: 'No token' })
    let p: any
    try { p = app.jwt.verify(auth.slice(7)) } catch { return reply.status(401).send({ error: 'Invalid token' }) }
    const body = req.body as { monitorDMs?: boolean; allowedDMIds?: string[] }
    const updated = await db.user.update({
      where: { id: p.userId },
      data: {
        ...(body.monitorDMs !== undefined ? { monitorDMs: body.monitorDMs } : {}),
        ...(body.allowedDMIds !== undefined ? { allowedDMIds: body.allowedDMIds } : {}),
      },
      select: { monitorDMs: true, allowedDMIds: true },
    })
    return updated
  })

  // ── /my-install-command — user đã login lấy lệnh cài hook cho Zalo CÁ NHÂN của họ
  app.get('/my-install-command', async (req, reply) => {
    const auth = req.headers.authorization
    if (!auth?.startsWith('Bearer ')) return reply.status(401).send({ error: 'No token' })
    let p: any
    try { p = app.jwt.verify(auth.slice(7)) } catch { return reply.status(401).send({ error: 'Invalid token' }) }

    const proto = (req.headers['x-forwarded-proto'] as string) ?? (req.protocol ?? 'http')
    const host  = (req.headers['x-forwarded-host'] as string) ?? (req.headers['host'] as string)
    const backendUrl = process.env.PUBLIC_BACKEND_URL?.replace(/\/$/, '') ?? `${proto}://${host}`
    const qs = `tenantId=${p.tenantId}&userId=${p.userId}`

    return {
      oneLineCommand: `curl -fsSL "${backendUrl}/api/setup/inject.sh?${qs}" | bash`,
      windowsCommand: `iwr -useb "${backendUrl}/api/setup/inject.ps1?${qs}" | iex`,
      dockerCommand:  `docker run -d --name zalo-monitor-listener --restart unless-stopped --network host -v zalo-monitor-data:/root/.zalo-monitor node:22-alpine sh -c "apk add --no-cache curl bash && curl -fsSL '${backendUrl}/api/setup/inject.sh?${qs}' | bash"`,
      // Download URLs: khách bấm tải → double-click file → terminal/cmd tự mở + chạy
      installerMac: `${backendUrl}/api/auth/my-installer?os=mac`,
      installerWin: `${backendUrl}/api/auth/my-installer?os=win`,
    }
  })

  // ── /my-installer — tải file installer (.command cho Mac, .bat cho Win) ──
  // Khách double-click file → terminal/cmd tự mở + chạy curl|bash. Không cần biết Terminal.
  app.get('/my-installer', async (req, reply) => {
    const auth = req.headers.authorization
    if (!auth?.startsWith('Bearer ')) return reply.status(401).send({ error: 'No token' })
    let p: any
    try { p = app.jwt.verify(auth.slice(7)) } catch { return reply.status(401).send({ error: 'Invalid token' }) }

    const os = ((req.query as any)?.os as string ?? 'mac').toLowerCase()
    const proto = (req.headers['x-forwarded-proto'] as string) ?? (req.protocol ?? 'http')
    const host = (req.headers['x-forwarded-host'] as string) ?? (req.headers['host'] as string)
    const backendUrl = process.env.PUBLIC_BACKEND_URL?.replace(/\/$/, '') ?? `${proto}://${host}`
    const qs = `tenantId=${p.tenantId}&userId=${p.userId}`

    if (os === 'win' || os === 'windows') {
      const bat = [
        '@echo off',
        'echo.',
        'echo ====== Zalo Monitor Installer ======',
        'echo.',
        'powershell -ExecutionPolicy Bypass -NoProfile -Command "& {[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; iwr -useb \'' + backendUrl + '/api/setup/inject.ps1?' + qs + '\' | iex}"',
        'echo.',
        'echo ====== Hoan tat — co the dong cua so nay ======',
        'pause',
        '',
      ].join('\r\n')
      reply.header('Content-Type', 'application/octet-stream')
      reply.header('Content-Disposition', 'attachment; filename="zalo-monitor-installer.bat"')
      return bat
    }

    // Mac (default) — pack file .command vào .zip với exec bit (chmod 755)
    // Lý do: file tải qua browser không có exec bit → macOS không cho double-click chạy.
    // ZIP preserve permission → user unzip → file bên trong có exec bit → chạy được luôn.
    const cmd = [
      '#!/bin/bash',
      'echo ""',
      'echo "====== Zalo Monitor Installer ======"',
      'echo ""',
      `curl -fsSL "${backendUrl}/api/setup/inject.sh?${qs}" | bash`,
      'echo ""',
      'echo "====== Hoàn tất — có thể đóng cửa sổ này ======"',
      'echo "Bấm Enter để đóng..."',
      'read',
      '',
    ].join('\n')
    const AdmZip = (await import('adm-zip')).default
    const zip = new AdmZip()
    // attr = 0o100755 << 16 (Unix mode 755 cho file, shifted vào high bits của ZIP external attr)
    zip.addFile('zalo-monitor-installer.command', Buffer.from(cmd, 'utf-8'), '', 0o100755 << 16)
    const buf = zip.toBuffer()
    reply.header('Content-Type', 'application/zip')
    reply.header('Content-Disposition', 'attachment; filename="zalo-monitor-installer.zip"')
    return reply.send(buf)
  })

  // ── Forgot password — gửi email kèm link reset ─────────────────────────
  app.post('/forgot-password', async (req, reply) => {
    const body = forgotSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: 'Invalid email' })

    const user = await db.user.findFirst({
      where: { email: body.data.email },
      include: { tenant: true },
    })

    // Phòng user-enumeration: luôn trả 200 dù email có tồn tại hay không
    if (!user) return reply.send({ ok: true })

    const token = randomBytes(32).toString('hex')
    const expires = new Date(Date.now() + 60 * 60 * 1000) // 1h

    await db.user.update({
      where: { id: user.id },
      data: { resetToken: token, resetTokenExpires: expires },
    })

    // Ưu tiên: Origin header (từ browser) → env DASHBOARD_URL → fallback localhost
    const origin = (req.headers['origin'] as string | undefined)?.replace(/\/$/, '')
    const base = origin ?? process.env.DASHBOARD_URL ?? 'http://localhost:3000'
    const resetLink = `${base}/reset-password?token=${token}`

    await sendMail({
      to: user.email!,
      subject: `[${user.tenant.name}] Đặt lại mật khẩu Zalo Monitor`,
      text: `Xin chào ${user.name},

Anh/chị nhận được email này vì có yêu cầu đặt lại mật khẩu cho tài khoản Zalo Monitor.

Bấm vào link dưới đây để đặt mật khẩu mới (hết hạn sau 1 giờ):

${resetLink}

Nếu không phải anh/chị yêu cầu, bỏ qua email này. Mật khẩu cũ vẫn hoạt động.

— Zalo Monitor`,
      html: `<p>Xin chào <b>${user.name}</b>,</p>
<p>Anh/chị nhận được email này vì có yêu cầu đặt lại mật khẩu cho tài khoản Zalo Monitor.</p>
<p>
  <a href="${resetLink}" style="display:inline-block;padding:12px 24px;background:#2563eb;color:white;border-radius:12px;text-decoration:none;font-weight:600;">
    Đặt mật khẩu mới
  </a>
</p>
<p style="color:#6b7280;font-size:12px;">Link hết hạn sau 1 giờ. Nếu không phải anh/chị yêu cầu, bỏ qua email này.</p>
<p style="color:#9ca3af;font-size:11px;margin-top:24px;">— Zalo Monitor</p>`,
    }).catch(err => req.log.error(err, 'Failed to send reset email'))

    return { ok: true }
  })

  // ── Reset password — khách click link từ email ─────────────────────────
  app.post('/reset-password', async (req, reply) => {
    const body = resetSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: 'Invalid input' })

    const user = await db.user.findUnique({
      where: { resetToken: body.data.token },
    })
    if (!user || !user.resetTokenExpires || user.resetTokenExpires < new Date()) {
      return reply.status(400).send({ error: 'Link hết hạn hoặc không hợp lệ' })
    }

    await db.user.update({
      where: { id: user.id },
      data: {
        passwordHash: hashPassword(body.data.password),
        resetToken: null,
        resetTokenExpires: null,
      },
    })

    return { ok: true }
  })

  // ── Change password (đã đăng nhập) ────────────────────────────────────
  app.post('/change-password', async (req, reply) => {
    const auth = req.headers.authorization ?? ''
    if (!auth.startsWith('Bearer ')) return reply.status(401).send({ error: 'Unauthorized' })
    let p: any
    try { p = app.jwt.verify(auth.slice(7)) } catch { return reply.status(401).send({ error: 'Invalid token' }) }

    const body = changePasswordSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: 'Dữ liệu không hợp lệ' })

    const user = await db.user.findUnique({ where: { id: p.userId } })
    if (!user) return reply.status(404).send({ error: 'User không tồn tại' })
    if (!user.passwordHash) return reply.status(400).send({ error: 'Tài khoản này đăng nhập qua Google, không có mật khẩu' })
    if (user.passwordHash !== hashPassword(body.data.currentPassword)) {
      return reply.status(400).send({ error: 'Mật khẩu hiện tại không đúng' })
    }

    await db.user.update({
      where: { id: user.id },
      data: { passwordHash: hashPassword(body.data.newPassword) },
    })
    return { ok: true }
  })

  // ── Google OAuth — redirect tới consent screen ─────────────────────────
  app.get('/google', async (_req, reply) => {
    const clientId = process.env.GOOGLE_CLIENT_ID
    const redirectUri = process.env.GOOGLE_REDIRECT_URI
    if (!clientId || !redirectUri) {
      return reply.status(503).send({ error: 'Google OAuth chưa được cấu hình trên server' })
    }
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      access_type: 'online',
      prompt: 'select_account',
    })
    return reply.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`)
  })

  // ── Google OAuth callback — xử lý code, match email, sinh JWT ──────────
  app.get('/google/callback', async (req, reply) => {
    const { code, error } = req.query as { code?: string; error?: string }
    if (error) return reply.redirect(`${process.env.DASHBOARD_URL}/login?error=${error}`)
    if (!code) return reply.status(400).send({ error: 'Missing code' })

    const clientId = process.env.GOOGLE_CLIENT_ID!
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET!
    const redirectUri = process.env.GOOGLE_REDIRECT_URI!

    // Đổi code lấy access_token
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code, client_id: clientId, client_secret: clientSecret,
        redirect_uri: redirectUri, grant_type: 'authorization_code',
      }),
    })
    const tokenData = await tokenRes.json() as any
    if (!tokenData.access_token) return reply.status(400).send({ error: 'OAuth exchange failed' })

    // Lấy profile
    const profileRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    })
    const profile = await profileRes.json() as { id: string; email: string; name?: string; picture?: string }
    if (!profile.email) return reply.status(400).send({ error: 'No email from Google' })

    // Match user theo googleId trước, fallback email
    let user = await db.user.findFirst({
      where: { OR: [{ googleId: profile.id }, { email: profile.email }] },
      include: { tenant: true },
    })

    if (!user) {
      return reply.redirect(
        `${process.env.DASHBOARD_URL}/login?error=no_account&email=${encodeURIComponent(profile.email)}`
      )
    }
    if (!user.tenant.active) {
      return reply.redirect(`${process.env.DASHBOARD_URL}/login?error=suspended`)
    }

    // Link googleId nếu chưa có
    if (!user.googleId) {
      await db.user.update({ where: { id: user.id }, data: { googleId: profile.id } })
    }

    const jwt = app.jwt.sign(
      { userId: user.id, tenantId: user.tenantId, role: user.role },
      { expiresIn: '30d' }
    )

    // Redirect về dashboard kèm token (dashboard lưu vào localStorage)
    const dashboardUrl = process.env.DASHBOARD_URL ?? 'http://localhost:3000'
    return reply.redirect(`${dashboardUrl}/auth/google-complete?token=${jwt}&tenantId=${user.tenantId}&slug=${user.tenant.slug}`)
  })
}
