/**
 * Webhook riêng cho openzca listen --webhook
 *
 * Payload từ openzca có format khác với OpenClaw hook.
 * Normalize về cùng format rồi lưu DB.
 * Filter: chỉ process nếu tenant enabled Zalo + group.monitorEnabled.
 */

import type { FastifyPluginAsync } from 'fastify'
import { db } from '../services/db.js'
import { wsManager } from '../services/websocket.js'
import { aiQueue } from '../services/queue.js'

export const zaloWebhookRoutes: FastifyPluginAsync = async (app) => {
  app.post('/', async (req, reply) => {
    const secret = req.headers['x-webhook-secret'] as string
    const tenantId = req.headers['x-tenant-id'] as string
    if (!secret) return reply.status(401).send({ error: 'Missing secret' })
    if (!tenantId) return reply.status(400).send({ error: 'Missing tenant id' })

    // Validate secret: tenant-level OR per-user
    const tenantAuth = await db.tenant.findFirst({
      where: { id: tenantId },
      select: { webhookSecret: true },
    })
    if (!tenantAuth) return reply.status(404).send({ error: 'Tenant not found' })
    let secretValid = secret === tenantAuth.webhookSecret
    if (!secretValid) {
      const u = await db.user.findFirst({ where: { tenantId, webhookSecret: secret }, select: { id: true } })
      secretValid = !!u
    }
    if (!secretValid) return reply.status(401).send({ error: 'Invalid secret' })

    // Có message từ Zalo nghĩa là login đã thành công → clear QR + cập nhật hook ping
    const { clearQrFromStore, hookPings } = await import('./setup.js')
    clearQrFromStore(tenantId)
    hookPings.set(tenantId, Date.now())

    // Tenant check — Zalo có enabled không?
    const tenant = await db.tenant.findUnique({
      where: { id: tenantId },
      select: { enabledChannels: true, monitorDMs: true, allowedDMIds: true },
    })
    if (!tenant?.enabledChannels.includes('ZALO')) {
      return reply.status(200).send({ ok: true, skipped: 'zalo_disabled' })
    }

    // Fire-and-forget: update lastHookPingAt (don't await, don't block message processing)
    db.tenant.update({
      where: { id: tenantId },
      data: { lastHookPingAt: new Date() },
    }).catch(() => undefined)

    const raw = req.body as Record<string, any>

    // DEBUG: bật bằng DEBUG_WEBHOOK=1 nếu cần trace payload
    if (process.env.DEBUG_WEBHOOK === '1') {
      app.log.info({ tenantId, keys: Object.keys(raw), preview: JSON.stringify(raw).slice(0, 500) }, '[zalo-webhook] raw payload')
    }

    // openzca payload:
    // { msgId, cliMsgId, senderId, toId, threadId, content, mediaPath, mediaUrl, ... }
    // Recall events có: type='undo' | event='delete' | content.deletedMsgId
    const threadId = raw.threadId ?? raw.idTo ?? raw.groupId ?? raw.toUid ?? raw.uidTo ?? raw.tid
    const messageId = raw.msgId ?? raw.cliMsgId ?? raw.id
    const senderId = raw.senderId ?? raw.uidFrom ?? raw.fromUid ?? raw.from
    const text = raw.content ?? raw.message ?? raw.text

    if (!threadId || !messageId || !senderId) {
      app.log.warn({ tenantId, keys: Object.keys(raw), threadId, messageId, senderId }, '[zalo-webhook] skipped: missing required fields')
      return reply.status(200).send({ ok: true, skipped: 'incomplete', missingFields: { threadId: !threadId, messageId: !messageId, senderId: !senderId }, hint: 'check listener payload format' })
    }

    // Detect recall: openzca event có type/msgType là 'undo' hoặc content có deletedMsgId
    const isRecall = raw.type === 'undo' || raw.msgType === 'undo' || raw.event === 'delete' ||
                     (typeof text === 'object' && text?.deletedMsgId) ||
                     (typeof raw.content === 'object' && raw.content?.deletedMsgId)
    if (isRecall) {
      // Mark original message as deleted (don't create new)
      const targetMsgId = (typeof raw.content === 'object' ? raw.content?.deletedMsgId : null) ?? raw.deletedMsgId ?? messageId
      const group = await db.group.findFirst({ where: { tenantId, externalId: String(threadId).replace(/^group:/, ''), channelType: 'ZALO' } })
      if (group) {
        await db.message.updateMany({
          where: { groupId: group.id, externalId: String(targetMsgId) },
          data: { deletedAt: new Date() },
        })
      }
      return reply.status(200).send({ ok: true, recalled: true })
    }

    const numericId = String(threadId).replace(/^group:/, '')
    // openzca không nhất quán emit chatType / 'group:' prefix cho group chat.
    // Strategy:
    //   1) Trust hint từ raw nếu có (chatType=1 / isGroup=true / threadId prefix)
    //   2) Nếu DB đã có record 'group:X' cho cùng numericId → tiếp tục treat as group
    //   3) Default DM
    let isGroup = raw.chatType === 1 || raw.isGroup === true || String(threadId).startsWith('group:')
    if (!isGroup) {
      const knownGroup = await db.group.findFirst({
        where: { tenantId, externalId: `group:${numericId}`, channelType: 'ZALO' },
        select: { id: true },
      })
      if (knownGroup) isGroup = true
    }
    // GIỮ prefix 'group:' trong externalId để KHÔNG collision giữa DM "123" và group "group:123"
    const fullExternalId = isGroup ? `group:${numericId}` : numericId
    const senderType: 'SELF' | 'CONTACT' = raw.isSelf || raw.senderType === 'SELF' ? 'SELF' : 'CONTACT'

    // ── Filter DM: nếu tenant tắt monitorDMs và không trong allowedDMIds → skip
    // (DM 1-1 mặc định KHÔNG monitor để tránh nhiễu / lưu tin riêng tư)
    if (!isGroup && !tenant.monitorDMs && !tenant.allowedDMIds.includes(numericId)) {
      return reply.status(200).send({ ok: true, skipped: 'dm_monitor_off' })
    }

    // Identify which user owns the OpenClaw (try to find by webhook secret)
    let userId: string | undefined
    if (raw.userId) {
      userId = raw.userId
    } else {
      // Try to find user by webhook secret
      const user = await db.user.findFirst({
        where: { tenantId, webhookSecret: secret as string },
        select: { id: true }
      })
      userId = user?.id
    }

    // Auto-create group với monitor ON mặc định
    // (use case: tổng hợp tất cả nhóm Zalo admin có; user tắt từng nhóm nếu cần)
    //
    // Tên nhóm:
    // - Group chat: chỉ dùng tên thật từ Zalo (groupName/threadName).
    //   KHÔNG fallback dName/senderName vì đó là tên người gửi gần nhất, không phải tên nhóm.
    // - DM 1-1: lấy tên người chat (dName/senderName).
    const realGroupName = isGroup ? (raw.groupName ?? raw.threadName) : (raw.dName ?? raw.senderName)
    const fallbackName = isGroup ? `Nhóm ${numericId.slice(-6)}` : `DM ${numericId.slice(-6)}`

    // Tìm group hiện có; nếu name đang là fallback và webhook có name thật → update
    const existing = await db.group.findUnique({
      where: { tenantId_externalId_channelType: { tenantId, externalId: fullExternalId, channelType: 'ZALO' } },
      select: { id: true, name: true },
    })

    let group
    if (existing) {
      const looksLikeFallback = /^(Nhóm|DM) [0-9a-z]{4,8}$/.test(existing.name)
      const shouldRename = looksLikeFallback && realGroupName && realGroupName !== existing.name
      group = shouldRename
        ? await db.group.update({ where: { id: existing.id }, data: { name: realGroupName } })
        : await db.group.findUnique({ where: { id: existing.id } })
    } else {
      group = await db.group.create({
        data: {
          tenantId,
          externalId: fullExternalId,
          channelType: 'ZALO',
          name: realGroupName ?? fallbackName,
          monitorEnabled: true,
          isDirect: !isGroup,
        },
      })
    }
    if (!group) return reply.status(500).send({ error: 'Failed to upsert group' })

    // Nếu user đã tắt monitor nhóm này → skip
    if (!group.monitorEnabled) {
      return reply.status(200).send({ ok: true, skipped: 'group_monitor_off', groupId: group.id })
    }

    // Save message — phân biệt tạo mới vs upsert để tăng counter đúng
    const existingMsg = await db.message.findUnique({
      where: { groupId_externalId: { groupId: group.id, externalId: String(messageId) } },
      select: { id: true },
    })
    const message = await db.message.upsert({
      where: { groupId_externalId: { groupId: group.id, externalId: String(messageId) } },
      update: {},
      create: {
        groupId: group.id,
        externalId: String(messageId),
        senderType,
        senderId: String(senderId),
        senderName: raw.senderName ?? raw.dName ?? null,
        contentType: detectContentType(raw),
        content: typeof text === 'string' ? text : JSON.stringify(text),
        attachments: (() => {
          const urls: string[] = []
          if (raw.mediaUrl) urls.push(String(raw.mediaUrl))
          const fromText = extractMediaUrl(text)
          if (fromText && !urls.includes(fromText)) urls.push(fromText)
          return urls.length > 0 ? urls : undefined
        })(),
        sentAt: raw.timestamp ? new Date(raw.timestamp) : new Date(),
      },
    })

    await db.group.update({
      where: { id: group.id },
      data: { lastMessageAt: new Date() },
    })

    // Tăng counter messagesThisMonth (chỉ tin mới, không count duplicate upsert)
    if (!existingMsg) {
      db.tenant.update({
        where: { id: tenantId },
        data: { messagesThisMonth: { increment: 1 } },
      }).catch(() => undefined)
    }

    wsManager.broadcast('message:new', {
      groupId: group.id,
      groupName: group.name,
      messageId: message.id,
      content: message.content,
      senderName: message.senderName,
      sentAt: message.sentAt,
    })

    if (senderType === 'CONTACT' && message.content && message.content.trim().length >= 3) {
      await aiQueue.add('classify', { messageId: message.id, tenantId, groupId: group.id })
    }

    // Track which user monitors this group (for board scope)
    if (userId && fullExternalId) {
      await db.groupMonitor.upsert({
        where: { groupId_userId: { groupId: group.id, userId } },
        create: { groupId: group.id, userId, tenantId },
        update: {},
      }).catch(() => undefined)
    }

    // Auto-sync: Docker-only fallback. For native/VPS mode, the hook itself
    // runs openzca locally and pushes via POST /api/setup/sync-push.
    // Both check lastAutoSyncAt — first one to run wins.
    if (userId) {
      const tenantFull = await db.tenant.findUnique({
        where: { id: tenantId },
        select: { maxHistorySyncDepth: true, lastAutoSyncAt: true } as const,
      })
      const now = Date.now()
      const lastSync = tenantFull?.lastAutoSyncAt?.getTime() ?? 0
      const needsSync = tenantFull && (
        !tenantFull.lastAutoSyncAt ||
        now - lastSync > 24 * 60 * 60 * 1000 // re-sync if > 24h (e.g. after reconnect)
      )
      if (needsSync && tenantFull && tenantFull.maxHistorySyncDepth > 0) {
        // Mark sync started immediately to prevent parallel runs
        await db.tenant.update({
          where: { id: tenantId },
          data: { lastAutoSyncAt: new Date() } as any,
        }).catch(() => undefined)

        // Fire-and-forget background sync
        setImmediate(async () => {
          try {
            const { syncZaloGroupHistory } = await import('../services/zalo-sync.js')
            const groups = await db.group.findMany({
              where: { tenantId, channelType: 'ZALO', monitorEnabled: true },
              orderBy: { lastMessageAt: 'desc' },
              take: 50,
              select: { id: true, name: true },
            })
            for (const g of groups) {
              try {
                await syncZaloGroupHistory(tenantId, g.id, tenantFull.maxHistorySyncDepth)
              } catch { /* ignore individual group errors */ }
              await new Promise(r => setTimeout(r, 500)) // rate limit
            }
          } catch { /* silently fail */ }
        })
      }
    }

    return reply.status(200).send({ ok: true, messageId: message.id })
  })
}

