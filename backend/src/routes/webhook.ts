import type { FastifyPluginAsync } from 'fastify'
import { db } from '../services/db.js'
import { wsManager } from '../services/websocket.js'
import { aiQueue } from '../services/queue.js'
import { handleTelegramCommand } from '../services/telegram-commands.js'

export const webhookRoutes: FastifyPluginAsync = async (app) => {
  app.post('/message', async (req, reply) => {
    const tenantId = req.headers['x-tenant-id'] as string
    if (!tenantId) return reply.status(400).send({ error: 'Missing tenant id' })

    const secret = req.headers['x-webhook-secret']
    if (!secret) return reply.status(401).send({ error: 'Missing webhook secret' })

    // Xác thực: secret phải khớp với webhookSecret riêng của tenant
    // Fallback: chấp nhận WEBHOOK_SECRET global (cho hooks legacy trước khi có per-tenant)
    const tenant = await db.tenant.findUnique({
      where: { id: tenantId },
      select: {
        enabledChannels: true, webhookSecret: true, active: true,
        monitorDMs: true, allowedDMIds: true,
      },
    })
    if (!tenant) return reply.status(404).send({ error: 'Tenant not found' })
    if (!tenant.active) return reply.status(403).send({ error: 'Tenant suspended' })

    const globalSecret = process.env.WEBHOOK_SECRET
    const validSecret =
      secret === tenant.webhookSecret ||
      (globalSecret && globalSecret !== 'change-this-secret' && secret === globalSecret)
    if (!validSecret) return reply.status(401).send({ error: 'Invalid webhook secret' })

    const raw = req.body as Record<string, any>

    // Normalize payload từ OpenClaw/OpenZalo
    const msg = normalizePayload(raw)
    if (!msg) return reply.status(200).send({ ok: true, skipped: true })

    const channel = detectChannel(raw, msg)
    if (!tenant.enabledChannels.includes(channel)) {
      return reply.status(200).send({ ok: true, skipped: true, reason: 'channel_disabled', channel })
    }

    // PRIVACY: skip DMs (tin nhắn 1-1) mặc định.
    // Tenant phải opt-in qua Settings nếu muốn theo dõi (vì tài khoản Zalo
    // chạy OpenClaw là Zalo cá nhân — mọi DM bao gồm cả vợ/bạn đều đi qua hook).
    if (!msg.isGroup) {
      const inAllowlist = tenant.allowedDMIds.includes(msg.threadId)
      if (!tenant.monitorDMs && !inAllowlist) {
        return reply.status(200).send({ ok: true, skipped: true, reason: 'dm_not_monitored' })
      }
    }

    // Telegram command handling — khi user DM bot với "/lệnh"
    if (channel === 'TELEGRAM' && msg.senderType === 'CONTACT' && msg.text?.startsWith('/')) {
      const handled = await handleTelegramCommand({
        tenantId,
        chatId: msg.threadId,
        senderName: msg.senderName,
        text: msg.text,
      })
      if (handled) return reply.status(200).send({ ok: true, handled: 'telegram_command' })
    }

    // Auto-discover group nếu chưa có
    const group = await upsertGroup(tenantId, msg, channel)

    // Lưu message
    const message = await db.message.upsert({
      where: { groupId_externalId: { groupId: group.id, externalId: msg.messageId } },
      update: {},
      create: {
        groupId: group.id,
        externalId: msg.messageId,
        senderType: msg.senderType,
        senderId: msg.senderId,
        senderName: msg.senderName ?? null,
        contentType: msg.contentType,
        content: msg.text ?? null,
        attachments: msg.mediaUrls?.length ? msg.mediaUrls : undefined,
        quoteMsgId: msg.quoteMsgId ?? null,
        quoteText: msg.quoteText ?? null,
        sentAt: new Date(msg.timestamp),
      },
    })

    // Cập nhật lastMessageAt của group
    await db.group.update({
      where: { id: group.id },
      data: { lastMessageAt: new Date(msg.timestamp) },
    })

    // Broadcast real-time tới dashboard
    wsManager.broadcast('message:new', {
      groupId: group.id,
      groupName: group.name,
      messageId: message.id,
      content: msg.text,
      contentType: msg.contentType,
      senderName: msg.senderName,
      sentAt: message.sentAt,
    })

    // Đẩy vào queue để AI classify (async, không block)
    await aiQueue.add('classify', { messageId: message.id, tenantId, groupId: group.id })

    return reply.status(200).send({ ok: true, messageId: message.id })
  })
}

