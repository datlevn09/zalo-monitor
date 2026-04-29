/**
 * Export CSV endpoints.
 */

import type { FastifyPluginAsync } from 'fastify'
import { db } from '../services/db.js'
import { audit } from '../services/audit.js'

function escapeCsv(v: any): string {
  if (v === null || v === undefined) return ''
  const s = String(v).replace(/"/g, '""')
  return /[",\n]/.test(s) ? `"${s}"` : s
}

function toCsv(rows: Record<string, any>[]): string {
  if (!rows.length) return ''
  const headers = Object.keys(rows[0])
  const lines = [headers.join(',')]
  for (const r of rows) lines.push(headers.map(h => escapeCsv(r[h])).join(','))
  return lines.join('\n')
}

export const exportRoutes: FastifyPluginAsync = async (app) => {
  app.get('/messages.csv', async (req, reply) => {
    const tenantId = req.headers['x-tenant-id'] as string
    if (!tenantId) return reply.status(400).send({ error: 'Missing tenant id' })

    const { days } = req.query as { days?: string }
    const since = new Date(Date.now() - Number(days ?? 30) * 86400000)

    const messages = await db.message.findMany({
      where: { group: { tenantId }, sentAt: { gte: since } },
      orderBy: { sentAt: 'desc' },
      take: 10_000,
      include: {
        group: { select: { name: true, channelType: true } },
        analysis: { select: { label: true, priority: true } },
      },
    })

    const rows = messages.map(m => ({
      ngay: m.sentAt.toISOString(),
      nhom: m.group.name,
      kenh: m.group.channelType,
      nguoi_gui: m.senderName ?? '',
      loai_nguoi_gui: m.senderType,
      noi_dung: m.content?.slice(0, 500) ?? '',
      label: m.analysis?.label ?? '',
      uu_tien: m.analysis?.priority ?? '',
    }))

    reply.header('Content-Type', 'text/csv; charset=utf-8')
    reply.header('Content-Disposition', `attachment; filename="messages-${new Date().toISOString().slice(0,10)}.csv"`)
    audit({ req, action: 'export_csv', meta: { type: 'messages', count: messages.length, days: Number(days ?? 30) } })
    return '\uFEFF' + toCsv(rows) // BOM for Excel UTF-8
  })

  app.get('/customers.csv', async (req, reply) => {
    const tenantId = req.headers['x-tenant-id'] as string
    if (!tenantId) return reply.status(400).send({ error: 'Missing tenant id' })

    const customers = await db.customer.findMany({
      where: { tenantId }, orderBy: { lastActivity: 'desc' },
    })

    const rows = customers.map(c => ({
      ten: c.name ?? '',
      phone: c.phone ?? '',
      email: c.email ?? '',
      zaloId: c.zaloId ?? '',
      tag: c.tag,
      so_tin: c.totalMessages,
      doanh_thu: c.revenue,
      hoat_dong_cuoi: c.lastActivity.toISOString(),
      ghi_chu: c.note ?? '',
    }))

    reply.header('Content-Type', 'text/csv; charset=utf-8')
    reply.header('Content-Disposition', `attachment; filename="customers-${new Date().toISOString().slice(0,10)}.csv"`)
    return '\uFEFF' + toCsv(rows)
  })

  app.get('/alerts.csv', async (req, reply) => {
    const tenantId = req.headers['x-tenant-id'] as string
    if (!tenantId) return reply.status(400).send({ error: 'Missing tenant id' })

    const alerts = await db.alert.findMany({
      where: { tenantId }, orderBy: { createdAt: 'desc' }, take: 5000,
      include: { group: { select: { name: true } }, message: { select: { content: true } } },
    })

    const rows = alerts.map(a => ({
      thoi_gian: a.createdAt.toISOString(),
      nhom: a.group.name,
      label: a.label,
      uu_tien: a.priority,
      trang_thai: a.status,
      tom_tat: a.summary,
      noi_dung: a.message?.content?.slice(0, 300) ?? '',
      xu_ly_boi: a.assignedTo ?? '',
      hoan_thanh_luc: a.resolvedAt?.toISOString() ?? '',
    }))

    reply.header('Content-Type', 'text/csv; charset=utf-8')
    reply.header('Content-Disposition', `attachment; filename="alerts-${new Date().toISOString().slice(0,10)}.csv"`)
    return '\uFEFF' + toCsv(rows)
  })

  app.get('/appointments.csv', async (req, reply) => {
    const tenantId = req.headers['x-tenant-id'] as string
    if (!tenantId) return reply.status(400).send({ error: 'Missing tenant id' })

    const appts = await db.appointment.findMany({
      where: { tenantId }, orderBy: { scheduledAt: 'asc' },
    })
    const rows = appts.map(a => ({
      tieu_de: a.title,
      mo_ta: a.description ?? '',
      thoi_gian_hen: a.scheduledAt.toISOString(),
      nhac_truoc_phut: a.remindBefore,
      trang_thai: a.status,
      da_nhac: a.reminderSent ? 'Đã nhắc' : 'Chưa',
    }))
    reply.header('Content-Type', 'text/csv; charset=utf-8')
    reply.header('Content-Disposition', `attachment; filename="appointments-${new Date().toISOString().slice(0,10)}.csv"`)
    return '\uFEFF' + toCsv(rows)
  })

  app.get('/deals.csv', async (req, reply) => {
    const tenantId = req.headers['x-tenant-id'] as string
    if (!tenantId) return reply.status(400).send({ error: 'Missing tenant id' })

    const deals = await db.deal.findMany({
      where: { tenantId }, orderBy: { createdAt: 'desc' },
      include: { customer: { select: { name: true, phone: true } } },
    })
    const rows = deals.map(d => ({
      tieu_de: d.title,
      giai_doan: d.stage,
      gia_tri: d.value,
      khach_hang: d.customer?.name ?? '',
      sdt_khach: d.customer?.phone ?? '',
      mo_ta: d.description ?? '',
      ngay_tao: d.createdAt.toISOString(),
      han_chot: d.dueDate?.toISOString() ?? '',
      ngay_dong: d.closedAt?.toISOString() ?? '',
    }))
    reply.header('Content-Type', 'text/csv; charset=utf-8')
    reply.header('Content-Disposition', `attachment; filename="deals-${new Date().toISOString().slice(0,10)}.csv"`)
    return '\uFEFF' + toCsv(rows)
  })
}
