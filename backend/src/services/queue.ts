import { Queue, Worker } from 'bullmq'
import IORedis from 'ioredis'
import { db } from './db.js'
import { wsManager } from './websocket.js'
import { classifyMessage } from './ai.js'
import { sendAlert } from './notify.js'
import { upsertCustomerFromMessage } from './crm-extract.js'
import { applyAlertRules } from './alert-rules-engine.js'

const connection = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
})

export const aiQueue = new Queue('ai-classify', { connection })

new Worker('ai-classify', async (job) => {
  const { messageId, tenantId, groupId } = job.data as {
    messageId: string
    tenantId: string
    groupId: string
  }

  const message = await db.message.findUnique({ where: { id: messageId } })
  if (!message?.content) return

  // Skip: tin của bot (SELF) — không classify
  if (message.senderType === 'SELF') return

  // Skip: quá ngắn (< 3 ký tự) — thường là emoji, "ok", "ừ"
  if (message.content.trim().length < 3) return

  // Lấy 10 tin nhắn gần nhất làm context (cả SELF + CONTACT)
  const context = await db.message.findMany({
    where: { groupId, id: { not: messageId } },
    orderBy: { sentAt: 'desc' },
    take: 10,
    select: { content: true, senderName: true, senderType: true, sentAt: true },
  })

  // Load tenant classification config
  const config = await db.classificationConfig.findUnique({ where: { tenantId } })

  const result = await classifyMessage(message.content, context.reverse(), config ? {
    positive: config.positiveKeywords,
    negative: config.negativeKeywords,
    opportunity: config.opportunityKeywords,
    complaint: config.complaintKeywords,
    risk: config.riskKeywords,
    customPrompt: config.customPrompt,
  } : undefined)

  await db.messageAnalysis.create({
    data: {
      messageId,
      label: result.label,
      sentiment: result.sentiment,
      priority: result.priority,
      confidence: result.confidence,
      reason: result.reason,
      action: result.action,
      model: result.model,
    },
  })

  wsManager.broadcast('analysis:result', { messageId, groupId, ...result })

  // CRM extract (phone/email + aggregate customer)
  await upsertCustomerFromMessage(tenantId, messageId).catch(() => undefined)

  // Apply custom alert rules
  await applyAlertRules({
    tenantId, messageId, groupId,
    content: message.content,
    label: result.label,
    priority: result.priority,
  }).catch(() => undefined)

  // Tạo default alert nếu cần (built-in logic)
  if (result.priority === 'HIGH' || result.priority === 'CRITICAL' ||
      result.label === 'COMPLAINT' || result.label === 'RISK') {
    const alert = await db.alert.create({
      data: {
        tenantId,
        groupId,
        messageId,
        label: result.label,
        priority: result.priority,
        summary: result.reason ?? message.content.slice(0, 200),
      },
    })

    wsManager.broadcast('alert:new', { alertId: alert.id, groupId, label: result.label, priority: result.priority })

    // Gửi notification ra ngoài (Zalo/Telegram/Lark)
    await sendAlert(tenantId, alert, message)
  }
}, { connection, concurrency: 5 })
