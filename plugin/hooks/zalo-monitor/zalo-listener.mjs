#!/usr/bin/env node
/**
 * zalo-listener.mjs — Standalone Zalo monitor (KHÔNG dùng OpenClaw)
 *
 * Spawn `openzca listen --raw` để stream message từ Zalo, POST về backend
 * với header auth đúng. Tự động restart khi disconnect.
 *
 * Đây là ARCHITECTURE MỚI thay thế OpenClaw + hook handler.ts.
 * Lý do: OpenClaw có embedded agent tự động reply (spam) — không thể disable
 * mà vẫn keep monitoring. Listener trực tiếp openzca chỉ ĐỌC, không reply.
 *
 * Env vars:
 *   BACKEND_URL    - https://api.datthongdong.com
 *   WEBHOOK_SECRET - Per-tenant or per-user secret
 *   TENANT_ID      - cuid của tenant
 *   OPENZCA_BIN    - (optional) Đường dẫn openzca CLI (mặc định ~/.npm-global/bin/openzca hoặc 'openzca')
 *   PROFILE        - (optional) openzca profile name (mặc định 'default')
 *
 * Usage (systemd / manual):
 *   BACKEND_URL=... WEBHOOK_SECRET=... TENANT_ID=... node zalo-listener.mjs
 */

import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const cfg = {
  backendUrl: (process.env.BACKEND_URL || '').replace(/\/$/, ''),
  secret: process.env.WEBHOOK_SECRET || '',
  tenantId: process.env.TENANT_ID || '',
  profile: process.env.PROFILE || 'zalo-monitor',
}

if (!cfg.backendUrl || !cfg.secret || !cfg.tenantId) {
  console.error('❌ Thiếu env vars: BACKEND_URL, WEBHOOK_SECRET, TENANT_ID')
  process.exit(1)
}

// Tìm openzca binary — KHÁC giữa Windows (openzca.cmd) và POSIX (openzca)
function findOpenzcaBin() {
  if (process.env.OPENZCA_BIN && fs.existsSync(process.env.OPENZCA_BIN)) return process.env.OPENZCA_BIN

  const isWin = process.platform === 'win32'
  const candidates = []

  if (isWin) {
    // Windows: ưu tiên .cmd (raw 'openzca' file là PS wrapper, spawn ENOENT)
    const appdata = process.env.APPDATA
    if (appdata) {
      candidates.push(path.join(appdata, 'npm', 'openzca.cmd'))
      candidates.push(path.join(appdata, 'npm', 'openzca.exe'))
    }
    // PATH-based fallback (resolve qua execSync npm prefix)
    try {
      const { execSync } = require('node:child_process')
      const prefix = execSync('npm config get prefix', { encoding: 'utf-8', timeout: 5000 }).trim()
      if (prefix) {
        candidates.push(path.join(prefix, 'openzca.cmd'))
        candidates.push(path.join(prefix, 'openzca.exe'))
      }
    } catch { /* ignore */ }
  } else {
    candidates.push(path.join(os.homedir(), '.npm-global/bin/openzca'))
    candidates.push('/usr/local/bin/openzca')
    candidates.push('/usr/bin/openzca')
  }

  for (const p of candidates) {
    if (fs.existsSync(p)) return p
  }
  // Fallback: dùng raw name + shell:true cho spawn Windows tự resolve PATHEXT
  return 'openzca'
}

const OPENZCA = findOpenzcaBin()
const WEBHOOK_URL = `${cfg.backendUrl}/webhook/zalo/`

console.log(`📡 Zalo Listener — tenant=${cfg.tenantId}`)
console.log(`   openzca: ${OPENZCA}`)
console.log(`   webhook: ${WEBHOOK_URL}`)

let restartCount = 0

async function postMessage(payload) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), 10_000)
  try {
    const res = await fetch(WEBHOOK_URL, {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        'content-type': 'application/json',
        'x-webhook-secret': cfg.secret,
        'x-tenant-id': cfg.tenantId,
      },
      body: JSON.stringify(payload),
    })
    if (!res.ok) {
      console.error(`   ⚠️  webhook ${res.status}`)
    }
  } catch (err) {
    console.error(`   ⚠️  webhook fail: ${err.message}`)
  } finally {
    clearTimeout(t)
  }
}

