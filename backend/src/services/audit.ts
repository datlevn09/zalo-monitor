/**
 * Audit log helper — fire-and-forget, không chặn request chính.
 *
 * Gọi từ các route nhạy cảm (đọc tin nhắn, export, super-admin, view aiApiKey…)
 * → ghi vào audit_logs để bằng chứng "không đọc tin trong vận hành thường"
 * và truy vết khi có sự cố.
 *
 * KHÔNG dùng cho hot-path bulk read (1 log mỗi request, không phải mỗi tin).
 */

import type { FastifyRequest } from 'fastify'
import { db } from './db.js'

export type AuditAction =
  | 'read_messages'
  | 'view_message_content'
  | 'export_csv'
  | 'super_admin_view'
  | 'change_setting'
  | 'view_ai_api_key'
  | 'send_message'
  | 'delete_message'

interface AuditInput {
  req?: FastifyRequest
  tenantId?: string | null
  userId?: string | null
  action: AuditAction
  target?: string | null
  meta?: Record<string, unknown>
}

function ipFromReq(req: FastifyRequest): string | undefined {
  const xff = req.headers['x-forwarded-for']
  if (typeof xff === 'string' && xff.length > 0) return xff.split(',')[0].trim()
  return req.ip
}

export function audit(input: AuditInput): void {
  const { req, tenantId, userId, action, target, meta } = input
  const ip = req ? ipFromReq(req) : undefined
  const userAgent = req ? (req.headers['user-agent'] as string | undefined) : undefined

  // Resolve tenantId/userId từ JWT nếu không truyền explicit
  const resolvedTenantId = tenantId ?? req?.authUser?.tenantId ?? null
  const resolvedUserId = userId ?? req?.authUser?.userId ?? null

  db.auditLog
    .create({
      data: {
        tenantId: resolvedTenantId,
        userId: resolvedUserId,
        action,
        target: target ?? null,
        meta: meta as any,
        ip: ip ?? null,
        userAgent: userAgent ?? null,
      },
    })
    .catch((e) => {
      // Audit log không được làm crash app — chỉ log console
      console.error('[audit] Failed to write log:', e?.message ?? e)
    })
}