function detectContentType(raw: Record<string, any>): 'TEXT' | 'IMAGE' | 'VIDEO' | 'FILE' | 'STICKER' | 'VOICE' {
  // Ưu tiên explicit field
  const mt = (raw.mediaType ?? raw.msgType ?? '').toLowerCase()
  if (mt.includes('image') || mt.includes('photo')) return 'IMAGE'
  if (mt.includes('video')) return 'VIDEO'
  if (mt.includes('voice') || mt.includes('audio')) return 'VOICE'
  if (mt.includes('sticker')) return 'STICKER'

  // openzca format: content text có "[media attached: ... (mime) | url]"
  const text = typeof raw.content === 'string' ? raw.content : (typeof raw.text === 'string' ? raw.text : '')
  const m = text.match(/\(([\w/-]+\/[\w-]+)\)/)
  if (m) {
    const mime = m[1].toLowerCase()
    if (mime.startsWith('image/')) return 'IMAGE'
    if (mime.startsWith('video/')) return 'VIDEO'
    if (mime.startsWith('audio/')) return 'VOICE'
    return 'FILE'
  }

  if (raw.mediaPath || raw.mediaUrl) return 'FILE'
  return 'TEXT'
}

// Extract public URL from openzca bracket format
function extractMediaUrl(content: string | unknown): string | null {
  if (typeof content !== 'string') return null
  // [media attached: <path> (<mime>) | <url>]
  const m = content.match(/\|\s*(https?:\/\/[^\s\]]+)/)
  return m ? m[1] : null
}
