import Anthropic from '@anthropic-ai/sdk'

const hasApiKey = !!process.env.ANTHROPIC_API_KEY
const anthropic = hasApiKey ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }) : null

type Context = {
  content: string | null
  senderName: string | null
  senderType?: 'SELF' | 'CONTACT'
  sentAt: Date
}[]

type ClassifyResult = {
  label: 'OPPORTUNITY' | 'COMPLAINT' | 'RISK' | 'POSITIVE' | 'NEUTRAL'
  sentiment: 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE'
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  confidence: number
  reason: string
  action: 'FOLLOW_UP' | 'URGENT' | 'IGNORE'
  model: string
}

type TenantKeywords = {
  positive?: string[]; negative?: string[];
  opportunity?: string[]; complaint?: string[]; risk?: string[];
  customPrompt?: string | null;
}

// Keyword-based fallback — dùng keywords tenant-configured + defaults
function fallbackClassify(text: string, kw?: TenantKeywords): ClassifyResult {
  const t = text.toLowerCase()

  // Skip media-only messages
  if (/^\[media attached:/i.test(t.trim()) && !t.replace(/\[media[^\]]+\]/g, '').trim()) {
    return {
      label: 'NEUTRAL', sentiment: 'NEUTRAL', priority: 'LOW',
      confidence: 0.3, reason: 'Media only', action: 'IGNORE', model: 'fallback-keyword-v1',
    }
  }

  const defaultComplaint = ['khiếu nại','phàn nàn','lỗi','hỏng','trễ','chậm','thiếu','sai','bực','tệ','không được','chán','tức','thất vọng','đâu rồi','chưa có','chưa giao']
  const defaultOpp       = ['giá','mua','đặt','hỏi giá','bao nhiêu','báo giá','sản phẩm','còn hàng','thanh toán','chuyển khoản','size','còn không','có không','cho mình','cho em','cho tôi','có bán','order','đặt hàng','lấy']
  const defaultPos       = ['cảm ơn','tốt','ok','good','great','ngon','đẹp','hài lòng','nhanh','chuyên nghiệp','tuyệt','đúng','chuẩn','perfect']
  const defaultRisk      = ['kiện','tố cáo','bóc phốt','chấm dứt']

  const complaintList   = [...defaultComplaint, ...(kw?.complaint ?? []), ...(kw?.negative ?? [])]
  const oppList         = [...defaultOpp, ...(kw?.opportunity ?? [])]
  const posList         = [...defaultPos, ...(kw?.positive ?? [])]
  const riskList        = [...defaultRisk, ...(kw?.risk ?? [])]

  const match = (list: string[]) => list.some(k => k && t.includes(k.toLowerCase()))
  const isRisk = match(riskList)
  const isComplaint = match(complaintList)
  const isOpportunity = match(oppList)
  const isPositive = match(posList)

  let label: ClassifyResult['label'] = 'NEUTRAL'
  let priority: ClassifyResult['priority'] = 'LOW'
  let sentiment: ClassifyResult['sentiment'] = 'NEUTRAL'
  let reason = 'Fallback keyword match'

  if (isRisk) {
    label = 'RISK'; priority = 'CRITICAL'; sentiment = 'NEGATIVE'
    reason = 'Phát hiện keyword rủi ro cao'
  } else if (isComplaint) {
    label = 'COMPLAINT'; priority = 'HIGH'; sentiment = 'NEGATIVE'
    reason = 'Phát hiện keyword phàn nàn'
  } else if (isOpportunity) {
    label = 'OPPORTUNITY'; priority = 'MEDIUM'; sentiment = 'NEUTRAL'
    reason = 'Khách hỏi giá / quan tâm sản phẩm'
  } else if (isPositive) {
    label = 'POSITIVE'; priority = 'LOW'; sentiment = 'POSITIVE'
    reason = 'Phản hồi tích cực'
  }

  return {
    label, sentiment, priority, confidence: 0.5, reason,
    action: priority === 'HIGH' ? 'URGENT' : priority === 'MEDIUM' ? 'FOLLOW_UP' : 'IGNORE',
    model: 'fallback-keyword-v1',
  }
}

