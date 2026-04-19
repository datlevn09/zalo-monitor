import type { FastifyPluginAsync } from 'fastify'
import { db } from '../services/db.js'

const INDUSTRY_PRESETS: Record<string, {
  positiveKeywords: string[]; negativeKeywords: string[];
  opportunityKeywords: string[]; complaintKeywords: string[];
  riskKeywords: string[];
}> = {
  real_estate: {
    positiveKeywords: ['cảm ơn', 'ok', 'đồng ý', 'chốt', 'deposit'],
    negativeKeywords: ['không đúng', 'sai', 'lừa đảo', 'thất vọng'],
    opportunityKeywords: ['giá', 'diện tích', 'xem nhà', 'booking', 'đặt cọc', 'view', 'pháp lý'],
    complaintKeywords: ['chưa giao', 'trễ', 'lừa', 'hoàn tiền', 'báo chậm'],
    riskKeywords: ['kiện', 'tố cáo', 'chấm dứt', 'thoả thuận'],
  },
  retail: {
    positiveKeywords: ['cảm ơn', 'chất lượng', 'hài lòng', 'giao nhanh'],
    negativeKeywords: ['hỏng', 'thiếu', 'giao sai', 'chậm'],
    opportunityKeywords: ['giá', 'size', 'màu', 'còn hàng', 'ship', 'đặt', 'mua'],
    complaintKeywords: ['hoàn tiền', 'đổi trả', 'hỏng', 'không đúng mô tả'],
    riskKeywords: ['phản ánh', 'tố cáo', 'bóc phốt'],
  },
  insurance: {
    positiveKeywords: ['cảm ơn', 'rõ ràng', 'nhanh chóng'],
    negativeKeywords: ['không rõ', 'lừa', 'phức tạp'],
    opportunityKeywords: ['gói', 'phí', 'quyền lợi', 'mua bảo hiểm'],
    complaintKeywords: ['bồi thường', 'chậm xét duyệt', 'từ chối'],
    riskKeywords: ['kiện', 'huỷ hợp đồng', 'phản ánh'],
  },
  generic: {
    positiveKeywords: ['cảm ơn', 'tốt', 'ok', 'tuyệt', 'hài lòng'],
    negativeKeywords: ['tệ', 'bực', 'thất vọng'],
    opportunityKeywords: ['giá', 'mua', 'đặt', 'hỏi giá', 'bao nhiêu', 'còn hàng'],
    complaintKeywords: ['khiếu nại', 'hoàn tiền', 'lỗi', 'chưa giao'],
    riskKeywords: ['kiện', 'tố cáo', 'bóc phốt'],
  },
}

export const configRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', async (req, reply) => {
    const tenantId = req.headers['x-tenant-id'] as string
    if (!tenantId) return reply.status(400).send({ error: 'Missing tenant id' })

    const cfg = await db.classificationConfig.upsert({
      where: { tenantId },
      update: {},
      create: { tenantId, ...INDUSTRY_PRESETS.generic },
    })
    return cfg
  })

  app.patch('/', async (req, reply) => {
    const tenantId = req.headers['x-tenant-id'] as string
    if (!tenantId) return reply.status(400).send({ error: 'Missing tenant id' })
    const body = req.body as any

    const data: any = {}
    for (const k of [
      'positiveKeywords', 'negativeKeywords', 'opportunityKeywords',
      'complaintKeywords', 'riskKeywords', 'customPrompt', 'industry',
      'replyTimeoutMinutes', 'requireQuoteReply',
    ]) {
      if (body[k] !== undefined) data[k] = body[k]
    }

    const cfg = await db.classificationConfig.upsert({
      where: { tenantId },
      update: data,
      create: { tenantId, ...INDUSTRY_PRESETS.generic, ...data },
    })
    return cfg
  })

  app.post('/preset/:industry', async (req, reply) => {
    const tenantId = req.headers['x-tenant-id'] as string
    const { industry } = req.params as { industry: string }
    const preset = INDUSTRY_PRESETS[industry]
    if (!preset) return reply.status(400).send({ error: 'Unknown industry' })

    const cfg = await db.classificationConfig.upsert({
      where: { tenantId },
      update: { ...preset, industry },
      create: { tenantId, industry, ...preset },
    })
    return cfg
  })

  app.get('/presets', async () => {
    return Object.entries(INDUSTRY_PRESETS).map(([k, v]) => ({
      industry: k,
      label: {
        real_estate: '🏠 Bất động sản',
        retail: '🛒 Bán lẻ / Thương mại',
        insurance: '📋 Bảo hiểm',
        generic: '🌐 Chung',
      }[k] ?? k,
      sample: v,
    }))
  })
}
