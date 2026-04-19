/**
 * Auto-sinh các secret BẮT BUỘC (nếu chưa có) và append vào backend/.env.
 * Chạy 1 lần sau khi deploy: `npm run init-secrets`
 *
 * Sinh: JWT_SECRET, WEBHOOK_SECRET, SUPER_ADMIN_TOKEN, POSTGRES_PASSWORD (nếu rỗng).
 * Không ghi đè giá trị đã có.
 */

import { randomBytes } from 'node:crypto'
import { readFileSync, writeFileSync, existsSync, copyFileSync } from 'node:fs'
import { resolve } from 'node:path'

const ENV_PATH = resolve(process.cwd(), '.env')
const ENV_EXAMPLE_PATH = resolve(process.cwd(), '.env.example')

const REQUIRED = [
  { key: 'JWT_SECRET',        bytes: 32, desc: 'Ký JWT login' },
  { key: 'WEBHOOK_SECRET',    bytes: 32, desc: 'Fallback webhook secret' },
  { key: 'SUPER_ADMIN_TOKEN', bytes: 32, desc: 'Login /super-admin' },
  { key: 'POSTGRES_PASSWORD', bytes: 16, desc: 'DB password (chỉ tạo nếu empty)' },
]

function gen(bytes: number): string {
  return randomBytes(bytes).toString('hex')
}

function readEnv(): Record<string, string> {
  if (!existsSync(ENV_PATH)) {
    if (existsSync(ENV_EXAMPLE_PATH)) {
      console.log(`📋 .env chưa có — copy từ .env.example`)
      copyFileSync(ENV_EXAMPLE_PATH, ENV_PATH)
    } else {
      console.log(`📋 Tạo .env trống`)
      writeFileSync(ENV_PATH, '')
    }
  }
  const raw = readFileSync(ENV_PATH, 'utf-8')
  const map: Record<string, string> = {}
  for (const line of raw.split('\n')) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/)
    if (m) map[m[1]] = m[2].trim()
  }
  return map
}

function appendEnv(key: string, value: string) {
  const raw = readFileSync(ENV_PATH, 'utf-8')

  // Nếu key đã có (dù value rỗng) → thay thế inline
  const re = new RegExp(`^${key}\\s*=.*$`, 'gm')
  if (re.test(raw)) {
    const updated = raw.replace(re, `${key}=${value}`)
    writeFileSync(ENV_PATH, updated)
  } else {
    // Append cuối file
    const suffix = raw.endsWith('\n') ? '' : '\n'
    writeFileSync(ENV_PATH, `${raw}${suffix}${key}=${value}\n`)
  }
}

function main() {
  const env = readEnv()
  const generated: { key: string; value: string; desc: string }[] = []
  const existed: string[] = []

  for (const r of REQUIRED) {
    const current = (env[r.key] ?? '').trim()
    const isPlaceholder = current === '' ||
      current === 'changeme' ||
      current.startsWith('change-this') ||
      current === 'CHANGE_ME'

    if (isPlaceholder) {
      const value = gen(r.bytes)
      appendEnv(r.key, value)
      generated.push({ key: r.key, value, desc: r.desc })
    } else {
      existed.push(r.key)
    }
  }

  console.log('\n═══ Zalo Monitor — Secrets Init ═══\n')

  if (generated.length > 0) {
    console.log('✅ Đã sinh secrets mới:\n')
    for (const g of generated) {
      console.log(`  ${g.key.padEnd(22)} — ${g.desc}`)
      console.log(`  ${''.padEnd(22)}   ${g.value}\n`)
    }
  }

  if (existed.length > 0) {
    console.log(`⏭  Giữ nguyên (đã có giá trị): ${existed.join(', ')}\n`)
  }

  const adminToken = generated.find(g => g.key === 'SUPER_ADMIN_TOKEN')
  if (adminToken) {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('🛡  SUPER ADMIN TOKEN — CẦN LƯU VÀO PASSWORD MANAGER NGAY:')
    console.log(`\n    ${adminToken.value}\n`)
    console.log('   Dùng để login /super-admin. KHÔNG có cách khôi phục nếu quên.')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')
  }

  console.log(`📁 File: ${ENV_PATH}`)
  console.log('👉 Bước tiếp: set thủ công các biến optional (SMTP, Google, ANTHROPIC_API_KEY) rồi `npm run dev`\n')
}

main()
