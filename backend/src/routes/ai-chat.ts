/**
 * AI Chat trong dashboard — conversational interface tới data.
 * User hỏi câu hỏi, backend query DB + gửi Claude với context, reply text/HTML.
 */

import type { FastifyPluginAsync } from 'fastify'
import Anthropic from '@anthropic-ai/sdk'
import { db } from '../services/db.js'

// Default Anthropic instance dùng env key (fallback nếu tenant không tự cấu hình)
const defaultAnthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null

// Lấy AI client cho 1 tenant — ưu tiên config của tenant, fallback system env.
async function getAiConfigForTenant(tenantId: string): Promise<{
  provider: 'anthropic' | 'openai' | 'google'
  apiKey: string
  model: string
} | null> {
  const t = await db.tenant.findUnique({
    where: { id: tenantId },
    select: { aiProvider: true, aiApiKey: true, aiModel: true },
  })
  if (t?.aiProvider && t.aiApiKey) {
    return {
      provider: t.aiProvider as any,
      apiKey: t.aiApiKey,
      model: t.aiModel || (t.aiProvider === 'openai' ? 'gpt-4o-mini' : t.aiProvider === 'google' ? 'gemini-1.5-flash' : 'claude-haiku-4-5-20251001'),
    }
  }
  if (process.env.ANTHROPIC_API_KEY) {
    return { provider: 'anthropic', apiKey: process.env.ANTHROPIC_API_KEY, model: 'claude-haiku-4-5-20251001' }
  }
  return null
}

async function callAi(cfg: { provider: string; apiKey: string; model: string }, system: string, messages: Array<{ role: string; content: string }>): Promise<string> {
  if (cfg.provider === 'anthropic') {
    const client = new Anthropic({ apiKey: cfg.apiKey })
    const resp = await client.messages.create({
      model: cfg.model, max_tokens: 1000, system,
      messages: messages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    })
    return resp.content[0].type === 'text' ? resp.content[0].text : ''
  }
  if (cfg.provider === 'openai') {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
      body: JSON.stringify({
        model: cfg.model,
        messages: [{ role: 'system', content: system }, ...messages],
        max_tokens: 1000,
      }),
    })
    if (!r.ok) throw new Error(`OpenAI ${r.status}: ${await r.text()}`)
    const d = await r.json() as any
    return d.choices?.[0]?.message?.content ?? ''
  }
  if (cfg.provider === 'google') {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${cfg.model}:generateContent?key=${cfg.apiKey}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: messages.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
        generationConfig: { maxOutputTokens: 1000 },
      }),
    })
    if (!r.ok) throw new Error(`Gemini ${r.status}: ${await r.text()}`)
    const d = await r.json() as any
    return d.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
  }
  throw new Error(`Provider không hỗ trợ: ${cfg.provider}`)
}

export const aiChatRoutes: FastifyPluginAsync = async (app) => {
  app.post('/', async (req, reply) => {
    const tenantId = req.headers['x-tenant-id'] as string
    if (!tenantId) return reply.status(400).send({ error: 'Missing tenant id' })

    const aiCfg = await getAiConfigForTenant(tenantId)
    if (!aiCfg) return reply.send({ answer: 'AI chưa cấu hình. Vào Cài đặt → AI → nhập API key của bạn (Anthropic / OpenAI / Google).' })

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
      const answer = await callAi(aiCfg, systemPrompt, messages)
      return { answer, provider: aiCfg.provider, model: aiCfg.model }
    } catch (err: any) {
      return reply.status(500).send({ error: err.message })
    }
  })

  // GET / PUT /api/ai/config — quản lý AI config của tenant
  app.get('/config', async (req, reply) => {
    const tenantId = req.headers['x-tenant-id'] as string
    if (!tenantId) return reply.status(400).send({ error: 'Missing tenant id' })
    const t = await db.tenant.findUnique({
      where: { id: tenantId },
      select: { aiProvider: true, aiModel: true, aiApiKey: true },
    })
    return {
      provider: t?.aiProvider ?? null,
      model: t?.aiModel ?? null,
      hasKey: !!t?.aiApiKey,
      keyPreview: t?.aiApiKey ? `${t.aiApiKey.slice(0, 7)}...${t.aiApiKey.slice(-4)}` : null,
      systemFallback: !!process.env.ANTHROPIC_API_KEY,
    }
  })

  app.put('/config', async (req, reply) => {
    const tenantId = req.headers['x-tenant-id'] as string
    if (!tenantId) return reply.status(400).send({ error: 'Missing tenant id' })
    const body = req.body as { provider?: string | null; apiKey?: string | null; model?: string | null }
    const allowed = ['anthropic', 'openai', 'google', null]
    if (body.provider !== undefined && !allowed.includes(body.provider as any)) {
      return reply.status(400).send({ error: 'Provider phải là anthropic / openai / google / null' })
    }
    await db.tenant.update({
      where: { id: tenantId },
      data: {
        ...(body.provider !== undefined ? { aiProvider: body.provider } : {}),
        ...(body.apiKey !== undefined ? { aiApiKey: body.apiKey } : {}),
        ...(body.model !== undefined ? { aiModel: body.model } : {}),
      },
    })
    return { ok: true }
  })
}
