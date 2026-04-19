import { db } from './db.js'
import type { Alert, Message } from '@prisma/client'

export async function sendAlert(tenantId: string, alert: Alert, message: Message) {
  const channels = await db.notificationChannel.findMany({
    where: { tenantId, enabled: true, purpose: { in: ['ALERT', 'BOTH'] } },
  })

  const priorityOrder = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']
  const alertLevel = priorityOrder.indexOf(alert.priority)

  for (const ch of channels) {
    const minLevel = priorityOrder.indexOf(ch.minPriority)
    if (alertLevel < minLevel) continue

    const text = formatAlertText(alert, message)

    try {
      switch (ch.channelType) {
        case 'TELEGRAM': await sendTelegram(ch.target, text); break
        case 'LARK':     await sendLark(ch.target, alert, message); break
        case 'EMAIL':    /* TODO: email integration */ break
        // ZALO: cần qua OpenClaw — để sau
      }
    } catch (err) {
      console.error(`notify error [${ch.channelType}]:`, err)
    }
  }
}

async function sendTelegram(chatId: string, text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) return
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
  })
}

async function sendLark(webhookUrl: string, alert: Alert, message: Message) {
  const priorityEmoji = { LOW: '🔵', MEDIUM: '🟡', HIGH: '🟠', CRITICAL: '🔴' }[alert.priority]
  const labelMap = { COMPLAINT: 'Khiếu nại', OPPORTUNITY: 'Cơ hội', RISK: 'Rủi ro', POSITIVE: 'Tích cực', NEUTRAL: 'Bình thường' }

  await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      msg_type: 'interactive',
      card: {
        header: { title: { tag: 'plain_text', content: `${priorityEmoji} ${labelMap[alert.label]} - Cần xử lý` } },
        elements: [
          { tag: 'div', text: { tag: 'lark_md', content: `**Nội dung:** ${message.content?.slice(0, 200)}` } },
          { tag: 'div', text: { tag: 'lark_md', content: `**Lý do:** ${alert.summary}` } },
          { tag: 'hr' },
          { tag: 'div', text: { tag: 'lark_md', content: `Mức độ: **${alert.priority}** | Thời gian: ${new Date(alert.createdAt).toLocaleString('vi-VN')}` } },
        ],
      },
    }),
  })
}

function formatAlertText(alert: Alert, message: Message) {
  const emoji = { LOW: '🔵', MEDIUM: '🟡', HIGH: '🟠', CRITICAL: '🔴' }[alert.priority]
  const label = { COMPLAINT: 'Khiếu nại', OPPORTUNITY: 'Cơ hội', RISK: 'Rủi ro', POSITIVE: 'Tích cực', NEUTRAL: 'Bình thường' }[alert.label]
  return `${emoji} <b>${label}</b>\n\n${message.content?.slice(0, 300)}\n\n<i>${alert.summary}</i>`
}

// ─── Digest (báo cáo định kỳ) ─────────────────────────────────────────────────

type Digest = {
  tenantName: string
  date: string
  stats: {
    totalMessages: number
    activeGroups: number
    openAlerts: number
    newComplaints: number
    newOpportunities: number
  }
  urgentAlerts: Array<{ priority: string; label: string; summary: string; groupName: string }>
  opportunities: Array<{ groupName: string; summary: string }>
  topGroups: Array<{ name: string; category: string | null; messageCount: number }>
}

export async function sendDigest(tenantId: string, digest: Digest, narrative: string | null) {
  const channels = await db.notificationChannel.findMany({
    where: { tenantId, enabled: true, purpose: { in: ['DIGEST', 'BOTH'] } },
  })

  for (const ch of channels) {
    try {
      switch (ch.channelType) {
        case 'LARK':     await sendLarkDigest(ch.target, digest, narrative); break
        case 'TELEGRAM': await sendTelegramDigest(ch.target, digest, narrative); break
        case 'EMAIL':    /* TODO */ break
      }
    } catch (err) {
      console.error(`digest send error [${ch.channelType}]:`, err)
    }
  }
}

async function sendLarkDigest(webhookUrl: string, d: Digest, narrative: string | null) {
  const elements: any[] = [
    { tag: 'div', text: { tag: 'lark_md', content: `**📅 ${d.date}**` } },
  ]

  if (narrative) {
    elements.push({ tag: 'div', text: { tag: 'lark_md', content: narrative } })
    elements.push({ tag: 'hr' })
  }

  elements.push({
    tag: 'div', text: { tag: 'lark_md', content:
      `📨 **${d.stats.totalMessages}** tin nhắn · 💬 **${d.stats.activeGroups}** nhóm active\n` +
      `🚨 **${d.stats.openAlerts}** cảnh báo mở · 😠 ${d.stats.newComplaints} khiếu nại · 💰 ${d.stats.newOpportunities} cơ hội`
    },
  })

  if (d.urgentAlerts.length) {
    elements.push({ tag: 'hr' })
    elements.push({ tag: 'div', text: { tag: 'lark_md', content: '**🚨 Cần xử lý:**' } })
    for (const a of d.urgentAlerts) {
      elements.push({ tag: 'div', text: { tag: 'lark_md', content: `• [${a.groupName}] ${a.summary}` } })
    }
  }

  if (d.opportunities.length) {
    elements.push({ tag: 'hr' })
    elements.push({ tag: 'div', text: { tag: 'lark_md', content: '**💰 Cơ hội mới:**' } })
    for (const o of d.opportunities) {
      elements.push({ tag: 'div', text: { tag: 'lark_md', content: `• [${o.groupName}] ${o.summary}` } })
    }
  }

  await fetch(webhookUrl, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      msg_type: 'interactive',
      card: {
        header: {
          template: 'blue',
          title: { tag: 'plain_text', content: `📊 Báo cáo ngày - ${d.tenantName}` },
        },
        elements,
      },
    }),
  })
}

async function sendTelegramDigest(chatId: string, d: Digest, narrative: string | null) {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) return

  let text = `<b>📊 Báo cáo ngày - ${d.tenantName}</b>\n<i>${d.date}</i>\n\n`
  if (narrative) text += `${narrative}\n\n`
  text += `📨 ${d.stats.totalMessages} tin · 💬 ${d.stats.activeGroups} nhóm · 🚨 ${d.stats.openAlerts} cảnh báo\n`
  text += `😠 ${d.stats.newComplaints} khiếu nại · 💰 ${d.stats.newOpportunities} cơ hội\n\n`

  if (d.urgentAlerts.length) {
    text += `<b>🚨 Cần xử lý:</b>\n`
    for (const a of d.urgentAlerts) text += `• [${a.groupName}] ${a.summary}\n`
  }

  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
  })
}
