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
  profile: process.env.PROFILE || 'default',
}

if (!cfg.backendUrl || !cfg.secret || !cfg.tenantId) {
  console.error('❌ Thiếu env vars: BACKEND_URL, WEBHOOK_SECRET, TENANT_ID')
  process.exit(1)
}

// Tìm openzca binary
function findOpenzcaBin() {
  if (process.env.OPENZCA_BIN && fs.existsSync(process.env.OPENZCA_BIN)) return process.env.OPENZCA_BIN
  for (const p of [
    path.join(os.homedir(), '.npm-global/bin/openzca'),
    '/usr/local/bin/openzca',
    '/usr/bin/openzca',
  ]) {
    if (fs.existsSync(p)) return p
  }
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

function startListener() {
  restartCount += 1
  console.log(`▶️  Spawn openzca listen (restart #${restartCount})`)

  const proc = spawn(OPENZCA, ['--profile', cfg.profile, 'listen', '--raw', '--keep-alive'], {
    stdio: ['ignore', 'pipe', 'inherit'],
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
      try {
        const safe = String(item.text).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, ' ')
        execSync(`"${OPENZCA}" --profile ${cfg.profile} msg send ${item.groupExternalId} "${safe}"`, { timeout: 10_000 })
        status = 'sent'
        console.log(`   ✉️  Sent ${item.id} → ${item.groupExternalId}`)
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
setInterval(pollPendingSends, 10_000).unref?.()

// Health ping mỗi 5 phút để dashboard biết listener đang sống
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

startListener()

process.on('SIGTERM', () => { console.log('🛑 SIGTERM — shutting down'); process.exit(0) })
process.on('SIGINT',  () => { console.log('🛑 SIGINT — shutting down');  process.exit(0) })
