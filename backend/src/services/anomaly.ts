/**
 * Anomaly detection — so sánh pattern tuần này vs tuần trước để detect:
 * - Group đột ngột im (drop 80%+)
 * - Group spike phàn nàn bất thường
 * - Customer VIP im quá lâu
 */

import { db } from './db.js'
import { sendAlert } from './notify.js'

export async function detectAnomaliesForTenant(tenantId: string) {
  const now = Date.now()
  const weekAgo = new Date(now - 7 * 86400000)
  const twoWeeksAgo = new Date(now - 14 * 86400000)

  const groups = await db.group.findMany({
    where: { tenantId, monitorEnabled: true },
  })

  const anomalies: Array<{ type: string; groupId?: string; detail: string }> = []

  for (const g of groups) {
    const [thisWeek, lastWeek] = await Promise.all([
      db.message.count({ where: { groupId: g.id, sentAt: { gte: weekAgo } } }),
      db.message.count({ where: { groupId: g.id, sentAt: { gte: twoWeeksAgo, lt: weekAgo } } }),
    ])

    // Drop 80%+
    if (lastWeek >= 10 && thisWeek < lastWeek * 0.2) {
      anomalies.push({
        type: 'ACTIVITY_DROP',
        groupId: g.id,
        detail: `Nhóm "${g.name}" giảm ${Math.round((1 - thisWeek / lastWeek) * 100)}% (${lastWeek} → ${thisWeek})`,
      })
    }

    // Spike phàn nàn
    const [complaintsThis, complaintsLast] = await Promise.all([
      db.alert.count({ where: { tenantId, groupId: g.id, label: 'COMPLAINT', createdAt: { gte: weekAgo } } }),
      db.alert.count({ where: { tenantId, groupId: g.id, label: 'COMPLAINT', createdAt: { gte: twoWeeksAgo, lt: weekAgo } } }),
    ])
    if (complaintsThis >= 3 && complaintsThis >= complaintsLast * 2) {
      anomalies.push({
        type: 'COMPLAINT_SPIKE',
        groupId: g.id,
        detail: `Nhóm "${g.name}" có ${complaintsThis} khiếu nại tuần này (tăng ${complaintsThis - complaintsLast} so với tuần trước)`,
      })
    }
  }

  // VIP (HOT) im lâu
  const silentVIP = await db.customer.findMany({
    where: {
      tenantId, tag: 'HOT',
      lastActivity: { lt: new Date(now - 3 * 86400000) },
    },
  })
  for (const c of silentVIP) {
    const days = Math.floor((now - c.lastActivity.getTime()) / 86400000)
    anomalies.push({
      type: 'VIP_SILENT',
      detail: `Khách VIP "${c.name ?? c.phone ?? 'N/A'}" đã im ${days} ngày`,
    })
  }

  // Gửi thông báo qua admin channels nếu có anomaly
  if (anomalies.length > 0) {
    const channels = await db.notificationChannel.findMany({
      where: { tenantId, enabled: true, purpose: { in: ['ALERT', 'BOTH'] } },
    })

    for (const ch of channels) {
      if (ch.channelType !== 'TELEGRAM') continue
      const token = process.env.TELEGRAM_BOT_TOKEN
      if (!token) continue

      const text = `🔍 <b>Anomaly Detection</b>\n\n${anomalies.slice(0, 10).map(a => {
        const icon = { ACTIVITY_DROP: '📉', COMPLAINT_SPIKE: '📈', VIP_SILENT: '🔕' }[a.type] ?? '⚠️'
        return `${icon} ${a.detail}`
      }).join('\n\n')}`

      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: ch.target, text, parse_mode: 'HTML' }),
      }).catch(() => undefined)
    }
  }

  return { anomalies, count: anomalies.length }
}

export async function detectAnomaliesAllTenants() {
  const tenants = await db.tenant.findMany({ select: { id: true } })
  for (const t of tenants) {
    await detectAnomaliesForTenant(t.id).catch(() => undefined)
  }
}
