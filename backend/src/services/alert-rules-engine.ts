/**
 * Alert Rules Engine — áp dụng custom rules sau khi AI classify xong.
 */

import { db } from './db.js'
import { sendAlert } from './notify.js'

export async function applyAlertRules(params: {
  tenantId: string
  messageId: string
  groupId: string
  content: string
  label: string
  priority: string
}) {
  const { tenantId, messageId, groupId, content, label, priority } = params

  const rules = await db.alertRule.findMany({
    where: { tenantId, enabled: true },
  })

  const priorityOrder = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']
  const currentLevel = priorityOrder.indexOf(priority)

  const now = new Date()

  for (const rule of rules) {
    // Cooldown
    if (rule.lastFiredAt) {
      const elapsed = (now.getTime() - rule.lastFiredAt.getTime()) / 60000
      if (elapsed < rule.cooldownMin) continue
    }

    // Group scope
    if (rule.groupIds.length && !rule.groupIds.includes(groupId)) continue

    // Label match
    if (rule.labels.length && !rule.labels.includes(label)) continue

    // Priority
    if (priorityOrder.indexOf(rule.minPriority) > currentLevel) continue

    // Keyword match (any)
    if (rule.keywords.length) {
      const textLower = content.toLowerCase()
      const matched = rule.keywords.some(k => textLower.includes(k.toLowerCase()))
      if (!matched) continue
    }

    // Trigger: create Alert with rule-tagged summary
    const alert = await db.alert.create({
      data: {
        tenantId, groupId, messageId,
        label: label as any, priority: priority as any,
        summary: `[Rule: ${rule.name}] ${content.slice(0, 150)}`,
      },
    })

    // Update lastFiredAt
    await db.alertRule.update({ where: { id: rule.id }, data: { lastFiredAt: now } })

    // Send notification qua channels
    const msg = await db.message.findUnique({ where: { id: messageId } })
    if (msg) await sendAlert(tenantId, alert, msg).catch(() => undefined)
  }
}
