/**
 * Encryption helper — AES-256-GCM cho field nhạy cảm.
 *
 * Format ciphertext: base64("v1:" + iv(12B) + tag(16B) + ciphertext)
 * Prefix "v1:" để versioning sau này (đổi thuật toán/key rotation).
 *
 * MASTER_KEY env var: hex 64 chars (32 bytes). Nếu thiếu → tự sinh và LOG
 * cảnh báo (data sẽ mất nếu container restart). Production phải set env cố định.
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

const ALGO = 'aes-256-gcm'
const IV_LEN = 12
const TAG_LEN = 16
const VERSION = 'v1'

let cachedKey: Buffer | null = null

function getKey(): Buffer {
  if (cachedKey) return cachedKey
  const hex = process.env.MASTER_KEY
  if (hex && /^[0-9a-fA-F]{64}$/.test(hex)) {
    cachedKey = Buffer.from(hex, 'hex')
  } else {
    // Sinh tạm — production phải set env, nếu không restart sẽ mất key → mất data
    cachedKey = randomBytes(32)
    console.warn(
      '⚠️  MASTER_KEY env var không set hoặc sai format (cần 64 hex chars). ' +
      'Đã tự sinh key tạm cho dev. PRODUCTION phải set MASTER_KEY cố định, nếu không restart sẽ mất key + dữ liệu mã hoá.'
    )
    console.warn(`   Dev key tạm: MASTER_KEY=${cachedKey.toString('hex')}`)
  }
  return cachedKey
}

export function encrypt(plaintext: string | null | undefined): string | null {
  if (plaintext == null || plaintext === '') return plaintext == null ? null : ''
  const key = getKey()
  const iv = randomBytes(IV_LEN)
  const cipher = createCipheriv(ALGO, key, iv)
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${VERSION}:${Buffer.concat([iv, tag, ct]).toString('base64')}`
}

export function decrypt(blob: string | null | undefined): string | null {
  if (blob == null) return null
  if (blob === '') return ''
  // Backward-compat: nếu chưa có prefix v1: → coi là plaintext cũ
  if (!blob.startsWith(`${VERSION}:`)) return blob
  try {
    const raw = Buffer.from(blob.slice(VERSION.length + 1), 'base64')
    const iv = raw.subarray(0, IV_LEN)
    const tag = raw.subarray(IV_LEN, IV_LEN + TAG_LEN)
    const ct = raw.subarray(IV_LEN + TAG_LEN)
    const key = getKey()
    const decipher = createDecipheriv(ALGO, key, iv)
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8')
  } catch (e) {
    console.error('[crypto] decrypt failed (key đổi? data corrupt?):', e)
    return null
  }
}

/** True nếu blob đã được encrypt (có prefix). False = plaintext cũ. */
export function isEncrypted(blob: string | null | undefined): boolean {
  return typeof blob === 'string' && blob.startsWith(`${VERSION}:`)
}