// Windows .cmd cần shell:true để Node spawn được (batch file).
// .cmd path có dấu cách → cần wrap trong quote khi shell:true.
const IS_WIN = process.platform === 'win32'
const SPAWN_OPTS_BASE = IS_WIN ? { shell: true, windowsHide: true } : {}

function quoteWin(p) {
  return IS_WIN && p.includes(' ') ? `"${p}"` : p
}

function startListener() {
  restartCount += 1
  console.log(`▶️  Spawn openzca listen (restart #${restartCount})`)

  const proc = spawn(quoteWin(OPENZCA), ['--profile', cfg.profile, 'listen', '--raw', '--keep-alive'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    ...SPAWN_OPTS_BASE,
  })

  // Detect "already owns profile" → another instance đang chạy. Exit gracefully,
  // không restart loop (sẽ thoát process — Scheduled Task tự re-trigger sau).
  let stderrBuf = ''
  proc.stderr?.on('data', (chunk) => {
    const text = chunk.toString()
    stderrBuf += text
    process.stderr.write(text)
    if (stderrBuf.includes('already owns profile')) {
      console.error('💥 Phát hiện listener khác đang chạy cùng profile — exit để tránh restart loop')
      restartCount = 999  // disable restart
      try { proc.kill() } catch {}
      process.exit(2)
    }
  })

  let buf = ''
  proc.stdout.on('data', (chunk) => {
    buf += chunk.toString()
    let i
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim()
      buf = buf.slice(i + 1)
      if (!line) continue
      try {
        const msg = JSON.parse(line)
        // Lifecycle events from --supervised không phải message — skip
        if (msg.type === 'lifecycle' || msg.event) continue
        postMessage(msg).catch(() => undefined)
      } catch (err) {
        // Không phải JSON valid — skip
      }
    }
  })

  proc.on('exit', (code, signal) => {
    console.error(`❌ openzca listen exited code=${code} signal=${signal}`)
    if (restartCount < 100) {
      const delay = Math.min(60_000, 2_000 * Math.pow(1.5, Math.min(restartCount, 10)))
      console.log(`   ⏳ Restart sau ${Math.round(delay/1000)}s...`)
      setTimeout(startListener, delay)
    } else {
      console.error('💥 Restart count quá nhiều — giving up')
      process.exit(1)
    }
  })

  proc.on('error', (err) => {
    console.error(`❌ Spawn error: ${err.message}`)
  })
}

// Send poller: chỉ chạy khi user chủ động bấm "Gửi" trên dashboard
// (Backend tạo entry trong send_queue → poller đọc và exec `openzca msg send`)
// Đây là cách DUY NHẤT để gửi tin — không có agent auto-reply
import { execSync } from 'node:child_process'
let sendPolling = false
async function pollPendingSends() {
  if (sendPolling) return
  sendPolling = true
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 5_000)
    const res = await fetch(`${cfg.backendUrl}/api/setup/pending-sends`, {
      signal: ctrl.signal,
      headers: { 'x-webhook-secret': cfg.secret, 'x-tenant-id': cfg.tenantId },
    }).catch(() => null)
    clearTimeout(t)
    if (!res?.ok) return
    const pending = await res.json()
    if (!Array.isArray(pending) || !pending.length) return

    for (const item of pending) {
      let status = 'failed'
      const isGroup = !!item.isGroup
      const groupFlag = isGroup ? '-g' : ''
      // Strip 'group:' prefix — openzca CLI expect raw numeric ID
      const tid = String(item.groupExternalId).replace(/^group:/, '')
      try {
        if (item.mediaUrl) {
          // Gửi ảnh/video/file qua URL
          const cmd = item.mediaType === 'image' ? 'image'
                    : item.mediaType === 'video' ? 'video'
                    : 'file'
          const safeUrl = String(item.mediaUrl).replace(/"/g, '\\"')
          // Nếu có caption text, openzca msg image hỗ trợ --caption
          const captionFlag = item.text ? `--caption "${String(item.text).replace(/"/g, '\\"')}"` : ''
          execSync(`"${OPENZCA}" --profile ${cfg.profile} msg ${cmd} ${groupFlag} ${captionFlag} ${tid} "${safeUrl}"`,
            { timeout: 30_000, shell: IS_WIN ? 'cmd.exe' : undefined })
          console.log(`   📎 Sent ${item.mediaType} ${item.id} → ${tid}`)
        } else {
          const safe = String(item.text).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, ' ')
          execSync(`"${OPENZCA}" --profile ${cfg.profile} msg send ${groupFlag} --raw ${tid} "${safe}"`,
            { timeout: 10_000, shell: IS_WIN ? 'cmd.exe' : undefined })
          console.log(`   ✉️  Sent ${item.id} → ${tid}`)
        }
        status = 'sent'
      } catch (err) {
        console.error(`   ❌ Send fail ${item.id}: ${err.message}`)
      }
      await fetch(`${cfg.backendUrl}/api/setup/ack-send`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-webhook-secret': cfg.secret, 'x-tenant-id': cfg.tenantId },
        body: JSON.stringify({ id: item.id, status }),
      }).catch(() => undefined)
    }
  } catch { /* silent */ } finally {
    sendPolling = false
  }
}
setInterval(pollPendingSends, 1_000).unref?.()

