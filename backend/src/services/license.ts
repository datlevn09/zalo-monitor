import { db } from './db.js'

const LICENSE_CACHE = new Map<string, { valid: boolean; expiresAt: number }>()
const CACHE_TTL = 24 * 60 * 60 * 1000 // 24 hours

const GRACE_PERIOD_MS = 72 * 60 * 60 * 1000 // 72 hours
const LAST_STATE_KEY = 'zm:license:lastState'
const LAST_STATE_TIME_KEY = 'zm:license:lastStateTime'

export type LicenseMode = 'saas' | 'self-hosted'

// Detect mode: nếu có LICENSE_KEY env → self-hosted, không có → SaaS (NAS của chủ)
export function getLicenseMode(): LicenseMode {
  return process.env.LICENSE_KEY ? 'self-hosted' : 'saas'
}

// Validate license key — gọi khi startup + mỗi 24h
export async function validateLicense(): Promise<{
  valid: boolean
  message: string
  plan: string
}> {
  const mode = getLicenseMode()
  if (mode === 'saas') return { valid: true, message: 'SaaS mode', plan: 'saas' }

  const key = process.env.LICENSE_KEY!
  const cached = LICENSE_CACHE.get(key)
  if (cached && Date.now() < cached.expiresAt) {
    return {
      valid: cached.valid,
      message: cached.valid ? 'License valid (cached)' : 'License invalid',
      plan: 'self-hosted',
    }
  }

  try {
    // Call remote license validation endpoint
    const REMOTE_LICENSE_URL = process.env.LICENSE_VALIDATE_URL ?? 'https://api.datthongdong.com/api/license/validate'
    const res = await fetch(`${REMOTE_LICENSE_URL}?key=${encodeURIComponent(key)}`, {
      signal: AbortSignal.timeout(5000),
    })
    const data = await res.json() as any

    // Store last known good state
    if (data.valid) {
      storeLastValidState(true, data.plan ?? 'unknown')
    }

    const plan = data.plan ?? 'unknown'
    LICENSE_CACHE.set(key, { valid: data.valid, expiresAt: Date.now() + CACHE_TTL })

    return {
      valid: data.valid,
      message: data.valid ? 'License valid' : `License không hợp lệ: ${data.reason ?? 'unknown'}`,
      plan,
    }
  } catch (err) {
    // Network error: check grace period with last known good state
    const { valid: lastValid, plan: lastPlan, timestamp: lastTs } = getLastValidState()

    if (lastValid && lastTs && Date.now() - lastTs < GRACE_PERIOD_MS) {
      // Still in grace period, allow with last known state
      console.warn(`⚠️  License validation failed (offline), using last known state (valid for ${Math.round((GRACE_PERIOD_MS - (Date.now() - lastTs)) / 60000)} more minutes)`)
      return {
        valid: true,
        message: `License valid (offline grace period, expires at ${new Date(lastTs + GRACE_PERIOD_MS).toISOString()})`,
        plan: lastPlan,
      }
    }

    // Grace period expired or no last known state
    console.error(`❌ License validation failed and grace period expired: ${err}`)
    return {
      valid: false,
      message: `License validation failed (offline): ${err instanceof Error ? err.message : String(err)}`,
      plan: 'unknown',
    }
  }
}

function storeLastValidState(valid: boolean, plan: string) {
  try {
    // In production, consider using a persistent store instead of memory
    ;(global as any)[LAST_STATE_KEY] = valid
    ;(global as any)[LAST_STATE_TIME_KEY] = Date.now()
  } catch {}
}

function getLastValidState(): { valid: boolean; plan: string; timestamp: number | null } {
  try {
    const valid = (global as any)[LAST_STATE_KEY] ?? false
    const timestamp = (global as any)[LAST_STATE_TIME_KEY] ?? null
    const plan = (global as any)[`${LAST_STATE_KEY}:plan`] ?? 'unknown'
    return { valid, plan, timestamp }
  } catch {
    return { valid: false, plan: 'unknown', timestamp: null }
  }
}
