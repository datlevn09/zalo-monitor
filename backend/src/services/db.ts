import { PrismaClient } from '@prisma/client'

const base = new PrismaClient()

/**
 * Tự động tăng tenant.messagesThisMonth mỗi khi có 1 message MỚI được tạo,
 * bất kể path nào (webhook-zalo, webhook telegram, history sync, UI gửi đi…).
 *
 * Áp dụng cho:
 *   - db.message.create
 *   - db.message.upsert (chỉ khi thực sự CREATE, không count update)
 *
 * Cron reset 0 vào ngày 1 đầu tháng được setup ở entry.ts.
 */
export const db = base.$extends({
  query: {
    message: {
      async create({ args, query }) {
        const result = await query(args)
        const groupId = (args.data as any)?.groupId
        if (groupId) bumpCounter(groupId)
        return result
      },
      async upsert({ args, query }) {
        // Cần biết là CREATE hay UPDATE: query existence trước
        const where = args.where as any
        const existing = await base.message.findUnique({ where, select: { id: true } })
        const result = await query(args)
        if (!existing) {
          const groupId = (args.create as any)?.groupId
          if (groupId) bumpCounter(groupId)
        }
        return result
      },
    },
  },
})

function bumpCounter(groupId: string) {
  // Fire-and-forget — không chặn write chính
  base.group.findUnique({ where: { id: groupId }, select: { tenantId: true } })
    .then(g => {
      if (!g) return
      return base.tenant.update({
        where: { id: g.tenantId },
        data: { messagesThisMonth: { increment: 1 } },
      })
    })
    .catch(() => undefined)
}