// Pending actions poller: dashboard "Kết nối lại" → exec openzca login → push QR về backend
let actionPolling = false
async function pollPendingActions() {
  if (actionPolling) return
  actionPolling = true
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 5_000)
    const res = await fetch(`${cfg.backendUrl}/api/setup/pending-actions`, {
      signal: ctrl.signal,
      headers: { 'x-webhook-secret': cfg.secret, 'x-tenant-id': cfg.tenantId },
    }).catch(() => null)
    clearTimeout(t)
    if (!res?.ok) return
    const data = await res.json()
    const actions = data?.actions || []
    if (!actions.length) return

    const { execFile } = await import('node:child_process')

    for (const action of actions) {
      if (action === 'login_zalo') {
        console.log(`▶️ Action 'login_zalo' — exec openzca auth login --qr-base64`)
        execFile(quoteWin(OPENZCA), ['--profile', cfg.profile, 'auth', 'login', '--qr-base64'],
          { timeout: 90_000, env: { ...process.env, OPENZCA_QR_OPEN: '0' }, ...SPAWN_OPTS_BASE },
          async (err, stdout) => {
            if (err) { console.error(`❌ openzca login: ${err.message}`); return }
            const m = (stdout || '').match(/data:image\/[a-z]+;base64,[A-Za-z0-9+/=]+/)
            if (!m) { console.error('❌ Không parse được QR data URL từ stdout'); return }
            await fetch(`${cfg.backendUrl}/api/setup/qr-push`, {
              method: 'POST',
              headers: {
                'content-type': 'application/json',
                'x-webhook-secret': cfg.secret,
                'x-tenant-id': cfg.tenantId,
              },
              body: JSON.stringify({ dataUrl: m[0] }),
            }).catch(() => undefined)
            console.log('✅ Đã push QR lên backend')
          }
        )
      } else if (action === 'sync_history') {
        console.log(`▶️ Action 'sync_history' — chạy zalo-history-push.mjs`)
        const { execSync } = await import('node:child_process')
        const path = await import('node:path')
        const fs = await import('node:fs')
        const tmpDir = fs.mkdtempSync('/tmp/zsync-')
        try {
          // Tải zalo-history-push.mjs về tmpDir + cài better-sqlite3 local
          execSync(`curl -fsSL "${cfg.backendUrl}/api/setup/hook-files/zalo-history-push.mjs" -o ${path.join(tmpDir, 'zalo-history-push.mjs')}`, { timeout: 30_000 })
          execSync('npm init -y && npm install better-sqlite3 --no-audit --no-fund', { cwd: tmpDir, timeout: 120_000, stdio: 'ignore' })
          execFile('node', [path.join(tmpDir, 'zalo-history-push.mjs')], {
            cwd: tmpDir, timeout: 600_000, maxBuffer: 100 * 1024 * 1024,
            env: {
              ...process.env,
              BACKEND_URL: cfg.backendUrl,
              WEBHOOK_SECRET: cfg.secret,
              TENANT_ID: cfg.tenantId,
              PROFILE: cfg.profile,
            },
          }, async (err, stdout, stderr) => {
            if (err) console.error(`❌ sync_history: ${err.message}\n${stderr}`)
            else console.log(`✅ sync_history done\n${(stdout || '').slice(-500)}`)
            // Notify backend (best-effort)
            await fetch(`${cfg.backendUrl}/api/setup/sync-history-done`, {
              method: 'POST',
              headers: { 'content-type': 'application/json', 'x-webhook-secret': cfg.secret, 'x-tenant-id': cfg.tenantId },
              body: JSON.stringify({ ok: !err, output: (stdout || '').slice(-2000) }),
            }).catch(() => undefined)
            // Cleanup
            try { fs.rmSync(tmpDir, { recursive: true, force: true }) } catch {}
          })
        } catch (e) {
          console.error(`❌ sync_history setup: ${e.message}`)
        }
      }
    }
  } catch { /* silent */ } finally {
    actionPolling = false
  }
}
setInterval(pollPendingActions, 1_000).unref?.()

