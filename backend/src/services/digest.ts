/**
 * Daily Digest Generator
 *
 * Mỗi sáng 8:00 (cron) → tổng hợp 24h qua cho từng tenant
 * → gửi ra các notification channels có purpose=DIGEST hoặc BOTH
 *
 * Output: báo cáo bao gồm
 * - Alerts cần xử lý
 * - Cơ hội mới
 * - Stats tổng
 * - Top nhóm hoạt động
 */

import { db } from './db.js'
import { generateDigestSummary } from './ai.js'
import { sendDigest } from './notify.js'

type Range = 'day' | 'week' | 'month'

export async function generateDigestForTenant(tenantId: string, range: Range = 'day') {
  const hoursMap = { day: 24, week: 24 * 7, month: 24 * 30 }
  const since = new Date(Date.now() - hoursMap[range] * 3600 * 1000)

  const tenant = await db.tenant.findUnique({ where: { id: tenantId } })
  if (!tenant) return null

  const [
    openAlerts,
    newComplaints,
    newOpportunities,
    topGroups,
    totalMsgs,
    activeGroups,
  ] = await Promise.all([
    // Alerts chưa xử lý (tất cả thời gian)
    db.alert.findMany({
      where: { tenantId, status: 'OPEN' },
      include: { group: { select: { name: true } }, message: { select: { content: true } } },
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
      take: 10,
    }),
    // Complaints 24h
    db.alert.findMany({
      where: { tenantId, label: 'COMPLAINT', createdAt: { gte: since } },
      include: { group: { select: { name: true } } },
    }),
    // Opportunities 24h
    db.alert.findMany({
      where: { tenantId, label: 'OPPORTUNITY', createdAt: { gte: since } },
      include: { group: { select: { name: true } } },
    }),
    // Top 5 nhóm active
    db.group.findMany({
      where: { tenantId, lastMessageAt: { gte: since } },
      orderBy: { messages: { _count: 'desc' } },
      take: 5,
      include: { _count: { select: { messages: { where: { createdAt: { gte: since } } } } } },
    }),
    db.message.count({ where: { group: { tenantId }, createdAt: { gte: since } } }),
    db.group.count({ where: { tenantId, lastMessageAt: { gte: since } } }),
  ])

  const rangeLabel = { day: '24 giờ qua', week: '7 ngày qua', month: '30 ngày qua' }[range]

  // Build digest data
  const digest = {
    tenantId,
    tenantName: tenant.name,
    range,
    rangeLabel,
    date: new Date().toLocaleDateString('vi-VN'),
    stats: {
      totalMessages: totalMsgs,
      activeGroups,
      openAlerts: openAlerts.length,
      newComplaints: newComplaints.length,
      newOpportunities: newOpportunities.length,
    },
    urgentAlerts: openAlerts.slice(0, 5).map(a => ({
      priority: a.priority,
      label: a.label,
      summary: a.summary,
      groupName: a.group.name,
    })),
    opportunities: newOpportunities.slice(0, 5).map(o => ({
      groupName: o.group.name,
      summary: o.summary,
    })),
    topGroups: topGroups.map(g => ({
      name: g.name,
      category: g.category,
      messageCount: g._count.messages,
    })),
  }

  // AI tóm tắt narrative nếu có ANTHROPIC_API_KEY
  const narrative = process.env.ANTHROPIC_API_KEY
    ? await generateDigestSummary(digest).catch(() => null)
    : null

  // Gửi ra notification channels
  await sendDigest(tenantId, digest, narrative)

  return { digest, narrative }
}

export async function generateDigestForAllTenants() {
  const tenants = await db.tenant.findMany({
    where: { setupDone: true },
    select: { id: true },
  })
  for (const t of tenants) {
    try {
      await generateDigestForTenant(t.id)
    } catch (err) {
      console.error(`Digest failed for tenant ${t.id}:`, err)
    }
  }
}
