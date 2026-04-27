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
    const secret = req.headers['x-webhook-secret']
    if (secret !== process.env.WEBHOOK_SECRET) {
      return reply.status(401).send({ error: 'Unauthorized' })
    }

    const tenantId = req.headers['x-tenant-id'] as string
    if (!tenantId) return reply.status(400).send({ error: 'Missing tenant id' })

    // Tenant check — Zalo có enabled không?
    const tenant = await db.tenant.findUnique({
      where: { id: tenantId },
      select: { enabledChannels: true },
    })
    if (!tenant?.enabledChannels.includes('ZALO')) {
      return reply.status(200).send({ ok: true, skipped: 'zalo_disabled' })
    }

    const raw = req.body as Record<string, any>

    // openzca payload:
    // { msgId, cliMsgId, senderId, toId, threadId, content, mediaPath, mediaUrl, ... }
    const threadId = raw.threadId ?? raw.idTo ?? raw.groupId
    const messageId = raw.msgId ?? raw.cliMsgId
    const senderId = raw.senderId ?? raw.uidFrom
    const text = raw.content ?? raw.message ?? raw.text

    if (!threadId || !messageId || !senderId) {
      return reply.status(200).send({ ok: true, skipped: 'incomplete' })
    }

    const isGroup = raw.chatType === 1 || raw.isGroup === true || String(threadId).startsWith('group:')
    const cleanThreadId = String(threadId).replace(/^group:/, '')
    const senderType: 'SELF' | 'CONTACT' = raw.isSelf || raw.senderType === 'SELF' ? 'SELF' : 'CONTACT'

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
    const group = await db.group.upsert({
      where: {
        tenantId_externalId_channelType: {
          tenantId,
          externalId: cleanThreadId,
          channelType: 'ZALO',
        },
      },
      update: {},
      create: {
        tenantId,
        externalId: cleanThreadId,
        channelType: 'ZALO',
        name: raw.groupName ?? raw.threadName ?? `Nhóm ${cleanThreadId.slice(-6)}`,
        monitorEnabled: true,
      },
    })

    // Nếu user đã tắt monitor nhóm này → skip
    if (!group.monitorEnabled) {
      return reply.status(200).send({ ok: true, skipped: 'group_monitor_off', groupId: group.id })
    }

    // Save message
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
        attachments: raw.mediaUrl ? [raw.mediaUrl] : undefined,
        sentAt: raw.timestamp ? new Date(raw.timestamp) : new Date(),
      },
    })

    await db.group.update({
      where: { id: group.id },
      data: { lastMessageAt: new Date() },
    })

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
    if (userId && cleanThreadId) {
      await db.groupMonitor.upsert({
        where: { groupId_userId: { groupId: group.id, userId } },
        create: { groupId: group.id, userId, tenantId },
        update: {},
      }).catch(() => undefined)
    }

    // Auto-sync history on first connect
    // Runs once: checks lastAutoSyncAt — if null or > 24h ago, trigger background sync
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
  const mt = (raw.mediaType ?? raw.msgType ?? '').toLowerCase()
  if (mt.includes('image') || mt.includes('photo')) return 'IMAGE'
  if (mt.includes('video')) return 'VIDEO'
  if (mt.includes('voice') || mt.includes('audio')) return 'VOICE'
  if (mt.includes('sticker')) return 'STICKER'
  if (raw.mediaPath || raw.mediaUrl) return 'FILE'
  return 'TEXT'
}
