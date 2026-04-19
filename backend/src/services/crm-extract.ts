/**
 * CRM extraction — tự động tìm phone/email trong tin nhắn,
 * aggregate customer profile cross-group.
 */

import { db } from './db.js'
import { execSync } from 'node:child_process'

const CONTAINER = process.env.OPENCLAW_CONTAINER ?? 'openclaw'

async function fetchZaloProfile(userId: string): Promise<{ avatarUrl?: string; name?: string } | null> {
  try {
    const raw = execSync(`docker exec ${CONTAINER} openzca msg member-info --json ${userId}`, {
      encoding: 'utf-8', timeout: 10_000,
    })
    const resp = JSON.parse(raw)
    const profile = resp.changed_profiles?.[userId] ?? resp.unchanged_profiles?.[userId] ?? resp
    return {
      avatarUrl: profile.avatar ?? profile.avt ?? profile.fullAvt,
      name: profile.displayName ?? profile.zaloName ?? profile.dName,
    }
  } catch {
    return null
  }
}

const PHONE_REGEX = /(?:\+?84|0)(?:3|5|7|8|9)\d{8}\b/g
const EMAIL_REGEX = /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g

export function extractContact(text: string | null | undefined) {
  if (!text) return { phones: [], emails: [] }
  return {
    phones: Array.from(new Set(text.match(PHONE_REGEX) ?? [])),
    emails: Array.from(new Set(text.match(EMAIL_REGEX) ?? [])),
  }
}

export async function upsertCustomerFromMessage(tenantId: string, messageId: string) {
  const msg = await db.message.findUnique({
    where: { id: messageId },
    select: {
      senderId: true, senderName: true, senderType: true, content: true, sentAt: true,
    },
  })
  if (!msg || msg.senderType !== 'CONTACT') return null

  const { phones, emails } = extractContact(msg.content)
  const phone = phones[0]
  const email = emails[0]

  // Tìm customer hiện có qua zaloId hoặc phone hoặc email
  let customer = await db.customer.findFirst({
    where: {
      tenantId,
      OR: [
        { zaloId: msg.senderId },
        ...(phone ? [{ phone }] : []),
        ...(email ? [{ email }] : []),
      ],
    },
  })

  if (customer) {
    await db.customer.update({
      where: { id: customer.id },
      data: {
        name: customer.name ?? msg.senderName,
        phone: customer.phone ?? phone,
        email: customer.email ?? email,
        zaloId: customer.zaloId ?? msg.senderId,
        lastActivity: msg.sentAt,
        totalMessages: { increment: 1 },
      },
    })
  } else {
    // Fetch avatar + name từ Zalo khi tạo mới
    const profile = await fetchZaloProfile(msg.senderId).catch(() => null)
    customer = await db.customer.create({
      data: {
        tenantId,
        name: profile?.name ?? msg.senderName,
        avatarUrl: profile?.avatarUrl ?? null,
        phone, email, zaloId: msg.senderId,
        firstSeen: msg.sentAt, lastActivity: msg.sentAt,
        totalMessages: 1,
      },
    }).catch(() => null)
  }

  return customer
}

export async function backfillCustomersFromAllMessages(tenantId: string) {
  const messages = await db.message.findMany({
    where: {
      senderType: 'CONTACT',
      group: { tenantId },
    },
    select: { id: true },
    orderBy: { sentAt: 'asc' },
  })

  let processed = 0
  for (const m of messages) {
    await upsertCustomerFromMessage(tenantId, m.id).catch(() => undefined)
    processed++
  }

  return { processed, total: messages.length }
}
