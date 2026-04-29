/**
 * Zalo groups + messages sync via openzca CLI.
 *
 * - sync-groups: `openzca group list` → tên nhóm + memberCount
 * - sync-history: `openzca msg history <groupId>` → backfill tin cũ
 */

import { execSync } from 'node:child_process'
import { db } from './db.js'

const OPENCLAW_CONTAINER = process.env.OPENCLAW_CONTAINER ?? 'openclaw'

/** Parse Zalo timestamp linh hoạt (seconds/ms/microseconds). Xem chi tiết ở webhook-zalo.ts */
function parseZaloTimestamp(raw: any): Date {
  if (raw == null) return new Date()
  let n = typeof raw === 'string' ? Number(raw) : Number(raw)
  if (!Number.isFinite(n) || n <= 0) return new Date()
  if (n < 1e12) n = n * 1000
  else if (n > 1e14) n = Math.floor(n / 1000)
  const d = new Date(n)
  const y = d.getFullYear()
  if (y < 2001 || y > 2100) return new Date()
  return d
}

// Cache check container running — tránh spam stderr khi openclaw container chết.
let openclawAvailable: boolean | null = null
let openclawCheckAt = 0
function isOpenclawRunning(): boolean {
  if (openclawAvailable !== null && Date.now() - openclawCheckAt < 60_000) return openclawAvailable
  try {
    const out = execSync(`docker inspect -f '{{.State.Running}}' ${OPENCLAW_CONTAINER} 2>/dev/null`, { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] })
    openclawAvailable = out.trim() === 'true'
  } catch { openclawAvailable = false }
  openclawCheckAt = Date.now()
  return openclawAvailable
}

function exec(cmd: string, timeoutMs = 60_000, maxBufferMB = 50): string {
  if (!isOpenclawRunning()) throw new Error('openclaw container not running')
  return execSync(`docker exec ${OPENCLAW_CONTAINER} ${cmd}`, {
    encoding: 'utf-8',
    timeout: timeoutMs,
    maxBuffer: 1024 * 1024 * maxBufferMB,
    stdio: ['ignore', 'pipe', 'ignore'],
  })
}

type ZaloGroup = {
  groupId: string
  name: string
  totalMember: number
  type: number
  createdTime?: number
}

/**
 * Sync top-N groups từ openzca vào DB.
 * Cập nhật tên/memberCount nếu group đã có.
 */
/**
 * Reconcile: chỉ TOP `maxGroups` nhóm theo lastMessageAt → monitorEnabled=true
 * Nhóm còn lại → monitorEnabled=false (webhook sẽ skip tin nhắn của chúng)
 */
export async function rerankTopGroups(tenantId: string) {
  const tenant = await db.tenant.findUnique({
    where: { id: tenantId },
    select: { maxGroups: true },
  })
  if (!tenant) return { enabled: 0, disabled: 0 }

  const top = await db.group.findMany({
    where: { tenantId, channelType: 'ZALO' },
    orderBy: { lastMessageAt: { sort: 'desc', nulls: 'last' } },
    take: tenant.maxGroups,
    select: { id: true },
  })
  const topIds = new Set(top.map(g => g.id))

  const all = await db.group.findMany({
    where: { tenantId, channelType: 'ZALO' },
    select: { id: true, monitorEnabled: true },
  })

  const toEnable: string[] = []
  const toDisable: string[] = []
  for (const g of all) {
    if (topIds.has(g.id) && !g.monitorEnabled) toEnable.push(g.id)
    else if (!topIds.has(g.id) && g.monitorEnabled) toDisable.push(g.id)
  }

  if (toEnable.length) await db.group.updateMany({ where: { id: { in: toEnable } }, data: { monitorEnabled: true } })
  if (toDisable.length) await db.group.updateMany({ where: { id: { in: toDisable } }, data: { monitorEnabled: false } })

  return { enabled: toEnable.length, disabled: toDisable.length, totalTop: topIds.size }
}

