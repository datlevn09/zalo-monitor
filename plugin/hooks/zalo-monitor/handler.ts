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

// ── QR Watcher: detect QR file changes and push to backend ────────────────

let qrWatcherRunning = false
let lastQrMtime = 0

async function pushQrToBackend(qrPath: string) {
  const cfg = loadConfig()
  if (!cfg) return

  try {
    // Check file age: skip if older than 5 minutes
    const stat = fs.statSync(qrPath)
    const age = Date.now() - stat.mtimeMs
    if (age > 5 * 60 * 1000) return

    const raw = fs.readFileSync(qrPath)
    const b64 = raw.toString('base64')
    const dataUrl = `data:image/png;base64,${b64}`

    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 5000)
    try {
      await fetch(`${cfg.backendUrl}/api/setup/qr-push`, {
        method: 'POST',
        signal: ctrl.signal,
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Secret': cfg.webhookSecret,
          'X-Tenant-Id': cfg.tenantId,
        },
        body: JSON.stringify({ dataUrl }),
      }).catch(() => undefined)
    } finally {
      clearTimeout(t)
    }
  } catch {
    // silently fail
  }
}

// ── Canvas QR: poll openclaw canvas API for Zalo QR ──────────────────────────
// openclaw native mode serves QR via its built-in canvas UI (port 18789 default)
// The canvas /api/zalo/qr endpoint returns { qr: 'data:image/png;base64,...' } or similar

let lastCanvasQrHash = ''

async function pollCanvasQr(): Promise<boolean> {
  const port = process.env.OPENCLAW_CANVAS_PORT ?? '18789'
  const canvasUrl = `http://127.0.0.1:${port}/__openclaw__/canvas`

  // Try known canvas API paths for QR
  const QR_API_PATHS = [
    `${canvasUrl}/api/zalo/qr`,
    `${canvasUrl}/api/qr`,
    `http://127.0.0.1:${port}/api/zalo/qr`,
  ]

  for (const url of QR_API_PATHS) {
    try {
      const ctrl = new AbortController()
      const t = setTimeout(() => ctrl.abort(), 3000)
      const res = await fetch(url, { signal: ctrl.signal }).catch(() => null)
      clearTimeout(t)
      if (!res?.ok) continue

      const data = await res.json().catch(() => null)
      if (!data) continue

      // Accept various response shapes
      const dataUrl: string | undefined =
        data.dataUrl ?? data.qr ?? data.qrCode ?? data.image ?? data.data
      if (!dataUrl?.startsWith('data:image')) continue

      // Deduplicate: only push if changed
      const hash = dataUrl.slice(-32)
      if (hash === lastCanvasQrHash) return true // already pushed this QR
      lastCanvasQrHash = hash

      const cfg = loadConfig()
      if (!cfg) return true

      const ctrl2 = new AbortController()
      const t2 = setTimeout(() => ctrl2.abort(), 5000)
      await fetch(`${cfg.backendUrl}/api/setup/qr-push`, {
        method: 'POST',
        signal: ctrl2.signal,
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Secret': cfg.webhookSecret,
          'X-Tenant-Id': cfg.tenantId,
        },
        body: JSON.stringify({ dataUrl }),
      }).catch(() => undefined)
      clearTimeout(t2)
      return true
    } catch { /* ignore */ }
  }
  return false
}

