/**
 * Telegram Bot command handler.
 *
 * Khi user DM bot (hoặc group mention bot) với lệnh /xxx,
 * backend parse + execute + reply qua Telegram Bot API.
 *
 * Không qua OpenClaw gateway → tránh spam agent auto-reply.
 */

import { db } from './db.js'
import { generateDigestForTenant } from './digest.js'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN

type TelegramCtx = {
  tenantId: string
  chatId: string
  senderName?: string
  text: string
}

/**
 * Returns true nếu đã xử lý command (caller nên skip save normal message)
 */
export async function handleTelegramCommand(ctx: TelegramCtx): Promise<boolean> {
  const text = ctx.text.trim()
  if (!text) return false

  // Free-form question → AI query DB
  if (!text.startsWith('/')) {
    return await cmdFreeformAI(ctx, text)
  }

  const [cmd, ...args] = text.split(/\s+/)
  const command = cmd.toLowerCase().replace(/@\w+$/, '') // strip @bot_name

  try {
    switch (command) {
      case '/start':
      case '/help':
        return await reply(ctx, buildHelpText())

      case '/id':
      case '/chatid':
        return await reply(ctx,
          `<b>Chat ID:</b> <code>${ctx.chatId}</code>\n` +
          `<b>Sender:</b> ${ctx.senderName ?? '?'}\n\n` +
          `Paste ID này vào Dashboard → Cài đặt → Kênh thông báo để bot gửi alert vào nhóm này.`
        )

      case '/digest':
      case '/report':
      case '/tom_tat':
      case '/tomtat':
        return await cmdDigest(ctx, args)

      case '/groups':
      case '/nhom':
        return await cmdGroups(ctx)

      case '/alerts':
      case '/canh_bao':
        return await cmdAlerts(ctx)

      case '/summary':
      case '/tom_tat_nhom':
        return await cmdSummaryGroup(ctx, args)

      default:
        return await reply(ctx, `❓ Lệnh không hiểu: <code>${command}</code>\nGõ /help để xem danh sách lệnh.`)
    }
  } catch (err: any) {
    await reply(ctx, `⚠️ Lỗi: ${err.message ?? 'unknown'}`)
    return true
  }
}

function buildHelpText() {
  return [
    '<b>🤖 Zalo Monitor Bot</b>',
    '',
    'Các lệnh có sẵn:',
    '',
    '/digest [day|week|month] — Báo cáo tổng hợp',
    '/groups — Danh sách nhóm đang theo dõi',
    '/alerts — Cảnh báo đang mở',
    '/summary &lt;tên_nhóm&gt; — Tóm tắt 1 nhóm cụ thể',
    '/help — Hiển thị hướng dẫn này',
  ].join('\n')
}

async function cmdDigest(ctx: TelegramCtx, args: string[]) {
  const rangeRaw = (args[0] ?? 'day').toLowerCase()
  const range: 'day' | 'week' | 'month' =
    rangeRaw === 'week' ? 'week' :
    rangeRaw === 'month' ? 'month' : 'day'

  const result = await generateDigestForTenant(ctx.tenantId, range)
  if (!result) return reply(ctx, '⚠️ Không tạo được báo cáo.')

  const { digest, narrative } = result
  const s = digest.stats

  const lines: string[] = [
    `<b>📊 Báo cáo ${digest.rangeLabel}</b>`,
    `<i>${digest.tenantName}</i>`,
    '',
    `📨 <b>${s.totalMessages}</b> tin · 💬 <b>${s.activeGroups}</b> nhóm active`,
    `🚨 <b>${s.openAlerts}</b> cảnh báo · 💰 <b>${s.newOpportunities}</b> cơ hội`,
  ]

  if (narrative) {
    lines.push('')
    lines.push('✨ <b>Tóm tắt AI:</b>')
    lines.push(narrative)
  }

  if (digest.urgentAlerts.length) {
    lines.push('')
    lines.push('<b>🚨 Cần xử lý:</b>')
    for (const a of digest.urgentAlerts.slice(0, 5)) {
      lines.push(`• [${a.groupName}] ${a.summary}`)
    }
  }

  if (digest.topGroups.length) {
    lines.push('')
    lines.push('<b>📈 Nhóm hoạt động nhất:</b>')
    for (const g of digest.topGroups.slice(0, 5)) {
      lines.push(`• ${g.name} — ${g.messageCount} tin`)
    }
  }

  return reply(ctx, lines.join('\n'))
}

