/**
 * Telegram Bot API long-polling trong backend.
 *
 * OpenClaw Telegram plugin đã được DISABLE để tránh xung đột (double reply).
 * Backend là listener DUY NHẤT cho bot Telegram.
 *
 * Tính năng:
 * - Nhận mọi tin nhắn → kiểm tra admin whitelist
 * - Nếu "/lệnh" → handleTelegramCommand → reply
 * - Nếu tin thường → bỏ qua (bot không free-chat)
 */

import { handleTelegramCommand } from './telegram-commands.js'
import { db } from './db.js'

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN
const POLL_TIMEOUT_SEC = 30
const API = 'https://api.telegram.org'

type Update = {
  update_id: number
  message?: {
    message_id: number
    from?: { id: number; username?: string; first_name?: string }
    chat: { id: number; type: string; title?: string }
    text?: string
    date: number
  }
}

let offset = 0
let running = false

export async function startTelegramPoller() {
  if (!BOT_TOKEN) {
    console.log('[telegram-poll] TELEGRAM_BOT_TOKEN not set, poller disabled')
    return
  }
  if (running) return
  running = true

  console.log('[telegram-poll] Starting long-polling...')
  loop().catch(err => {
    console.error('[telegram-poll] fatal:', err)
    running = false
    // Retry sau 10s
    setTimeout(() => startTelegramPoller(), 10_000)
  })
}

async function loop() {
  while (running) {
    try {
      const url = `${API}/bot${BOT_TOKEN}/getUpdates?offset=${offset}&timeout=${POLL_TIMEOUT_SEC}&allowed_updates=["message"]`
      const res = await fetch(url, { signal: AbortSignal.timeout((POLL_TIMEOUT_SEC + 5) * 1000) })
      const data = await res.json() as { ok: boolean; result: Update[] }

      if (!data.ok) {
        console.warn('[telegram-poll] API error, retry in 5s')
        await sleep(5000)
        continue
      }

      for (const upd of data.result) {
        offset = upd.update_id + 1
        await handleUpdate(upd).catch(err =>
          console.error('[telegram-poll] handle error:', err.message)
        )
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.warn('[telegram-poll] network error, retry in 5s:', err.message)
      }
      await sleep(5000)
    }
  }
}

const seenChats = new Set<string>()

async function handleUpdate(upd: Update) {
  const msg = upd.message
  if (!msg?.text) return

  const chatId = String(msg.chat.id)
  const text = msg.text.trim()
  const senderName = msg.from?.first_name ?? msg.from?.username ?? 'Unknown'

  // Log chat mới (lần đầu thấy)
  if (!seenChats.has(chatId)) {
    seenChats.add(chatId)
    console.log(`[telegram-poll] 📬 NEW CHAT: id=${chatId} type=${msg.chat.type} title="${msg.chat.title ?? '(DM)'}"`)
  }

  // Pass tất cả messages (command + free-form) cho handler

  // Resolve tenant từ chat_id (tìm admin channel matching)
  const channel = await db.notificationChannel.findFirst({
    where: {
      channelType: 'TELEGRAM',
      target: chatId,
    },
  })

  let tenantId: string | null = null
  if (channel) {
    tenantId = channel.tenantId
  } else {
    // Fallback: pick first tenant (single-tenant mode)
    const first = await db.tenant.findFirst({ orderBy: { createdAt: 'asc' } })
    tenantId = first?.id ?? null
  }

  if (!tenantId) {
    await sendMessage(chatId, '⚠️ Chưa có tenant nào được thiết lập. Mở dashboard để setup.')
    return
  }

  await handleTelegramCommand({ tenantId, chatId, senderName, text })
}

async function sendMessage(chatId: string, text: string) {
  await fetch(`${API}/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
  })
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }
