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

const forgotSchema = z.object({
  email: z.string().email(),
})

const resetSchema = z.object({
  token: z.string().min(10),
  password: z.string().min(6),
})

function hashPassword(password: string) {
  return createHash('sha256').update(password).digest('hex')
}

function publicUser(u: any) {
  return { id: u.id, name: u.name, email: u.email, role: u.role }
}

export const authRoutes: FastifyPluginAsync = async (app) => {
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
      dockerCommand:  `docker exec openclaw bash -c 'curl -fsSL "${backendUrl}/api/setup/inject.sh?${qs}" | bash'`,
    }
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