const SYSTEM_PROMPT = `Bạn là AI phân tích tin nhắn trong các nhóm chat kinh doanh (Zalo/Telegram).
Phân tích tin nhắn và trả về JSON với các trường sau:

{
  "label": "OPPORTUNITY | COMPLAINT | RISK | POSITIVE | NEUTRAL",
  "sentiment": "POSITIVE | NEUTRAL | NEGATIVE",
  "priority": "LOW | MEDIUM | HIGH | CRITICAL",
  "confidence": 0.0-1.0,
  "reason": "giải thích ngắn gọn bằng tiếng Việt",
  "action": "FOLLOW_UP | URGENT | IGNORE"
}

Quy tắc phân loại:
- OPPORTUNITY: khách hỏi giá, muốn mua, hỏi thông tin sản phẩm
- COMPLAINT: phàn nàn, phản hồi tiêu cực, vấn đề sản phẩm/dịch vụ
- RISK: phàn nàn lặp lại, không có phản hồi, khách thất vọng cao
- POSITIVE: đặt hàng thành công, phản hồi tốt, hài lòng
- NEUTRAL: tin nhắn thông thường, không liên quan kinh doanh

Chỉ trả về JSON, không giải thích thêm.`

export async function generateDigestSummary(digest: any): Promise<string> {
  if (!anthropic) {
    // Fallback narrative khi chưa có API key
    const s = digest.stats
    const parts: string[] = []
    if (s.openAlerts > 0) parts.push(`Có ${s.openAlerts} cảnh báo cần xử lý`)
    if (s.newComplaints > 0) parts.push(`${s.newComplaints} khiếu nại mới`)
    if (s.newOpportunities > 0) parts.push(`${s.newOpportunities} cơ hội`)
    if (s.totalMessages === 0) return 'Không có hoạt động trong 24h qua.'
    return parts.length
      ? parts.join(', ') + ` trong tổng ${s.totalMessages} tin nhắn từ ${s.activeGroups} nhóm active.`
      : `Ngày hôm nay ổn định — ${s.totalMessages} tin từ ${s.activeGroups} nhóm, không có cảnh báo mới.`
  }

  const prompt = `Bạn là trợ lý business intelligence. Viết tóm tắt ngắn gọn (3-5 câu) cho chủ doanh nghiệp về tình hình ngày hôm qua dựa trên dữ liệu sau:

${JSON.stringify(digest, null, 2)}

Yêu cầu:
- Tiếng Việt, giọng chuyên nghiệp nhưng thân thiện
- Nêu điểm quan trọng nhất trước
- Đề xuất 1-2 action cụ thể nếu có vấn đề
- Không dùng emoji quá nhiều
- Không dùng markdown (dashboard sẽ render raw text)`

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 400,
    messages: [{ role: 'user', content: prompt }],
  })

  return response.content[0].type === 'text' ? response.content[0].text : ''
}

export async function classifyMessage(text: string, context: Context, kw?: TenantKeywords): Promise<ClassifyResult> {
  if (!anthropic) return fallbackClassify(text, kw)

  const contextText = context
    .map(m => {
      const who = m.senderType === 'SELF' ? `🤖 Bot` : `[${m.senderName ?? '?'}]`
      return `${who}: ${m.content}`
    })
    .join('\n')

  const userMessage = context.length
    ? `Ngữ cảnh trước (hội thoại nhóm chat):\n${contextText}\n\n---\n\nTin nhắn MỚI cần phân tích:\n${text}`
    : text

  const model = 'claude-haiku-4-5-20251001'

  const response = await anthropic.messages.create({
    model,
    max_tokens: 256,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMessage }],
  })

  const raw = response.content[0].type === 'text' ? response.content[0].text : '{}'

  try {
    const parsed = JSON.parse(raw)
    return { ...parsed, model }
  } catch {
    return {
      label: 'NEUTRAL',
      sentiment: 'NEUTRAL',
      priority: 'LOW',
      confidence: 0,
      reason: 'Không thể phân tích',
      action: 'IGNORE',
      model,
    }
  }
}