function initQrWatcher() {
  if (qrWatcherRunning) return
  qrWatcherRunning = true

  // Poll every 10s — check file paths AND canvas API
  const pollInterval = setInterval(async () => {
    // 1. Try openclaw canvas API first (native/VPS mode)
    const gotFromCanvas = await pollCanvasQr()
    if (gotFromCanvas) return

    // 2. Fallback: scan known file paths (Docker / openzca standalone)
    const CANDIDATES = [
      path.join(os.homedir(), 'qr.png'),
      path.join(os.homedir(), '.openclaw', 'qr.png'),
      path.join(os.homedir(), '.openclaw', 'hooks', 'qr.png'),
      '/root/qr.png',
      '/root/.openclaw/qr.png',
      '/root/.openclaw/hooks/qr.png',
      '/app/qr.png',
      ...(process.env.OPENCLAW_DIR ? [
        path.join(process.env.OPENCLAW_DIR, 'qr.png'),
      ] : []),
      // Windows paths
      ...(process.env.APPDATA ? [
        path.join(process.env.APPDATA, 'openclaw', 'qr.png'),
        path.join(process.env.APPDATA, 'ZaloPC', 'qr.png'),
      ] : []),
      ...(process.env.USERPROFILE ? [
        path.join(process.env.USERPROFILE, 'qr.png'),
        path.join(process.env.USERPROFILE, '.openclaw', 'qr.png'),
      ] : []),
    ]

    for (const qrPath of CANDIDATES) {
      try {
        if (!fs.existsSync(qrPath)) continue
        const stat = fs.statSync(qrPath)
        if (stat.mtimeMs !== lastQrMtime) {
          lastQrMtime = stat.mtimeMs
          await pushQrToBackend(qrPath)
          break
        }
      } catch { /* ignore */ }
    }
  }, 10_000)

  pollInterval.unref?.()
}

// ── Sync history: fetch recent messages from openzca and push to backend ──────

let syncRunning = false

/**
 * Detect Zalo SQLite database from local machine (PC App installation).
 * Returns the path to messages.db if found, null otherwise.
 *
 * Checks:
 * - Env override: ZALO_SQLITE_PATH
 * - Windows: %APPDATA%\ZaloPC\data\<uid>\messages.db
 * - Mac: ~/Library/Application Support/ZaloPC/data/<uid>/messages.db
 */
function detectZaloSqlite(): string | null {
  // Check env override first
  if (process.env.ZALO_SQLITE_PATH) {
    try {
      if (fs.existsSync(process.env.ZALO_SQLITE_PATH)) {
        return process.env.ZALO_SQLITE_PATH
      }
    } catch { /* ignore */ }
  }

  const home = os.homedir()

  // Build candidate base directories
  const baseDirs = [
    // Windows
    path.join(os.homedir(), 'AppData', 'Roaming', 'ZaloPC', 'data'),
    // Windows via APPDATA env
    ...(process.env.APPDATA ? [path.join(process.env.APPDATA, 'ZaloPC', 'data')] : []),
    // Mac
    path.join(home, 'Library', 'Application Support', 'ZaloPC', 'data'),
    // Linux (if ever supported)
    path.join(home, '.zalopc', 'data'),
  ]

  for (const baseDir of baseDirs) {
    try {
      if (!fs.existsSync(baseDir)) continue

      // Scan for UID subdirectories
      const entries = fs.readdirSync(baseDir, { withFileTypes: true })
      for (const entry of entries) {
        if (!entry.isDirectory()) continue
        const messagesDb = path.join(baseDir, entry.name, 'messages.db')
        if (fs.existsSync(messagesDb)) {
          return messagesDb
        }
      }
    } catch { /* ignore */ }
  }

  return null
}

