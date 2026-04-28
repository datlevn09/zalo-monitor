#!/usr/bin/env node
/**
 * zalo-history-push.mjs
 *
 * Đẩy toàn bộ lịch sử Zalo (từ SQLite local) lên backend.
 * Chạy trên máy có Zalo PC App hoặc máy đã cài openzca.
 *
 * Usage:
 *   BACKEND_URL=https://... WEBHOOK_SECRET=... TENANT_ID=... node zalo-history-push.mjs
 *   node zalo-history-push.mjs --backend https://... --secret ... --tenant ... [--limit 9999]
 *
 * Developer: chạy script này trên máy nhân viên để import lịch sử lần đầu.
 */

import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'
import { execSync } from 'node:child_process'

// ─── Config Loading ────────────────────────────────────────────────────────

let config = {
  backendUrl: process.env.BACKEND_URL || '',
  webhookSecret: process.env.WEBHOOK_SECRET || '',
  tenantId: process.env.TENANT_ID || '',
  zaloSqlitePath: process.env.ZALO_SQLITE_PATH || '',
  limit: 9999,
}

// Parse command-line arguments
const args = process.argv.slice(2)
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--backend') config.backendUrl = args[++i]
  else if (args[i] === '--secret') config.webhookSecret = args[++i]
  else if (args[i] === '--tenant') config.tenantId = args[++i]
  else if (args[i] === '--sqlite') config.zaloSqlitePath = args[++i]
  else if (args[i] === '--limit') config.limit = parseInt(args[++i], 10)
}

if (!config.backendUrl || !config.webhookSecret || !config.tenantId) {
  console.error('❌ Missing required config:')
  console.error('   BACKEND_URL, WEBHOOK_SECRET, TENANT_ID')
  console.error('')
  console.error('Usage:')
  console.error('   BACKEND_URL=https://... WEBHOOK_SECRET=... TENANT_ID=... node zalo-history-push.mjs')
  console.error('   node zalo-history-push.mjs --backend ... --secret ... --tenant ... [--limit 9999]')
  process.exit(1)
}

// ─── Helper Functions ──────────────────────────────────────────────────────

function log(msg) {
  console.log(msg)
}

function logError(msg) {
  console.error(`❌ ${msg}`)
}

function logSuccess(msg) {
  console.log(`✅ ${msg}`)
}

function logInfo(msg) {
  console.log(`ℹ️  ${msg}`)
}

/**
 * Detect Zalo SQLite on this machine.
 */
function detectZaloSqlite() {
  if (config.zaloSqlitePath && fs.existsSync(config.zaloSqlitePath)) {
    return config.zaloSqlitePath
  }

  const home = os.homedir()
  // Hỗ trợ cả Zalo PC App đời cũ (ZaloPC) và đời mới (ZaloData)
  // Đời mới: ~/Library/Application Support/ZaloData/Database/_production/<uid>/MsgInfo.db (Mac)
  //          %APPDATA%\ZaloData\Database\_production\<uid>\MsgInfo.db (Windows)
  // Đời cũ:  ~/Library/Application Support/ZaloPC/data/<uid>/messages.db
  const candidates = [
    // Đời mới ZaloData (Mac/Windows)
    {
      base: path.join(home, 'Library', 'Application Support', 'ZaloData', 'Database', '_production'),
      file: 'MsgInfo.db',
    },
    {
      base: path.join(home, 'AppData', 'Roaming', 'ZaloData', 'Database', '_production'),
      file: 'MsgInfo.db',
    },
    {
      base: path.join(home, 'AppData', 'Local', 'ZaloData', 'Database', '_production'),
      file: 'MsgInfo.db',
    },
    // Đời cũ ZaloPC
    {
      base: path.join(home, 'AppData', 'Roaming', 'ZaloPC', 'data'),
      file: 'messages.db',
    },
    {
      base: path.join(home, 'Library', 'Application Support', 'ZaloPC', 'data'),
      file: 'messages.db',
    },
    {
      base: path.join(home, '.zalopc', 'data'),
      file: 'messages.db',
    },
  ]

  for (const { base, file } of candidates) {
    try {
      if (!fs.existsSync(base)) continue
      const entries = fs.readdirSync(base, { withFileTypes: true })
      for (const entry of entries) {
        if (!entry.isDirectory()) continue
        const dbPath = path.join(base, entry.name, file)
        if (fs.existsSync(dbPath)) {
          return dbPath
        }
      }
    } catch { /* ignore */ }
  }

  return null
}

/**
 * Resolve openzca profile to use:
 *   1) env PROFILE nếu set + non-empty
 *   2) auto-detect: chọn profile có loggedIn=true (ưu tiên default=true)
 *   3) fallback 'default'
 */
