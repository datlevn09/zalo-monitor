/**
 * /api/contact — public endpoint nhận lời nhắn từ form trên trang /contact
 * (không yêu cầu auth). Email về author + audit log.
 */

import type { FastifyPluginAsync } from 'fastify'
import { sendMail } from '../services/mailer.js'

const TARGET_EMAIL = process.env.CONTACT_TARGET_EMAIL ?? 'datle@outlook.com'
const TOPICS = new Set(['general', 'support', 'sales', 'partnership', 'security', 'other'])

// Simple in-memory rate limit per IP: 5 reqs/hour.
const buckets = new Map<string, { count: number; reset: number }>()
const RATE_LIMIT = 5
const WINDOW_MS = 60 * 60 * 1000

function ipFromReq(req: any): string {
  const xff = req.headers['x-forwarded-for']
  if (typeof xff === 'string' && xff.length > 0) return xff.split(',')[0].trim()
  return req.ip ?? 'unknown'
}

function checkRate(ip: string): boolean {
  const now = Date.now()
  const b = buckets.get(ip)
  if (!b || b.reset < now) {
    buckets.set(ip, { count: 1, reset: now + WINDOW_MS })
    return true
  }
  if (b.count >= RATE_LIMIT) return false
  b.count++
  return true
}

export const contactRoutes: FastifyPluginAsync = async (app) => {
  app.post('/', async (req, reply) => {
    const ip = ipFromReq(req)
    if (!checkRate(ip)) {
      return reply.status(429).send({ error: 'Quá nhiều yêu cầu, vui lòng thử lại sau' })
    }

    const body = req.body as { name?: string; email?: string; topic?: string; message?: string }
    const name = (body?.name ?? '').toString().trim().slice(0, 100)
    const email = (body?.email ?? '').toString().trim().slice(0, 200)
    const topic = TOPICS.has(body?.topic ?? '') ? body!.topic! : 'general'
    const message = (body?.message ?? '').toString().trim().slice(0, 5000)

    if (!name || !message) {
      return reply.status(400).send({ error: 'Thiếu họ tên hoặc nội dung' })
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return reply.status(400).send({ error: 'Email không hợp lệ' })
    }

    const subject = `[Zalo Monitor · ${topic}] ${name}`
    const text = [
      `Họ tên: ${name}`,
      `Email: ${email || '(không cung cấp)'}`,
      `Chủ đề: ${topic}`,
      `IP: ${ip}`,
      `Thời điểm: ${new Date().toISOString()}`,
      '',
      '─────────────',
      message,
    ].join('\n')

    try {
      await sendMail({ to: TARGET_EMAIL, subject, text })
      console.log(`[contact] Sent from ${name} <${email || 'no-email'}> · ${topic}`)
      return { ok: true }
    } catch (e: any) {
      console.error('[contact] sendMail failed:', e?.message ?? e)
      return reply.status(500).send({ error: 'Không gửi được email — vui lòng dùng Telegram' })
    }
  })
}
