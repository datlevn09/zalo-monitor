import type { FastifyInstance } from 'fastify'
import { db } from './db.js'

// Route prefixes được miễn guard (public / internal)
const EXEMPT_PREFIXES = [
  '/health',
  '/webhook',            // webhook inbound — tự filter riêng
  '/api/auth',           // login chính nó
  '/api/setup',          // onboarding chưa có tenant
  '/api/super-admin',    // super-admin có auth riêng
  '/ws',
]

// Cache để tránh query DB mỗi request
const cache = new Map<string, { active: boolean; expiresAt: Date | null; ts: number }>()
const CACHE_TTL_MS = 30_000 // 30s

export function registerTenantGuard(app: FastifyInstance) {
  app.addHook('preHandler', async (req, reply) => {
    const url = req.url.split('?')[0]
    if (EXEMPT_PREFIXES.some((p) => url.startsWith(p))) return

    // Chỉ áp dụng cho /api/*
    if (!url.startsWith('/api/')) return

    const tenantId = req.headers['x-tenant-id'] as string | undefined
    if (!tenantId) return // để route tự xử lý missing tenant

    const now = Date.now()
    let entry = cache.get(tenantId)
    if (!entry || now - entry.ts > CACHE_TTL_MS) {
      const t = await db.tenant.findUnique({
        where: { id: tenantId },
        select: { active: true, licenseExpiresAt: true },
      })
      if (!t) return // route tự trả 404
      entry = { active: t.active, expiresAt: t.licenseExpiresAt, ts: now }
      cache.set(tenantId, entry)
    }

    if (!entry.active) {
      return reply.status(403).send({
        error: 'Tenant suspended',
        code: 'TENANT_SUSPENDED',
        message: 'Tài khoản của bạn đã bị tạm ngưng. Vui lòng liên hệ quản trị.',
      })
    }

    if (entry.expiresAt && entry.expiresAt < new Date()) {
      return reply.status(403).send({
        error: 'License expired',
        code: 'LICENSE_EXPIRED',
        message: 'Giấy phép sử dụng đã hết hạn. Vui lòng gia hạn để tiếp tục sử dụng.',
        expiresAt: entry.expiresAt,
      })
    }
  })
}

// Cho phép super-admin invalidate cache sau khi update tenant
export function invalidateTenantCache(tenantId?: string) {
  if (tenantId) cache.delete(tenantId)
  else cache.clear()
}