export async function syncZaloGroups(tenantId: string, limit = 50) {
  const raw = exec('openzca group list --json')
  const all = JSON.parse(raw) as ZaloGroup[]

  // Map groupId → openzca group info
  const byId = new Map(all.map(g => [g.groupId, g]))

  // Top N by recency (openzca trả theo last activity)
  const topIds = new Set(all.slice(0, limit).map(g => g.groupId))

  // Cộng thêm các DB group đã có (để cập nhật tên cho nhóm discovered qua listener)
  const existing = await db.group.findMany({
    where: { tenantId, channelType: 'ZALO' },
    select: { id: true, externalId: true, name: true, memberCount: true },
  })
  for (const e of existing) topIds.add(e.externalId)

  let created = 0
  let updated = 0
  for (const gid of topIds) {
    const info = byId.get(gid)
    if (!info) continue // DB có nhưng openzca không thấy (deleted?)

    const dbEntry = existing.find(e => e.externalId === gid)
    if (dbEntry) {
      if (dbEntry.name !== info.name || dbEntry.memberCount !== info.totalMember) {
        await db.group.update({
          where: { id: dbEntry.id },
          data: { name: info.name, memberCount: info.totalMember },
        })
        updated++
      }
    } else {
      await db.group.create({
        data: {
          tenantId,
          externalId: info.groupId,
          channelType: 'ZALO',
          name: info.name,
          memberCount: info.totalMember,
          monitorEnabled: true,
        },
      })
      created++
    }
  }

  // Auto-rerank sau sync để đảm bảo đúng số nhóm theo plan
  const rank = await rerankTopGroups(tenantId)

  return { total: all.length, synced: topIds.size, created, updated, rerank: rank }
}

/**
 * Backfill history cho 1 group.
 * openzca msg history <groupId> --limit N
 */
export async function syncZaloGroupHistory(tenantId: string, groupId: string, limit = 50) {
  const group = await db.group.findFirst({
    where: { id: groupId, tenantId, channelType: 'ZALO' },
  })
  if (!group) throw new Error('Group not found')

  // openzca msg recent -g -n N --json <threadId>
  // Timeout scale theo depth: 30s base + 10s mỗi 100 tin, tối đa 5 phút
  const timeoutMs = Math.min(5 * 60_000, 30_000 + Math.floor(limit / 100) * 10_000)
  // Buffer: ~1KB/tin, thêm 20% dự phòng, tối thiểu 50MB
  const bufferMB = Math.max(50, Math.ceil(limit * 1.2 / 1000))
  const cmd = `openzca msg recent -g -n ${limit} --json ${group.externalId}`
  let raw: string
  try {
    raw = exec(cmd, timeoutMs, bufferMB)
  } catch (err: any) {
    throw new Error(`openzca failed: ${err.message}`)
  }

  let messages: any[] = []
  try {
    const parsed = JSON.parse(raw)
    messages = Array.isArray(parsed) ? parsed : (parsed.messages ?? parsed.data ?? [])
  } catch {
    throw new Error('Invalid JSON from openzca')
  }
  let imported = 0

  for (const m of messages) {
    const msgId = m.msgId ?? m.cliMsgId
    if (!msgId) continue

    try {
      await db.message.upsert({
        where: {
          groupId_externalId: { groupId: group.id, externalId: String(msgId) },
        },
        update: {},
        create: {
          groupId: group.id,
          externalId: String(msgId),
          senderType: m.isSelf || m.senderId === m.toId ? 'SELF' : 'CONTACT',
          senderId: String(m.senderId ?? m.uidFrom ?? 'unknown'),
          senderName: m.senderName ?? m.dName ?? null,
          contentType: detectContent(m),
          content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
          sentAt: parseZaloTimestamp(m.timestamp),
        },
      })
      imported++
    } catch {
      // skip duplicates / errors
    }
  }

  return { groupId, imported, total: messages.length }
}

function detectContent(m: any): 'TEXT' | 'IMAGE' | 'VIDEO' | 'FILE' | 'STICKER' | 'VOICE' {
  const t = (m.msgType ?? m.mediaType ?? '').toLowerCase()
  if (t.includes('image') || t.includes('photo')) return 'IMAGE'
  if (t.includes('video')) return 'VIDEO'
  if (t.includes('voice') || t.includes('audio')) return 'VOICE'
  if (t.includes('sticker')) return 'STICKER'
  if (m.mediaPath || m.mediaUrl) return 'FILE'
  return 'TEXT'
}

export function sendZaloMessage(externalGroupId: string, text: string): void {
  const safe = text.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, ' ')
  exec(`openzca msg send ${externalGroupId} "${safe}"`, 10_000)
}
