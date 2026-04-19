/**
 * Zalo Monitor — OpenClaw Hook Handler
 *
 * Forward message events tới backend. Non-blocking: nếu backend lỗi,
 * hook vẫn return thành công để không ảnh hưởng OpenClaw.
 */

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

type Config = { backendUrl: string; webhookSecret: string; tenantId: string }

let cachedConfig: Config | null = null

function loadConfig(): Config | null {
  if (cachedConfig) return cachedConfig

  // Priority: ENV > ~/.openclaw/hooks/zalo-monitor/.env
  let cfg: Partial<Config> = {
    backendUrl: process.env.ZALO_MONITOR_BACKEND_URL || process.env.BACKEND_URL,
    webhookSecret: process.env.ZALO_MONITOR_SECRET || process.env.WEBHOOK_SECRET,
    tenantId: process.env.ZALO_MONITOR_TENANT_ID || process.env.TENANT_ID,
  }

  if (!cfg.backendUrl || !cfg.webhookSecret || !cfg.tenantId) {
    const envPath = path.join(os.homedir(), '.openclaw', 'hooks', 'zalo-monitor', '.env')
    if (fs.existsSync(envPath)) {
      const raw = fs.readFileSync(envPath, 'utf-8')
      for (const line of raw.split('\n')) {
        const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.+?)\s*$/)
        if (!m) continue
        const [, k, v] = m
        const clean = v.replace(/^["']|["']$/g, '')
        if (k === 'BACKEND_URL')    cfg.backendUrl ??= clean
        if (k === 'WEBHOOK_SECRET') cfg.webhookSecret ??= clean
        if (k === 'TENANT_ID')      cfg.tenantId ??= clean
      }
    }
  }

  if (!cfg.backendUrl || !cfg.webhookSecret || !cfg.tenantId) return null
  cachedConfig = cfg as Config
  return cachedConfig
}

async function post(cfg: Config, payload: Record<string, unknown>) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), 3000)
  try {
    await fetch(`${cfg.backendUrl}/webhook/message`, {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Secret': cfg.webhookSecret,
        'X-Tenant-Id': cfg.tenantId,
      },
      body: JSON.stringify(payload),
    }).catch(() => undefined)
  } finally {
    clearTimeout(t)
  }
}

const handler = async (event: any) => {
  if (event.type !== 'message') return

  const cfg = loadConfig()
  if (!cfg) return // silently skip nếu chưa config

  const ctx = event.context ?? {}

  const isSent = event.action === 'sent'
  const botId = ctx.accountId ?? `bot:${ctx.channelId}`

  const payload = {
    event: `${event.type}:${event.action}`,
    timestamp: ctx.timestamp ?? Date.now(),

    messageId: ctx.messageId ?? `sent-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    threadId: ctx.conversationId ?? ctx.groupId ?? ctx.metadata?.threadId,

    // Sent từ bot: dùng botId làm senderId
    // Received: dùng from hoặc metadata.senderId
    senderType: isSent ? 'SELF' : 'CONTACT',
    senderId: isSent ? botId : (ctx.from ?? ctx.metadata?.senderId ?? 'unknown'),
    senderName: isSent
      ? 'Bot'
      : (ctx.metadata?.senderDisplayName ?? ctx.metadata?.senderName ?? ctx.metadata?.senderUsername ?? ctx.metadata?.senderE164 ?? null),

    text: ctx.bodyForAgent ?? ctx.body ?? ctx.content,
    transcript: ctx.transcript,

    channelId: ctx.channelId,
    accountId: ctx.accountId,
    isGroup: ctx.isGroup ?? true,
    groupId: ctx.groupId,

    // For message:sent
    to: ctx.to,
    success: ctx.success,
  }

  // Fire-and-forget, không await để không block OpenClaw
  post(cfg, payload).catch(() => undefined)
}

export default handler
