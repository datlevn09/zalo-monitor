/**
 * AI Chat trong dashboard — conversational interface tới data.
 * User hỏi câu hỏi, backend query DB + gửi Claude với context, reply text/HTML.
 */

import type { FastifyPluginAsync } from 'fastify'
import Anthropic from '@anthropic-ai/sdk'
import { db } from '../services/db.js'

const anthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null

export const aiChatRoutes: FastifyPluginAsync = async (app) => {
  app.post('/', async (req, reply) => {
    const tenantId = req.headers['x-tenant-id'] as string
    if (!tenantId) return reply.status(400).send({ error: 'Missing tenant id' })
    if (!anthropic) return reply.send({ answer: 'AI chưa được cấu hình (thiếu ANTHROPIC_API_KEY). Dùng search + charts thay thế.' })

    const { question, history } = req.body as {
      question: string
      history?: Array<{ role: 'user' | 'assistant'; content: string }>
    }
    if (!question?.trim()) return reply.status(400).send({ error: 'question required' })

    // Collect data context
    const since = new Date(Date.now() - 7 * 86400000)
    const [groups, alerts, recentMsgs, customers] = await Promise.all([
      db.group.findMany({
        where: { tenantId, monitorEnabled: true },
        orderBy: { lastMessageAt: { sort: 'desc', nulls: 'last' } },
        take: 30,
        select: { id: true, name: true, memberCount: true, lastMessageAt: true, _count: { select: { messages: true, alerts: true } } },
      }),
      db.alert.findMany({
        where: { tenantId, createdAt: { gte: since } },
        orderBy: { createdAt: 'desc' }, take: 30,
        include: { group: { select: { name: true } } },
      }),
      db.message.findMany({
        where: { group: { tenantId, monitorEnabled: true }, sentAt: { gte: since }, senderType: 'CONTACT' },
        orderBy: { sentAt: 'desc' }, take: 100,
        select: {
          content: true, senderName: true, sentAt: true,
          group: { select: { name: true } },
          analysis: { select: { label: true, priority: true } },
        },
      }),
      db.customer.findMany({
        where: { tenantId }, orderBy: { lastActivity: 'desc' }, take: 20,
      }),
    ])

    const context = {
      groups: groups.map(g => ({ name: g.name, members: g.memberCount, messages: g._count.messages, alerts: g._count.alerts, lastActivity: g.lastMessageAt })),
      alerts: alerts.map(a => ({ group: a.group.name, label: a.label, priority: a.priority, summary: a.summary, status: a.status, createdAt: a.createdAt })),
      recentMessages: recentMsgs.map(m => ({ group: m.group.name, sender: m.senderName, text: m.content?.slice(0, 200), label: m.analysis?.label, priority: m.analysis?.priority })),
      customers: customers.map(c => ({ name: c.name, phone: c.phone, tag: c.tag, totalMessages: c.totalMessages, lastActivity: c.lastActivity, revenue: c.revenue })),
    }

    const systemPrompt = `Bạn là trợ lý business intelligence cho chủ doanh nghiệp Việt Nam.
Trả lời câu hỏi của họ dựa trên DATA sau (không bịa). Trả lời bằng tiếng Việt, ngắn gọn (< 400 từ).
Format: dùng emoji + bullet points khi liệt kê. Nêu con số cụ thể. Đề xuất action nếu phù hợp.

DATA (7 ngày gần nhất):
${JSON.stringify(context, null, 2).slice(0, 15000)}`

    const messages = [
      ...(history ?? []).slice(-6),
      { role: 'user' as const, content: question },
    ]

    try {
      const response = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001', max_tokens: 1000,
        system: systemPrompt, messages,
      })
      const answer = response.content[0].type === 'text' ? response.content[0].text : ''
      return { answer }
    } catch (err: any) {
      return reply.status(500).send({ error: err.message })
    }
  })
}