async function cmdGroups(ctx: TelegramCtx) {
  const groups = await db.group.findMany({
    where: { tenantId: ctx.tenantId, monitorEnabled: true },
    orderBy: { lastMessageAt: { sort: 'desc', nulls: 'last' } },
    take: 50,
    include: { _count: { select: { messages: true, alerts: true } } },
  })

  if (!groups.length) return reply(ctx, '📭 Chưa có nhóm nào đang theo dõi.')

  const channelEmoji: Record<string, string> = { ZALO: '💬', TELEGRAM: '✈️', LARK: '🪶' }
  const lines = [`<b>💬 ${groups.length} nhóm đang theo dõi</b>`, '']
  for (const g of groups) {
    const em = channelEmoji[g.channelType] ?? '💬'
    const last = g.lastMessageAt ? formatRelative(g.lastMessageAt) : 'chưa có'
    lines.push(`${em} <b>${escapeHtml(g.name)}</b>`)
    lines.push(`   ${g._count.messages} tin · ${g._count.alerts} alert · ${last}`)
  }
  return reply(ctx, lines.join('\n'))
}

async function cmdAlerts(ctx: TelegramCtx) {
  const alerts = await db.alert.findMany({
    where: { tenantId: ctx.tenantId, status: 'OPEN' },
    orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
    take: 10,
    include: { group: { select: { name: true } } },
  })

  if (!alerts.length) return reply(ctx, '✅ Không có cảnh báo nào đang mở.')

  const lines = [`<b>🚨 ${alerts.length} cảnh báo đang mở</b>`, '']
  for (const a of alerts) {
    const emoji = { LOW: '🔵', MEDIUM: '🟡', HIGH: '🟠', CRITICAL: '🔴' }[a.priority]
    lines.push(`${emoji} <b>${a.label}</b> · ${escapeHtml(a.group.name)}`)
    lines.push(`   ${escapeHtml(a.summary)}`)
    lines.push('')
  }
  return reply(ctx, lines.join('\n'))
}

/**
 * Trả lời câu hỏi free-form bằng AI + data trong DB.
 * Ví dụ:
 *   "Nhóm nào hôm nay có khiếu nại?"
 *   "Có cơ hội nào mới không?"
 *   "Tóm tắt nhóm HỘI TENNIS"
 *   "Hôm nay có gì quan trọng?"
 */
async function cmdFreeformAI(ctx: TelegramCtx, question: string) {
  // Fallback nếu chưa có AI key
  if (!anthropic) {
    return reply(ctx,
      `🤔 Tôi chưa được config AI key.\n` +
      `Dùng các lệnh có sẵn:\n\n${buildHelpText()}`
    )
  }

  // Send "thinking" reply
  await sendChatAction(ctx.chatId, 'typing')

  // Collect data context: top groups + recent alerts + top messages
  const since = new Date(Date.now() - 7 * 24 * 3600 * 1000)
  const [groups, alerts, recentMessages] = await Promise.all([
    db.group.findMany({
      where: { tenantId: ctx.tenantId, monitorEnabled: true },
      orderBy: { lastMessageAt: { sort: 'desc', nulls: 'last' } },
      take: 20,
      select: { id: true, name: true, memberCount: true, lastMessageAt: true, _count: { select: { messages: true, alerts: true } } },
    }),
    db.alert.findMany({
      where: { tenantId: ctx.tenantId, createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: { group: { select: { name: true } } },
    }),
    db.message.findMany({
      where: {
        group: { tenantId: ctx.tenantId, monitorEnabled: true },
        sentAt: { gte: since },
        senderType: 'CONTACT',
      },
      orderBy: { sentAt: 'desc' },
      take: 80,
      select: {
        content: true, senderName: true, sentAt: true,
        group: { select: { name: true } },
        analysis: { select: { label: true, priority: true } },
      },
    }),
  ])

  const dataContext = {
    groups: groups.map(g => ({
      name: g.name, members: g.memberCount,
      messageCount: g._count.messages, alertCount: g._count.alerts,
      lastActivity: g.lastMessageAt,
    })),
    recentAlerts: alerts.map(a => ({
      groupName: a.group.name, label: a.label, priority: a.priority,
      summary: a.summary, status: a.status, at: a.createdAt,
    })),
    recentMessages: recentMessages.map(m => ({
      group: m.group.name, sender: m.senderName, content: m.content?.slice(0, 150),
      label: m.analysis?.label, priority: m.analysis?.priority,
    })),
  }

  const systemPrompt = `Bạn là trợ lý AI giúp chủ doanh nghiệp tổng hợp thông tin từ các nhóm chat Zalo/Telegram/Lark.
Anh ta hỏi qua Telegram bot, bạn trả lời dựa trên DATA được cung cấp.

QUY TẮC:
- Trả lời bằng tiếng Việt, thân thiện, ngắn gọn (< 300 từ)
- Chỉ dùng data được cung cấp, KHÔNG bịa
- Nếu data không đủ, nói thẳng "Chưa có dữ liệu về điều này"
- Format: dùng HTML Telegram (<b>, <i>, <code>) để highlight, KHÔNG dùng markdown
- Nếu liệt kê: dùng "• " đầu dòng
- Ưu tiên: cảnh báo cấp cao, cơ hội bán hàng, vấn đề cần quyết định

DATA:
${JSON.stringify(dataContext, null, 2).slice(0, 12000)}`

  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001', max_tokens: 800,
      system: systemPrompt,
      messages: [{ role: 'user', content: question }],
    })
    const answer = response.content[0].type === 'text' ? response.content[0].text : ''
    return reply(ctx, answer || '🤔 Không có kết quả.')
  } catch (err: any) {
    return reply(ctx, `⚠️ Lỗi AI: ${err.message}`)
  }
}