async function upsertGroup(tenantId: string, msg: NormalizedMessage, channel: 'ZALO' | 'TELEGRAM' | 'LARK') {
  const isDM = !msg.isGroup
  const fallbackName = isDM
    ? (msg.senderName ? `DM: ${msg.senderName}` : `DM ${msg.threadId.slice(-6)}`)
    : `Nhóm ${msg.threadId.slice(-6)}`

  return db.group.upsert({
    where: {
      tenantId_externalId_channelType: {
        tenantId,
        externalId: msg.threadId,
        channelType: channel,
      },
    },
    update: {},
    create: {
      tenantId,
      externalId: msg.threadId,
      channelType: channel,
      name: msg.groupName ?? fallbackName,
      monitorEnabled: true,
    },
  })
}

function detectChannel(raw: Record<string, any>, _msg: NormalizedMessage): 'TELEGRAM' | 'ZALO' | 'LARK' {
  const id = (raw.channelId ?? raw.channel ?? '').toLowerCase()
  if (id.includes('zalo') || id === 'openzalo') return 'ZALO'
  if (id.includes('feishu') || id.includes('lark')) return 'LARK'
  return 'TELEGRAM'
}

type NormalizedMessage = {
  messageId: string
  threadId: string
  senderType: 'SELF' | 'CONTACT'
  senderId: string
  senderName?: string
  text?: string
  contentType: 'TEXT' | 'IMAGE' | 'VIDEO' | 'FILE' | 'STICKER' | 'VOICE' | 'LINK'
  mediaUrls?: string[]
  timestamp: number
  isGroup: boolean
  groupName?: string
  quoteMsgId?: string
  quoteText?: string
}

function normalizePayload(raw: Record<string, any>): NormalizedMessage | null {
  const messageId = raw.messageId ?? raw.msgId ?? raw.cliMsgId
  const threadId = raw.threadId ?? raw.thread_id
  let senderId = raw.senderId ?? raw.sender_id

  if (!messageId || !threadId || !senderId) return null

  // Prefix "feishu:" cho Lark để phân biệt user Lark vs Zalo (tránh collision)
  const channel = (raw.channelId ?? '').toLowerCase()
  if ((channel.includes('feishu') || channel.includes('lark')) && !String(senderId).startsWith('feishu:')) {
    senderId = `feishu:${senderId}`
  }

  const senderType: 'SELF' | 'CONTACT' = raw.senderType === 'SELF' ? 'SELF' : 'CONTACT'

  let contentType: NormalizedMessage['contentType'] = 'TEXT'
  if (raw.mediaTypes?.includes('image') || raw.msgType?.includes('photo')) contentType = 'IMAGE'
  else if (raw.mediaTypes?.includes('video') || raw.msgType?.includes('video')) contentType = 'VIDEO'
  else if (raw.mediaTypes?.includes('voice')) contentType = 'VOICE'
  else if (raw.mediaTypes?.includes('file')) contentType = 'FILE'
  else if (raw.msgType?.includes('sticker')) contentType = 'STICKER'

  return {
    messageId: String(messageId),
    threadId: String(threadId),
    senderType,
    senderId: String(senderId),
    senderName: raw.senderName ?? raw.sender_name,
    text: raw.text ?? raw.content ?? raw.message,
    contentType,
    mediaUrls: raw.mediaUrls ?? raw.media_urls,
    timestamp: raw.timestamp ?? Date.now(),
    isGroup: raw.isGroup ?? raw.is_group ?? true,
    groupName: raw.groupName ?? raw.group_name ?? raw.threadName,
    quoteMsgId: raw.quoteMsgId ?? raw.quote_msg_id,
    quoteText: raw.quoteText ?? raw.quote_text,
  }
}
