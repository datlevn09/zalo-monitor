/**
 * Sync avatar URLs từ openzca cho customers và groups.
 */

import { execSync } from 'node:child_process'
import { db } from './db.js'

const CONTAINER = process.env.OPENCLAW_CONTAINER ?? 'openclaw'

function exec(cmd: string): string {
  return execSync(`docker exec ${CONTAINER} ${cmd}`, {
    encoding: 'utf-8', timeout: 30_000, maxBuffer: 10 * 1024 * 1024,
  })
}

export async function syncCustomerAvatars(tenantId: string, limit = 100) {
  const customers = await db.customer.findMany({
    where: { tenantId, zaloId: { not: null }, avatarUrl: null },
    take: limit, select: { id: true, zaloId: true },
  })

  let updated = 0
  for (const c of customers) {
    try {
      const raw = exec(`openzca msg member-info --json ${c.zaloId}`)
      const resp = JSON.parse(raw)
      // info nested trong changed_profiles[userId] hoặc unchanged_profiles[userId]
      const profile = resp.changed_profiles?.[c.zaloId!]
                    ?? resp.unchanged_profiles?.[c.zaloId!]
                    ?? resp
      const avatarUrl = profile.avatar ?? profile.avt ?? profile.fullAvt ?? profile.zavatar
      const displayName = profile.displayName ?? profile.zaloName ?? profile.dName

      if (avatarUrl || displayName) {
        await db.customer.update({
          where: { id: c.id },
          data: {
            ...(avatarUrl ? { avatarUrl } : {}),
            ...(displayName ? { name: displayName } : {}),
          },
        })
        updated++
      }
    } catch {
      // User not resolvable — skip
    }
  }
  return { processed: customers.length, updated }
}

export async function syncGroupAvatars(tenantId: string, limit = 50) {
  const groups = await db.group.findMany({
    where: { tenantId, channelType: 'ZALO', avatarUrl: null },
    take: limit, select: { id: true, externalId: true },
  })

  // Fetch from openzca group list (single call, cheap)
  let list: any[] = []
  try {
    list = JSON.parse(exec('openzca group list --json'))
  } catch { return { processed: 0, updated: 0 } }
  const byId = new Map(list.map(g => [g.groupId, g]))

  let updated = 0
  for (const g of groups) {
    const info = byId.get(g.externalId)
    const avatar = info?.fullAvt ?? info?.avt
    if (avatar) {
      await db.group.update({ where: { id: g.id }, data: { avatarUrl: avatar } })
      updated++
    }
  }
  return { processed: groups.length, updated }
}

export async function syncAllAvatars(tenantId: string) {
  const [c, g] = await Promise.all([
    syncCustomerAvatars(tenantId),
    syncGroupAvatars(tenantId),
  ])
  return { customers: c, groups: g }
}