let _resolvedProfile = null
function resolveProfile() {
  if (_resolvedProfile) return _resolvedProfile
  if (process.env.PROFILE) { _resolvedProfile = process.env.PROFILE; return _resolvedProfile }
  try {
    const raw = execSync('openzca account list --json', { encoding: 'utf-8', timeout: 10_000 })
    const accounts = JSON.parse(raw)
    if (Array.isArray(accounts)) {
      // Ưu tiên: loggedIn=true + default=true → chỉ loggedIn → default → first
      const loggedDefault = accounts.find(a => a.loggedIn && a.default)
      const logged = accounts.find(a => a.loggedIn)
      const def = accounts.find(a => a.default)
      const picked = loggedDefault || logged || def || accounts[0]
      if (picked?.name) { _resolvedProfile = picked.name; return _resolvedProfile }
    }
  } catch { /* ignore — fallback below */ }
  _resolvedProfile = 'default'
  return _resolvedProfile
}

/**
 * Try to use openzca CLI to fetch groups.
 */
function getGroupsViaOpenzca() {
  try {
    const profile = resolveProfile()
    const cmd = `openzca --profile ${profile} group list --json`
    const raw = execSync(cmd, { encoding: 'utf-8', timeout: 30_000 })
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) return parsed
    if (parsed.groups && Array.isArray(parsed.groups)) return parsed.groups
    if (parsed.data && Array.isArray(parsed.data)) return parsed.data
  } catch {
    return null
  }
  return null
}

/**
 * Try to use openzca CLI to fetch recent messages for a group.
 */
function getMessagesViaOpenzca(groupExternalId) {
  try {
    const profile = resolveProfile()
    const cmd = `openzca --profile ${profile} msg recent -g -n ${config.limit} --json ${groupExternalId}`
    const raw = execSync(cmd, { encoding: 'utf-8', timeout: 60_000, maxBuffer: 50 * 1024 * 1024 })
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) return parsed
    if (parsed.messages && Array.isArray(parsed.messages)) return parsed.messages
    if (parsed.data && Array.isArray(parsed.data)) return parsed.data
  } catch {
    return null
  }
  return null
}

/**
 * Fetch sync-request to get DB group IDs and metadata.
 */
async function getSyncRequest() {
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 30_000)
    const res = await fetch(`${config.backendUrl}/api/setup/sync-request?forceFullSync=1`, {
      signal: ctrl.signal,
      headers: {
        'X-Webhook-Secret': config.webhookSecret,
        'X-Tenant-Id': config.tenantId,
      },
    })
    clearTimeout(t)
    if (!res.ok) return null
    return await res.json()
  } catch { /* ignore */ }
  return null
}

/**
 * Query SQLite and return messages for a specific group.
 * Uses better-sqlite3 if available, otherwise sqlite3.
 */
async function getMessagesViaSqlite(dbPath, externalId) {
  let db = null
  try {
    // Try better-sqlite3 (synchronous, faster)
    try {
      const { default: Database } = await import('better-sqlite3')
      db = new Database(dbPath)
      const rows = db.prepare(
        'SELECT msgId, uidFrom, dName, message, ts, msgType FROM MESSAGES WHERE toUid = ? ORDER BY ts DESC LIMIT ?'
      ).all(externalId, config.limit)
      db.close()
      return rows.map(row => ({
        msgId: row.msgId,
        senderId: row.uidFrom,
        senderName: row.dName,
        content: row.message,
        timestamp: row.ts,
        msgType: row.msgType,
      }))
    } catch (e1) {
      // Fallback to sqlite3 (callback-based)
      let sqlite3
      try {
        sqlite3 = (await import('sqlite3')).default
      } catch {
        sqlite3 = await import('sqlite3')
      }
      return new Promise((resolve) => {
        db = new sqlite3.Database(dbPath)
        const results = []
        db.all(
          'SELECT msgId, uidFrom, dName, message, ts, msgType FROM MESSAGES WHERE toUid = ? ORDER BY ts DESC LIMIT ?',
          [externalId, config.limit],
          (err, rows) => {
            if (err) resolve([])
            else resolve((rows || []).map(row => ({
              msgId: row.msgId,
              senderId: row.uidFrom,
              senderName: row.dName,
              content: row.message,
              timestamp: row.ts,
              msgType: row.msgType,
            })))
            if (db) db.close()
          }
        )
      })
    }
  } catch (err) {
    if (db && db.close) db.close()
    logError(`Failed to load sqlite3 or better-sqlite3. Install one with:`)
    logError(`  npm install -g better-sqlite3  # OR`)
    logError(`  npm install -g sqlite3`)
    logError(`Error: ${err.message}`)
    return null
  }
}

/**
 * Push messages batch to backend sync-push endpoint.
 */
