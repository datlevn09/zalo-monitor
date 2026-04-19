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

export function formatRelative(dateStr: string | Date | null): string {
  if (!dateStr) return '—'
  const d = typeof dateStr === 'string' ? new Date(dateStr) : dateStr
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
  return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
}

export function formatDateTime(dateStr: string | Date | null): string {
  if (!dateStr) return '—'
  const d = typeof dateStr === 'string' ? new Date(dateStr) : dateStr
  return d.toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })
}