async function sendChatAction(chatId: string, action: 'typing' | 'upload_photo') {
  if (!BOT_TOKEN) return
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendChatAction`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, action }),
  }).catch(() => undefined)
}

async function cmdSummaryGroup(ctx: TelegramCtx, args: string[]) {
  const query = args.join(' ').trim()
  if (!query) return reply(ctx, 'Gõ: /summary &lt;tên nhóm&gt;')

  const group = await db.group.findFirst({
    where: {
      tenantId: ctx.tenantId,
      name: { contains: query, mode: 'insensitive' },
    },
  })
  if (!group) return reply(ctx, `❓ Không tìm thấy nhóm chứa "${escapeHtml(query)}"`)

  const since = new Date(Date.now() - 24 * 3600 * 1000)
  const messages = await db.message.findMany({
    where: { groupId: group.id, sentAt: { gte: since } },
    orderBy: { sentAt: 'asc' },
    take: 100,
    include: { analysis: { select: { label: true, priority: true, reason: true } } },
  })

  if (!messages.length) return reply(ctx, `📭 Nhóm <b>${escapeHtml(group.name)}</b> không có tin nhắn trong 24h qua.`)

  // AI summarize nếu có key, else trả raw stats
  let summary: string
  if (anthropic) {
    const context = messages
      .map(m => `[${m.senderName ?? '?'}]: ${m.content?.slice(0, 200)}`)
      .join('\n')
    const res = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001', max_tokens: 500,
      messages: [{ role: 'user', content:
        `Tóm tắt hội thoại nhóm "${group.name}" trong 24h qua (3-5 câu, tiếng Việt, nêu điểm quan trọng + suggest action nếu có):\n\n${context}`
      }],
    })
    summary = res.content[0].type === 'text' ? res.content[0].text : ''
  } else {
    const byLabel = messages.reduce((acc, m) => {
      const l = m.analysis?.label ?? 'NEUTRAL'
      acc[l] = (acc[l] ?? 0) + 1
      return acc
    }, {} as Record<string, number>)
    summary = [
      `<b>Thống kê ${messages.length} tin:</b>`,
      ...Object.entries(byLabel).map(([l, n]) => `• ${l}: ${n}`),
    ].join('\n')
  }

  return reply(ctx, `<b>📝 Tóm tắt ${escapeHtml(group.name)}</b>\n<i>24h qua · ${messages.length} tin</i>\n\n${summary}`)
}

async function reply(ctx: TelegramCtx, text: string): Promise<true> {
  if (!BOT_TOKEN) return true
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: ctx.chatId, text, parse_mode: 'HTML',
      disable_web_page_preview: true,
    }),
  })
  return true
}

function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function formatRelative(d: Date) {
  const diff = Date.now() - d.getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'vừa xong'
  if (m < 60) return `${m}p trước`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h trước`
  return `${Math.floor(h / 24)} ngày`
}