async function pushMessagesToBackend(groupId, messages) {
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 60_000)
    const res = await fetch(`${config.backendUrl}/api/setup/sync-push`, {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Secret': config.webhookSecret,
        'X-Tenant-Id': config.tenantId,
      },
      body: JSON.stringify({ groupId, messages }),
    })
    clearTimeout(t)
    if (!res.ok) {
      logError(`Push failed: HTTP ${res.status}`)
      return 0
    }
    const result = await res.json()
    return result.imported || 0
  } catch (err) {
    logError(`Push error: ${err.message}`)
    return 0
  }
}

/**
 * Sleep for ms milliseconds.
 */
function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}

// ─── Main Flow ────────────────────────────────────────────────────────────

async function main() {
  console.log('')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('  📦 Zalo History Push (SQLite Import)')
  console.log(`  Backend: ${config.backendUrl}`)
  console.log(`  Tenant:  ${config.tenantId}`)
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('')

  // Step 1: Fetch group list from backend
  logInfo('Fetching group list from backend...')
  const syncRequest = await getSyncRequest()
  if (!syncRequest) {
    logError('Failed to connect to backend (network/auth error)')
    process.exit(1)
  }
  if (!syncRequest.groups || syncRequest.groups.length === 0) {
    console.log('')
    console.log('  ⚠️  Chưa có nhóm Zalo nào trong dashboard.')
    console.log('  Hệ thống sẽ tự tạo nhóm khi có tin nhắn đầu tiên đến.')
    console.log('  → Đợi 1 tin nhắn bất kỳ vào nhóm Zalo, sau đó chạy lại lệnh này.')
    console.log('')
    process.exit(0)
  }
  const groups = syncRequest.groups
  logSuccess(`Found ${groups.length} groups to sync`)
  console.log('')

  let totalMessages = 0
  let totalGroups = 0
  let openzraAvailable = false

  // Try openzca first
  logInfo('Checking for openzca CLI...')
  try {
    execSync('openzca --version', { stdio: 'ignore' })
    openzraAvailable = true
    logSuccess('openzca CLI detected')
  } catch {
    logInfo('openzca CLI not found — will use SQLite fallback')
  }
  console.log('')

  // If openzca available, use it; otherwise use SQLite
  if (openzraAvailable) {
    logInfo('Syncing via openzca CLI...')
    console.log('')

    for (const group of groups) {
      try {
        const messages = getMessagesViaOpenzca(group.externalId)
        if (!messages || messages.length === 0) {
          logInfo(`Group "${group.name}": 0 messages`)
          continue
        }

        // Push in batches of 200
        let imported = 0
        const BATCH = 200
        for (let i = 0; i < messages.length; i += BATCH) {
          const batch = messages.slice(i, i + BATCH)
          const count = await pushMessagesToBackend(group.id, batch)
          imported += count
        }

        logSuccess(`Group "${group.name}": ${imported} messages imported`)
        totalMessages += imported
        totalGroups++
      } catch (err) {
        logError(`Group "${group.name}": ${err.message}`)
      }

      // Rate limit
      await sleep(300)
    }
  } else {
    // SQLite fallback
    const sqlitePath = detectZaloSqlite()
    if (!sqlitePath) {
      logError('No Zalo SQLite found at known paths')
      logError(`  Windows: %APPDATA%\\ZaloData\\Database\\_production\\<uid>\\MsgInfo.db`)
      logError(`             hoặc %APPDATA%\\ZaloPC\\data\\<uid>\\messages.db (đời cũ)`)
      logError(`  Mac: ~/Library/Application Support/ZaloData/Database/_production/<uid>/MsgInfo.db`)
      logError(`        hoặc ~/Library/Application Support/ZaloPC/data/<uid>/messages.db (đời cũ)`)
      logError('')
      logError('Set ZALO_SQLITE_PATH env var to use custom path:')
      logError('  ZALO_SQLITE_PATH=/path/to/messages.db node zalo-history-push.mjs')
      process.exit(1)
    }

    logSuccess(`Found SQLite: ${sqlitePath}`)
    console.log('')
    logInfo('Syncing via SQLite...')
    console.log('')

    for (const group of groups) {
      try {
        const messages = await getMessagesViaSqlite(sqlitePath, group.externalId)
        if (!messages || messages.length === 0) {
          logInfo(`Group "${group.name}": 0 messages`)
          continue
        }

        // Push in batches of 200
        let imported = 0
        const BATCH = 200
        for (let i = 0; i < messages.length; i += BATCH) {
          const batch = messages.slice(i, i + BATCH)
          const count = await pushMessagesToBackend(group.id, batch)
          imported += count
        }

        logSuccess(`Group "${group.name}": ${imported} messages imported`)
        totalMessages += imported
        totalGroups++
      } catch (err) {
        logError(`Group "${group.name}": ${err.message}`)
      }

      // Rate limit
      await sleep(300)
    }
  }

  console.log('')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  logSuccess(`Complete: ${totalGroups} groups, ${totalMessages} messages imported`)
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('')
}

main().catch(err => {
  logError(`Fatal: ${err.message}`)
  process.exit(1)
})