// Check openzca auth status để biết Zalo đã login chưa (mỗi 30s)
async function zaloStatusCheck() {
  try {
    const { execSync } = await import('node:child_process')
    const out = execSync(`"${OPENZCA}" --profile ${cfg.profile} auth status 2>&1`,
      { timeout: 5_000, encoding: 'utf-8', shell: IS_WIN ? 'cmd.exe' : undefined })
    const isLoggedIn = /loggedIn:\s*true|displayName/i.test(out)
    await fetch(`${cfg.backendUrl}/api/setup/zalo-status`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-webhook-secret': cfg.secret,
        'x-tenant-id': cfg.tenantId,
      },
      body: JSON.stringify({ loggedIn: isLoggedIn, at: Date.now() }),
    }).catch(() => undefined)
  } catch {
    // openzca status fail = Zalo chưa login
    await fetch(`${cfg.backendUrl}/api/setup/zalo-status`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-webhook-secret': cfg.secret,
        'x-tenant-id': cfg.tenantId,
      },
      body: JSON.stringify({ loggedIn: false, at: Date.now() }),
    }).catch(() => undefined)
  }
}
// Health ping mỗi 5 phút (listener service alive — KHÔNG đảm bảo Zalo logged in)
async function healthPing() {
  try {
    await fetch(`${cfg.backendUrl}/api/setup/listener-ping`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-webhook-secret': cfg.secret,
        'x-tenant-id': cfg.tenantId,
      },
      body: JSON.stringify({ at: Date.now() }),
    })
  } catch { /* silent */ }
}

setInterval(healthPing, 5 * 60_000).unref?.()
healthPing()
// Check Zalo login status mỗi 30s
setInterval(zaloStatusCheck, 30_000).unref?.()
zaloStatusCheck()

// Sync danh sách group thật từ openzca → backend (mỗi 10 phút)
// Backend dùng để: rename DB record + flip isDirect=false cho records mistakenly DM
async function syncGroupList() {
  try {
    const { execSync } = await import('node:child_process')
    const raw = execSync(`"${OPENZCA}" --profile ${cfg.profile} group list --json`, {
      timeout: 30_000, encoding: 'utf-8', maxBuffer: 50 * 1024 * 1024, shell: IS_WIN ? 'cmd.exe' : undefined,
    })
    const list = JSON.parse(raw)
    if (!Array.isArray(list) || list.length === 0) return
    const payload = list.map(g => ({ groupId: String(g.groupId), name: String(g.name || '').slice(0, 200) }))
    await fetch(`${cfg.backendUrl}/api/setup/sync-zalo-groups`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-webhook-secret': cfg.secret,
        'x-tenant-id': cfg.tenantId,
      },
      body: JSON.stringify({ groups: payload }),
    }).catch(() => undefined)
  } catch { /* silent */ }
}
setInterval(syncGroupList, 10 * 60_000).unref?.()
// Lần đầu sau 60s (đợi listener login xong)
setTimeout(syncGroupList, 60_000)

startListener()

process.on('SIGTERM', () => { console.log('🛑 SIGTERM — shutting down'); process.exit(0) })
process.on('SIGINT',  () => { console.log('🛑 SIGINT — shutting down');  process.exit(0) })
