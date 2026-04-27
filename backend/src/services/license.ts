import { db } from './db.js'

const LICENSE_CACHE = new Map<string, { valid: boolean; expiresAt: number }>()
const CACHE_TTL = 60 * 60 * 1000 // 1 hour

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

  // Find tenant with this license key in DB
  const tenant = await db.tenant.findFirst({
    where: { licenseKey: key },
    select: {
      id: true,
      active: true,
      licenseExpiresAt: true,
      plan: true,
      suspendedReason: true,
    },
  })

  if (!tenant) {
    LICENSE_CACHE.set(key, { valid: false, expiresAt: Date.now() + CACHE_TTL })
    return {
      valid: false,
      message: 'License key không hợp lệ',
      plan: 'unknown',
    }
  }
  if (!tenant.active) {
    LICENSE_CACHE.set(key, { valid: false, expiresAt: Date.now() + CACHE_TTL })
    return {
      valid: false,
      message: `License bị tạm ngưng: ${tenant.suspendedReason ?? 'no reason'}`,
      plan: tenant.plan,
    }
  }
  if (tenant.licenseExpiresAt && tenant.licenseExpiresAt < new Date()) {
    LICENSE_CACHE.set(key, { valid: false, expiresAt: Date.now() + CACHE_TTL })
    return { valid: false, message: 'License đã hết hạn', plan: tenant.plan }
  }

  LICENSE_CACHE.set(key, { valid: true, expiresAt: Date.now() + CACHE_TTL })
  return { valid: true, message: 'License valid', plan: tenant.plan }
}