async function runSyncIfNeeded() {
  if (syncRunning) return
  const cfg = loadConfig()
  if (!cfg) return

  try {
    // Detect if SQLite is available on same machine
    const hasSqlite = !!detectZaloSqlite()

    // Check if backend needs sync
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 15_000)
    let syncData: { needed: boolean; limit?: number; groups?: Array<{id: string; externalId: string; name: string}> }
    try {
      const syncUrl = `${cfg.backendUrl}/api/setup/sync-request${hasSqlite ? '?hasSqlite=1' : ''}`
      const res = await fetch(syncUrl, {
        signal: ctrl.signal,
        headers: {
          'X-Webhook-Secret': cfg.webhookSecret,
          'X-Tenant-Id': cfg.tenantId,
        },
      })
      syncData = await res.json() as typeof syncData
    } finally {
      clearTimeout(t)
    }

    if (!syncData.needed || !syncData.groups?.length || !syncData.limit) return

    syncRunning = true
    const { execSync: execSyncChild } = await import('child_process')
    const limit = syncData.limit

    // Scale timeout: 30s + 10s per 100 messages, max 5 min
    const timeoutMs = Math.min(5 * 60_000, 30_000 + Math.floor(limit / 100) * 10_000)
    const bufferSize = Math.max(50 * 1024 * 1024, Math.ceil(limit * 1.2 * 1024))

    for (const group of syncData.groups) {
      try {
        // Run openzca locally — works in both Docker container and native VPS
        const raw = execSyncChild(
          `openzca msg recent -g -n ${limit} --json ${group.externalId}`,
          { encoding: 'utf-8', timeout: timeoutMs, maxBuffer: bufferSize }
        )

        const parsed = JSON.parse(raw)
        const messages: any[] = Array.isArray(parsed) ? parsed : (parsed.messages ?? parsed.data ?? [])

        if (messages.length === 0) continue

        // Push in batches of 200 to avoid large payloads
        const BATCH = 200
        for (let i = 0; i < messages.length; i += BATCH) {
          const batch = messages.slice(i, i + BATCH)
          const pushCtrl = new AbortController()
          const pt = setTimeout(() => pushCtrl.abort(), 30_000)
          try {
            await fetch(`${cfg.backendUrl}/api/setup/sync-push`, {
              method: 'POST',
              signal: pushCtrl.signal,
              headers: {
                'Content-Type': 'application/json',
                'X-Webhook-Secret': cfg.webhookSecret,
                'X-Tenant-Id': cfg.tenantId,
              },
              body: JSON.stringify({ groupId: group.id, messages: batch }),
            }).catch(() => undefined)
          } finally {
            clearTimeout(pt)
          }
        }
      } catch { /* ignore individual group errors — openzca might not have this group */ }

      // Rate limit between groups to avoid overwhelming Zalo
      await new Promise(r => setTimeout(r, 600))
    }
  } catch { /* silently fail */ } finally {
    syncRunning = false
  }
}

function initSyncWatcher() {
  // First run: wait 60s after startup for OpenClaw to fully connect to Zalo
  const firstRun = setTimeout(() => runSyncIfNeeded(), 60_000)
  firstRun.unref?.()

  // Poll every 60s — lightweight when nothing to do (sync-request returns needed:false immediately).
  // Picks up reset-sync or first-time sync within 1 minute instead of waiting 6 hours.
  const interval = setInterval(() => runSyncIfNeeded(), 60_000)
  interval.unref?.()
}

let sendPolling = false

async function runPendingSends(cfg: Config) {
  if (sendPolling) return
  sendPolling = true
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 5000)
    const res = await fetch(`${cfg.backendUrl}/api/setup/pending-sends`, {
      signal: ctrl.signal,
      headers: { 'x-webhook-secret': cfg.webhookSecret, 'x-tenant-id': cfg.tenantId },
    }).catch(() => null)
    clearTimeout(t)
    if (!res?.ok) return
    const pending = await res.json() as Array<{ id: string; groupExternalId: string; text: string }>
    if (!pending.length) return

    const { execSync: execSyncSend } = await import('child_process')

    for (const item of pending) {
      let status: 'sent' | 'failed' = 'failed'
      try {
        const safe = item.text.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, ' ')
        execSyncSend(`openzca msg send ${item.groupExternalId} "${safe}"`, { timeout: 10_000 })
        status = 'sent'
      } catch { /* keep failed */ }

      await fetch(`${cfg.backendUrl}/api/setup/ack-send`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-webhook-secret': cfg.webhookSecret, 'x-tenant-id': cfg.tenantId },
        body: JSON.stringify({ id: item.id, status }),
      }).catch(() => undefined)
    }
  } catch { /* silently fail */ } finally {
    sendPolling = false
  }
}

function initSendPoller() {
  const interval = setInterval(async () => {
    const cfg = loadConfig()
    if (cfg) await runPendingSends(cfg)
  }, 10_000)
  interval.unref?.()
}

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

// Start watchers at module load — don't wait for first message
initQrWatcher()
initSyncWatcher()
initSendPoller()

export default handler
