'use client'

import { useState } from 'react'
import { getToken, getTenantId } from '@/lib/api'

const API = process.env.NEXT_PUBLIC_API_URL ?? ''

type ExportItem = {
  id: string
  label: string
  desc: string
  icon: string
  color: string
  endpoint: string
  hasDateFilter?: boolean
}

const EXPORTS: ExportItem[] = [
  {
    id: 'messages',
    label: 'Tin nhắn',
    desc: 'Toàn bộ tin nhắn + kết quả AI phân loại',
    icon: '💬',
    color: 'bg-blue-50 dark:bg-blue-500/10 border-blue-200 dark:border-blue-500/30',
    endpoint: '/api/export/messages.csv',
    hasDateFilter: true,
  },
  {
    id: 'customers',
    label: 'Khách hàng',
    desc: 'Danh sách khách hàng, tag, doanh thu, lần liên hệ cuối',
    icon: '👥',
    color: 'bg-pink-50 dark:bg-pink-500/10 border-pink-200 dark:border-pink-500/30',
    endpoint: '/api/export/customers.csv',
  },
  {
    id: 'deals',
    label: 'Pipeline / Deals',
    desc: 'Tất cả deals, giai đoạn, giá trị, khách hàng liên quan',
    icon: '💼',
    color: 'bg-teal-50 dark:bg-teal-500/10 border-teal-200 dark:border-teal-500/30',
    endpoint: '/api/export/deals.csv',
  },
  {
    id: 'alerts',
    label: 'Cảnh báo',
    desc: 'Lịch sử cảnh báo, trạng thái xử lý, người được giao',
    icon: '🚨',
    color: 'bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/30',
    endpoint: '/api/export/alerts.csv',
  },
  {
    id: 'appointments',
    label: 'Lịch hẹn',
    desc: 'Danh sách lịch hẹn, thời gian, trạng thái nhắc nhở',
    icon: '📅',
    color: 'bg-orange-50 dark:bg-orange-500/10 border-orange-200 dark:border-orange-500/30',
    endpoint: '/api/export/appointments.csv',
  },
]

export default function ExportPage() {
  const [days, setDays] = useState('30')
  const [loading, setLoading] = useState<string | null>(null)

  async function download(item: ExportItem) {
    setLoading(item.id)
    try {
      const token    = getToken()
      const tenantId = getTenantId()
      const params   = item.hasDateFilter ? `?days=${days}` : ''
      const url      = `${API}${item.endpoint}${params}`

      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          'x-tenant-id': tenantId ?? '',
        },
      })
      if (!res.ok) throw new Error('Export thất bại')

      const blob = await res.blob()
      const href = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = href
      a.download = item.endpoint.split('/').pop() ?? 'export.csv'
      a.click()
      URL.revokeObjectURL(href)
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="p-4 md:p-8 max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900 dark:text-zinc-100">📤 Xuất dữ liệu</h1>
        <p className="text-sm text-gray-500 dark:text-zinc-400 mt-1">Tải về file CSV, mở bằng Excel hoặc Google Sheets</p>
      </div>

      {/* Date range for messages */}
      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-gray-100 dark:border-white/10 px-4 py-3 mb-4 flex items-center gap-3">
        <span className="text-sm text-gray-600 dark:text-zinc-400">Khoảng thời gian tin nhắn:</span>
        <select
          value={days}
          onChange={e => setDays(e.target.value)}
          className="text-sm bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-white/10 rounded-lg px-3 py-1.5 text-gray-800 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="7">7 ngày gần nhất</option>
          <option value="30">30 ngày gần nhất</option>
          <option value="90">90 ngày gần nhất</option>
          <option value="180">6 tháng</option>
          <option value="365">1 năm</option>
        </select>
      </div>

      {/* Export cards */}
      <div className="space-y-3">
        {EXPORTS.map(item => (
          <div key={item.id} className={`rounded-2xl border p-4 flex items-center gap-4 ${item.color}`}>
            <div className="text-3xl shrink-0">{item.icon}</div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-gray-900 dark:text-zinc-100">{item.label}</p>
              <p className="text-xs text-gray-500 dark:text-zinc-400 mt-0.5">{item.desc}</p>
              {item.hasDateFilter && (
                <p className="text-[11px] text-gray-400 dark:text-zinc-500 mt-0.5">📅 {days} ngày gần nhất</p>
              )}
            </div>
            <button
              onClick={() => download(item)}
              disabled={loading === item.id}
              className="shrink-0 px-4 py-2 bg-white dark:bg-zinc-800 hover:bg-gray-50 dark:hover:bg-zinc-700 border border-gray-200 dark:border-white/10 rounded-xl text-sm font-medium text-gray-700 dark:text-zinc-300 disabled:opacity-50 transition-colors flex items-center gap-2 shadow-sm"
            >
              {loading === item.id ? (
                <><span className="w-3.5 h-3.5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" /> Đang tải...</>
              ) : (
                <><span>↓</span> Tải CSV</>
              )}
            </button>
          </div>
        ))}
      </div>

      <div className="mt-6 bg-gray-50 dark:bg-zinc-800/50 rounded-xl px-4 py-3 text-xs text-gray-500 dark:text-zinc-400">
        💡 File CSV có BOM UTF-8 — mở bằng Excel sẽ hiện đúng tiếng Việt.
        Nếu dùng Google Sheets: File → Import → chọn file CSV.
      </div>
    </div>
  )
}
