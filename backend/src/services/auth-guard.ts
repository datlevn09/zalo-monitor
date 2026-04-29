import type { FastifyInstance, FastifyRequest } from 'fastify'

// Các prefix PUBLIC — không cần JWT:
// - /health
// - /webhook/* (tự auth bằng webhook secret)
// - /api/auth/* (login, forgot, reset — chính mấy API này cấp JWT)
// - /api/setup/* (onboard — chưa có tenant để login)
// - /api/super-admin/* (auth riêng bằng SUPER_ADMIN_TOKEN)
// - /ws (websocket, auth qua query param nếu cần)
const PUBLIC_PREFIXES = [
  '/health',
  '/webhook',
  '/api/auth',
  '/api/setup',
  '/api/super-admin',
  '/api/contact',
  '/ws',
]

declare module 'fastify' {
  interface FastifyRequest {
    authUser?: { userId: string; tenantId: string; role: string }
  }
}

export function registerAuthGuard(app: FastifyInstance) {
  app.addHook('preHandler', async (req, reply) => {
    const url = req.url.split('?')[0]

    // Public prefix → skip auth
    if (PUBLIC_PREFIXES.some((p) => url.startsWith(p))) return

    // Chỉ guard các route /api/*
    if (!url.startsWith('/api/')) return

    const authHeader = req.headers.authorization
    if (!authHeader?.startsWith('Bearer ')) {
      return reply.status(401).send({ error: 'Missing Bearer token', code: 'NO_TOKEN' })
    }

    const token = authHeader.slice('Bearer '.length).trim()
    let payload: any
    try {
      payload = app.jwt.verify(token)
    } catch {
      return reply.status(401).send({ error: 'Invalid or expired token', code: 'BAD_TOKEN' })
    }

    if (!payload?.userId || !payload?.tenantId) {
      return reply.status(401).send({ error: 'Malformed token', code: 'BAD_TOKEN' })
    }

    // Cross-check: nếu client cũng gửi X-Tenant-Id, phải khớp JWT
    const headerTenantId = req.headers['x-tenant-id'] as string | undefined
    if (headerTenantId && headerTenantId !== payload.tenantId) {
      return reply.status(403).send({
        error: 'Tenant mismatch between token and header',
        code: 'TENANT_MISMATCH',
      })
    }

    req.authUser = {
      userId: payload.userId,
      tenantId: payload.tenantId,
      role: payload.role ?? 'STAFF',
    }

    // Nếu route chưa set X-Tenant-Id header (legacy), inject từ JWT để code cũ hoạt động
    if (!headerTenantId) {
      (req.headers as any)['x-tenant-id'] = payload.tenantId
    }

    // BOARD ACCESS CHECK: nếu request có boardUserId và không phải own → cần BoardAccess
    // Áp dụng GLOBAL cho tất cả /api/* — tránh user bị xóa share vẫn xem được data
    const url2 = req.url
    const m = url2.match(/[?&]boardUserId=([^&]+)/)
    if (m) {
      const boardUserId = decodeURIComponent(m[1])
      if (boardUserId && boardUserId !== payload.userId) {
        const { db } = await import('./db.js')
        // Cả OWNER và STAFF: boardUserId !== self → bắt buộc có BoardAccess record.
        // Tránh stale localStorage trỏ sang STAFF cùng tenant (STAFF không own group →
        // filter empty → UI "mất tin"). Chỉ flow share board chính thống mới được pass.
        const access = await db.boardAccess.findFirst({
          where: { boardUserId, viewerUserId: payload.userId, tenantId: payload.tenantId },
        })
        if (!access) {
          return reply.status(403).send({
            error: 'Không có quyền xem board này — quay lại board của bạn',
            code: 'BOARD_ACCESS_REVOKED',
          })
        }
      }
    }
  })
}

// Helper để route lấy tenantId 1 cách an toàn (ưu tiên từ JWT)
export function getTenantId(req: FastifyRequest): string | null {
  if (req.authUser?.tenantId) return req.authUser.tenantId
  return (req.headers['x-tenant-id'] as string) ?? null
}
