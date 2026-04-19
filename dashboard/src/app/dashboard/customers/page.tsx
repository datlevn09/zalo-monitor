'use client'

import { useEffect, useState } from 'react'
import { api, API_URL } from '@/lib/api'
import { formatRelative } from '@/lib/format'
import { zaloChatUserLink } from '@/lib/deeplink'

type Customer = {
  id: string
  name: string | null
  phone: string | null
  email: string | null
  zaloId: string | null
  avatarUrl: string | null
  tag: 'HOT' | 'WARM' | 'COLD' | 'CLOSED_WON' | 'CLOSED_LOST'
  note: string | null
  revenue: number
  totalMessages: number
  lastActivity: string
  firstSeen: string
}

const TAG_CFG = {
  HOT:         { label: '🔥 Hot',      color: 'bg-red-50 dark:bg-red-500/15 text-red-700 dark:text-red-300 border-red-200 dark:border-red-500/30' },
  WARM:        { label: '🌡️ Warm',    color: 'bg-orange-50 dark:bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-500/30' },
  COLD:        { label: '❄️ Cold',    color: 'bg-blue-50 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-500/30' },
  CLOSED_WON:  { label: '✅ Đã chốt', color: 'bg-green-50 dark:bg-green-500/15 text-green-700 dark:text-green-300 border-green-200 dark:border-green-500/30' },
  CLOSED_LOST: { label: '❌ Đã mất',  color: 'bg-gray-50 dark:bg-white/10 text-gray-600 dark:text-zinc-400 border-gray-200 dark:border-white/10' },
} as const

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [search, setSearch] = useState('')
  const [tagFilter, setTagFilter] = useState<string>('')
  const [selected, setSelected] = useState<Customer | null>(null)

  function load() {
    const params = new URLSearchParams()
    if (search) params.set('search', search)
    if (tagFilter) params.set('tag', tagFilter)
    api<Customer[]>(`/api/customers?${params}`).then(setCustomers)
  }
  useEffect(() => { load() }, [tagFilter])

  async function updateTag(id: string, tag: string) {
    await api(`/api/customers/${id}`, { method: 'PATCH', body: JSON.stringify({ tag }) })
    load()
  }

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      <div className="mb-6 flex items-start md:items-center justify-between flex-col md:flex-row gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-zinc-100 tracking-tight">👥 Khách hàng</h1>
          <p className="text-gray-500 dark:text-zinc-400 mt-1 text-sm">{customers.length} khách · tự động trích xuất từ tin nhắn</p>
        </div>
        <div className="flex gap-2">
          <button onClick={async () => {
            await api('/api/zalo/sync-avatars', { method: 'POST' }); load()
          }} className="px-4 py-2 bg-white dark:bg-white/10 border border-gray-200 dark:border-white/10 hover:bg-gray-50 dark:hover:bg-white/15 text-gray-700 dark:text-zinc-300 text-sm font-medium rounded-full">
            🔄 Sync avatar
          </button>
          <a href={`${API_URL}/api/export/customers.csv`} download
            className="px-4 py-2 bg-gray-900 dark:bg-white/15 text-white text-sm font-medium rounded-full hover:bg-gray-800 dark:hover:bg-white/20">
            📥 Export CSV
          </a>
        </div>
      </div>

      {/* Search + filters */}
      <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 mb-4">
        <form onSubmit={e => { e.preventDefault(); load() }} className="relative">
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Tìm tên / phone / email..."
            className="w-full px-4 py-2.5 bg-white dark:bg-zinc-900 dark:ring-1 dark:ring-white/5 rounded-2xl text-sm border-0 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
          />
        </form>
        <div className="flex gap-1.5 overflow-x-auto">
          <button onClick={() => setTagFilter('')}
            className={`shrink-0 px-3 py-2 rounded-full text-xs font-medium transition-colors ${
              !tagFilter ? 'bg-gray-900 dark:bg-white/15 text-white' : 'bg-white dark:bg-white/10 text-gray-700 dark:text-zinc-300'
            }`}
          >Tất cả</button>
          {Object.entries(TAG_CFG).map(([k, v]) => (
            <button key={k} onClick={() => setTagFilter(k)}
              className={`shrink-0 px-3 py-2 rounded-full text-xs font-medium transition-colors ${
                tagFilter === k ? 'bg-gray-900 dark:bg-white/15 text-white' : `${v.color} border`
              }`}
            >{v.label}</button>
          ))}
        </div>
      </div>

      {/* Customer list */}
      <div className="bg-white dark:bg-zinc-900 dark:ring-1 dark:ring-white/5 rounded-2xl shadow-[0_1px_2px_rgba(0,0,0,0.04)] overflow-hidden">
        <div className="divide-y divide-gray-100 dark:divide-white/5">
          {customers.map(c => {
            const tag = TAG_CFG[c.tag]
            const zaloLink = zaloChatUserLink({ phone: c.phone, zaloId: c.zaloId })
            return (
              <div key={c.id} className="px-4 py-3 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-white/5">
                {/* Avatar - click → Zalo chat */}
                <a
                  href={zaloLink ?? '#'}
                  target={zaloLink ? '_blank' : undefined}
                  rel="noopener noreferrer"
                  onClick={e => !zaloLink && e.preventDefault()}
                  className="shrink-0 relative group"
                  title={zaloLink ? 'Mở Zalo chat' : 'Không có link Zalo'}
                >
                  {c.avatarUrl ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={c.avatarUrl} alt={c.name ?? ''} className="w-11 h-11 rounded-full object-cover" />
                  ) : (
                    <div className="w-11 h-11 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white font-bold">
                      {(c.name ?? c.phone ?? '?')[0]}
                    </div>
                  )}
                  {zaloLink && (
                    <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-blue-500 rounded-full flex items-center justify-center text-[8px] text-white font-bold shadow-md ring-2 ring-white">Z</div>
                  )}
                </a>

                {/* Info + click-to-chat */}
                <a
                  href={zaloLink ?? '#'}
                  target={zaloLink ? '_blank' : undefined}
                  rel="noopener noreferrer"
                  onClick={e => !zaloLink && e.preventDefault()}
                  className="flex-1 min-w-0 hover:opacity-80"
                >
                  <p className="text-sm font-semibold text-gray-900 dark:text-zinc-100 truncate flex items-center gap-1.5">
                    {c.name ?? 'Chưa có tên'}
                    {zaloLink && <span className="text-xs text-blue-500">↗</span>}
                  </p>
                  <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-zinc-400 mt-0.5">
                    {c.phone && <span>📞 {c.phone}</span>}
                    {c.email && <span>✉️ {c.email}</span>}
                    <span>{c.totalMessages} tin · {formatRelative(c.lastActivity)}</span>
                  </div>
                </a>

                <select value={c.tag} onChange={e => updateTag(c.id, e.target.value)}
                  onClick={e => e.stopPropagation()}
                  className={`text-xs border-0 rounded-lg px-2 py-1.5 cursor-pointer ${tag.color} border`}>
                  {Object.entries(TAG_CFG).map(([k, v]) => (
                    <option key={k} value={k}>{v.label}</option>
                  ))}
                </select>
              </div>
            )
          })}
          {customers.length === 0 && (
            <div className="p-10 text-center text-gray-400 dark:text-zinc-500 text-sm">
              Chưa có khách. AI sẽ tự trích xuất phone/email từ tin nhắn khi có tin mới.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
