/**
 * Session monitor — kiểm tra định kỳ xem hook còn sống không.
 * Nếu lastHookPingAt > 2h và tenant đã setup → gửi alert qua configured channels.
 * Chạy mỗi 30 phút. Alert tối đa 1 lần/ngày/tenant để tránh spam.
 */

import { db } from './db.js'

const DEAD_THRESHOLD_MS = 2 * 60 * 60 * 1000   // 2 hours
const ALERT_COOLDOWN_MS = 24 * 60 * 60 * 1000  // 24 hours between alerts

async function checkSessions() {
  const now = new Date()
  const deadCutoff = new Date(now.getTime() - DEAD_THRESHOLD_MS)
  const alertCooldown = new Date(now.getTime() - ALERT_COOLDOWN_MS)

  // Find tenants that:
  // - Are active and setupDone
  // - lastHookPingAt is older than 2h OR null (but created > 2h ago)
  // - Haven't been alerted in last 24h
  const tenants = await db.tenant.findMany({
    where: {
      active: true,
      setupDone: true,
      AND: [
        {
          OR: [
            { lastHookPingAt: { lt: deadCutoff } },
            { lastHookPingAt: null, createdAt: { lt: deadCutoff } },
          ],
        },
        {
          OR: [
            { sessionAlertSentAt: { lt: alertCooldown } },
            { sessionAlertSentAt: null },
          ],
        },
      ],
    },
    select: {
      id: true,
      name: true,
      lastHookPingAt: true,
      notificationChannels: {
        where: { enabled: true },
        select: { id: true, channelType: true, target: true, label: true },
      },
    },
  })

  for (const tenant of tenants) {
    if (!tenant.notificationChannels.length) continue

    const hoursAgo = tenant.lastHookPingAt
      ? Math.floor((now.getTime() - tenant.lastHookPingAt.getTime()) / 3_600_000)
      : null

    const msg = hoursAgo
      ? `⚠️ [${tenant.name}] Kết nối Zalo bị gián đoạn ${hoursAgo} tiếng rồi. Vui lòng vào dashboard quét lại QR: /dashboard/settings/channels`
      : `⚠️ [${tenant.name}] Hook Zalo chưa kết nối. Vui lòng cài đặt và quét QR: /dashboard/settings/channels`

    // Send via Telegram channels
    for (const ch of tenant.notificationChannels) {
      if (ch.channelType === 'TELEGRAM') {
        await sendTelegram(ch.target, msg).catch(() => undefined)
      }
      // Could add EMAIL, ZALO here
    }

    // Mark alert sent
    await db.tenant.update({
      where: { id: tenant.id },
      data: { sessionAlertSentAt: now },
    }).catch(() => undefined)
  }
}

async function sendTelegram(target: string, text: string) {
  // target format: "BOT_TOKEN:CHAT_ID"
  const [botToken, chatId] = target.split(':')
  if (!botToken || !chatId) return
  await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
  })
}

export function startSessionMonitor() {
  // Run immediately after 5 min delay (let server warm up)
  const warmup = setTimeout(() => checkSessions().catch(() => undefined), 5 * 60_000)
  warmup.unref?.()

  // Then every 30 minutes
  const interval = setInterval(() => checkSessions().catch(() => undefined), 30 * 60_000)
  interval.unref?.()
}
