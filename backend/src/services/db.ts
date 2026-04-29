import { PrismaClient } from '@prisma/client'
import { encrypt, decrypt } from './crypto.js'

const base = new PrismaClient()

// Field cần auto-encrypt: { model: [field, ...] }
const ENCRYPTED_FIELDS: Record<string, string[]> = {
  tenant: ['aiApiKey'],
  customer: ['note'],
  // message.content encrypt CONDITIONAL theo tenant.encryptMessages
}

// Cache encryptMessages flag per tenant (TTL 60s) — tránh query DB mỗi message.
const tenantFlagCache = new Map<string, { encryptMessages: boolean; ts: number }>()
const FLAG_TTL_MS = 60_000

async function shouldEncryptMessages(tenantId: string): Promise<boolean> {
  const c = tenantFlagCache.get(tenantId)
  if (c && Date.now() - c.ts < FLAG_TTL_MS) return c.encryptMessages
  const t = await base.tenant.findUnique({
    where: { id: tenantId },
    select: { encryptMessages: true },
  })
  const flag = !!t?.encryptMessages
  tenantFlagCache.set(tenantId, { encryptMessages: flag, ts: Date.now() })
  return flag
}

export function invalidateEncryptFlag(tenantId: string) {
  tenantFlagCache.delete(tenantId)
}

function encryptInputData(model: string, data: any): any {
  const fields = ENCRYPTED_FIELDS[model.toLowerCase()]
  if (!fields || !data) return data
  const out: any = { ...data }
  for (const f of fields) {
    if (out[f] !== undefined && out[f] !== null && typeof out[f] === 'string') {
      out[f] = encrypt(out[f])
    }
  }
  return out
}

function decryptResult<T>(model: string, result: T): T {
  const fields = ENCRYPTED_FIELDS[model.toLowerCase()]
  if (!fields || !result) return result
  if (Array.isArray(result)) return result.map(r => decryptResult(model, r)) as any
  if (typeof result !== 'object') return result
  const out: any = { ...(result as any) }
  for (const f of fields) {
    if (typeof out[f] === 'string') out[f] = decrypt(out[f])
  }
  return out
}

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
        const groupId = (args.data as any)?.groupId
        if (groupId) await maybeEncryptContent(args.data, groupId)
        const result = await query(args)
        if (groupId) bumpCounter(groupId)
        return decryptMessageRow(result)
      },
      async upsert({ args, query }) {
        const where = args.where as any
        const existing = await base.message.findUnique({ where, select: { id: true } })
        const groupId = (args.create as any)?.groupId
        if (groupId) await maybeEncryptContent(args.create, groupId)
        if (args.update) await maybeEncryptContent(args.update, groupId)
        const result = await query(args)
        if (!existing && groupId) bumpCounter(groupId)
        return decryptMessageRow(result)
      },
      async update({ args, query }) {
        // groupId không có trong update payload thường → look up
        if (args.data && (args.data as any).content !== undefined) {
          const m = await base.message.findUnique({ where: args.where as any, select: { groupId: true } })
          if (m) await maybeEncryptContent(args.data, m.groupId)
        }
        return decryptMessageRow(await query(args))
      },
      async findUnique({ args, query }) { return decryptMessageRow(await query(args)) },
      async findFirst({ args, query })  { return decryptMessageRow(await query(args)) },
      async findMany({ args, query })   {
        const r = await query(args)
        return Array.isArray(r) ? r.map(decryptMessageRow) : r
      },
    },
    // Tenant + Customer: auto encrypt/decrypt sensitive fields
    tenant: {
      async create({ args, query }) {
        args.data = encryptInputData('tenant', args.data)
        return decryptResult('tenant', await query(args))
      },
      async update({ args, query }) {
        args.data = encryptInputData('tenant', args.data)
        return decryptResult('tenant', await query(args))
      },
      async upsert({ args, query }) {
        args.create = encryptInputData('tenant', args.create)
        args.update = encryptInputData('tenant', args.update)
        return decryptResult('tenant', await query(args))
      },
      async findUnique({ args, query }) { return decryptResult('tenant', await query(args)) },
      async findFirst({ args, query })  { return decryptResult('tenant', await query(args)) },
      async findMany({ args, query })   { return decryptResult('tenant', await query(args)) },
    },
    customer: {
      async create({ args, query }) {
        args.data = encryptInputData('customer', args.data)
        return decryptResult('customer', await query(args))
      },
      async update({ args, query }) {
        args.data = encryptInputData('customer', args.data)
        return decryptResult('customer', await query(args))
      },
      async upsert({ args, query }) {
        args.create = encryptInputData('customer', args.create)
        args.update = encryptInputData('customer', args.update)
        return decryptResult('customer', await query(args))
      },
      async findUnique({ args, query }) { return decryptResult('customer', await query(args)) },
      async findFirst({ args, query })  { return decryptResult('customer', await query(args)) },
      async findMany({ args, query })   { return decryptResult('customer', await query(args)) },
    },
  },
})

async function maybeEncryptContent(data: any, groupId: string) {
  if (!data || typeof data.content !== 'string' || data.content === '') return
  const g = await base.group.findUnique({ where: { id: groupId }, select: { tenantId: true } })
  if (!g) return
  if (await shouldEncryptMessages(g.tenantId)) {
    data.content = encrypt(data.content)
  }
}

function decryptMessageRow<T>(row: T): T {
  if (!row) return row
  if (Array.isArray(row)) return row.map(decryptMessageRow) as any
  if (typeof row !== 'object') return row
  const r: any = { ...(row as any) }
  if (typeof r.content === 'string') {
    const dec = decrypt(r.content)
    if (dec !== null) r.content = dec
  }
  return r
}

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
