export const LABEL_CFG = {
  OPPORTUNITY: { color: 'bg-green-100 dark:bg-green-500/15 text-green-700 dark:text-green-300 border-green-200 dark:border-green-500/30', label: 'Cơ hội', icon: '💰' },
  COMPLAINT:   { color: 'bg-red-100 dark:bg-red-500/15 text-red-700 dark:text-red-300 border-red-200 dark:border-red-500/30', label: 'Khiếu nại', icon: '🚨' },
  RISK:        { color: 'bg-orange-100 dark:bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-500/30', label: 'Rủi ro', icon: '⚠️' },
  POSITIVE:    { color: 'bg-blue-100 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-500/30', label: 'Tích cực', icon: '👍' },
  NEUTRAL:     { color: 'bg-gray-100 dark:bg-white/10 text-gray-600 dark:text-zinc-300 border-gray-200 dark:border-white/10', label: 'Bình thường', icon: '💬' },
} as const

export const PRIORITY_CFG = {
  LOW:      { color: 'text-gray-500 dark:text-zinc-400', label: 'Thấp', dot: 'bg-gray-400' },
  MEDIUM:   { color: 'text-yellow-600 dark:text-yellow-400', label: 'Trung bình', dot: 'bg-yellow-400' },
  HIGH:     { color: 'text-orange-600 dark:text-orange-400', label: 'Cao', dot: 'bg-orange-500' },
  CRITICAL: { color: 'text-red-700 dark:text-red-400', label: 'Khẩn cấp', dot: 'bg-red-500' },
} as const

// Coi như "không có timestamp" nếu null/undefined hoặc là epoch 0 (1970)
function isValidDate(d: Date): boolean {
  return !isNaN(d.getTime()) && d.getFullYear() > 1971
}

/**
 * Mask số điện thoại VN: 0xxxxxxxxx → 0xxx***xxx (giữ 3 đầu + 3 cuối)
 */
const PHONE_RE = /(?<![\d])(0\d{2,3})\d{2,4}(\d{3})(?![\d])/g
export function maskPhone(text: string | null | undefined): string {
  if (!text) return ''
  return String(text).replace(PHONE_RE, (_, a, b) => `${a}***${b}`)
}

/**
 * Chuyển content "raw" từ backend (có thể là JSON string, "[media attached: ...]", hoặc text)
 * thành text user-friendly để hiển thị trong list/search.
 */
export function prettifyContent(content: string | null | undefined, contentType?: string | null): string {
  if (!content) {
    if (contentType === 'IMAGE') return '🖼️ [hình ảnh]'
    if (contentType === 'VIDEO') return '🎬 [video]'
    if (contentType === 'FILE')  return '📎 [file]'
    if (contentType === 'VOICE') return '🎙️ [tin nhắn thoại]'
    if (contentType === 'STICKER') return '😊 [sticker]'
    return ''
  }
  // [media attached: <path> (mime) | <url>] — strip wrapper
  if (content.startsWith('[media attached:')) {
    const tail = content.split(']').slice(1).join(']').trim()
    const icon = contentType === 'VIDEO' ? '🎬' : contentType === 'FILE' ? '📎' : '🖼️'
    const text = tail ? `${icon} ${tail}` : `${icon} [${(contentType || 'media').toLowerCase()}]`
    return maskPhone(text)
  }
  // JSON từ link share — extract title/desc
  if (content.startsWith('{') && content.endsWith('}')) {
    try {
      const obj = JSON.parse(content)
      const title = obj.title || obj.name || obj.fileName
      const desc = obj.description || obj.desc
      const url = obj.href || obj.url
      const parts = [title, desc].filter(Boolean)
      if (parts.length) return maskPhone(`🔗 ${parts.join(' — ')}`)
      if (url) return `🔗 ${url}`
      return '🔗 [đường dẫn]'
    } catch {}
  }
  return maskPhone(content)
}

export function formatRelative(dateStr: string | Date | null): string {
  if (!dateStr) return '—'
  const d = typeof dateStr === 'string' ? new Date(dateStr) : dateStr
  if (!isValidDate(d)) return '—'
  const diff = Date.now() - d.getTime()
  const min = Math.floor(diff / 60_000)
  if (min < 1) return 'vừa xong'
  if (min < 60) return `${min} phút trước`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h} giờ trước`
  const day = Math.floor(h / 24)
  if (day < 7) return `${day} ngày trước`
  return d.toLocaleDateString('vi-VN')
}

export function formatTime(dateStr: string | Date | null): string {
  if (!dateStr) return '—'
  const d = typeof dateStr === 'string' ? new Date(dateStr) : dateStr
  if (!isValidDate(d)) return '—'
  return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
}

export function formatDateTime(dateStr: string | Date | null): string {
  if (!dateStr) return '—'
  const d = typeof dateStr === 'string' ? new Date(dateStr) : dateStr
  if (!isValidDate(d)) return '—'
  return d.toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })
}
