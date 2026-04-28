'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { api } from '@/lib/api'
import { LABEL_CFG, formatRelative, prettifyContent } from '@/lib/format'

type SearchResult = {
  messages: Array<{
    id: string
    senderName: string | null
    content: string | null
    sentAt: string
    group: { id: string; name: string; channelType: string }
    analysis: { label: keyof typeof LABEL_CFG; priority: string; reason: string | null } | null
  }>
  totalCount: number
}

const LABELS = ['', 'OPPORTUNITY', 'COMPLAINT', 'RISK', 'POSITIVE', 'NEUTRAL']
const DAYS = [7, 30, 90]

export default function SearchPage() {
  const [q, setQ] = useState('')
  const [label, setLabel] = useState('')
  const [days, setDays] = useState(30)
  const [result, setResult] = useState<SearchResult | null>(null)
  const [loading, setLoading] = useState(false)

  async function doSearch() {
    setLoading(true)
    const params = new URLSearchParams({ days: String(days) })
    if (q) params.set('q', q)
    if (label) params.set('label', label)
    try {
      const r = await api<SearchResult>(`/api/search?${params}`)
      setResult(r)
    } finally { setLoading(false) }
  }

  useEffect(() => { doSearch() }, [label, days])

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-zinc-100 tracking-tight">🔍 Tìm kiếm</h1>
        <p className="text-gray-500 dark:text-zinc-400 mt-1 text-sm">Tìm tin nhắn trong tất cả các nhóm</p>
      </div>

      {/* Search bar */}
      <form onSubmit={e => { e.preventDefault(); doSearch() }} className="mb-4 relative">
        <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 dark:text-zinc-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
        </svg>
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Từ khoá: hoàn tiền, giá bao nhiêu, khiếu nại..."
          className="w-full pl-12 pr-4 py-3.5 bg-white dark:bg-zinc-900 dark:ring-1 dark:ring-white/5 rounded-2xl text-sm border-0 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
        />
      </form>

      {/* Filters */}
      <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-2 -mx-4 px-4 md:mx-0 md:px-0">
        <div className="text-xs text-gray-500 dark:text-zinc-400 shrink-0">Lọc:</div>
        <select value={label} onChange={e => setLabel(e.target.value)}
          className="text-xs bg-white dark:bg-white/10 rounded-full px-3 py-1.5 shadow-[0_1px_2px_rgba(0,0,0,0.04)] border-0 focus:outline-none">
          {LABELS.map(l => <option key={l} value={l}>{l ? (LABEL_CFG[l as keyof typeof LABEL_CFG]?.label ?? l) : 'Tất cả nhãn'}</option>)}
        </select>
        {DAYS.map(d => (
          <button key={d} onClick={() => setDays(d)}
            className={`text-xs px-3 py-1.5 rounded-full shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-colors ${
              days === d ? 'bg-blue-500 text-white' : 'bg-white dark:bg-white/10 text-gray-700 dark:text-zinc-300'
            }`}
          >{d} ngày</button>
        ))}
      </div>

      {/* Results */}
      <div className="bg-white dark:bg-zinc-900 dark:ring-1 dark:ring-white/5 rounded-2xl shadow-[0_1px_2px_rgba(0,0,0,0.04)] overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 dark:border-white/5 flex items-center justify-between">
          <p className="text-sm text-gray-500 dark:text-zinc-400">
            {loading ? 'Đang tìm...' : `${result?.totalCount ?? 0} kết quả`}
          </p>
        </div>

        <div className="divide-y divide-gray-100 dark:divide-white/5">
          {(result?.messages ?? []).map(m => {
            const cfg = m.analysis ? LABEL_CFG[m.analysis.label] : null
            return (
              <Link
                key={m.id}
                href={`/dashboard/groups/${m.group.id}`}
                className="block px-5 py-3.5 hover:bg-gray-50 dark:hover:bg-white/5"
              >
                <div className="flex items-baseline gap-2 mb-1">
                  <span className="text-xs font-semibold text-gray-700 dark:text-zinc-300">{m.senderName ?? 'Ẩn danh'}</span>
                  <span className="text-xs text-gray-400 dark:text-zinc-500">trong {m.group.name}</span>
                  <span className="text-xs text-gray-400 dark:text-zinc-500 ml-auto">{formatRelative(m.sentAt)}</span>
                </div>
                <p className="text-sm text-gray-900 dark:text-zinc-100 line-clamp-2" dangerouslySetInnerHTML={{
                  __html: highlight(prettifyContent(m.content, (m as any).contentType), q),
                }} />
                {cfg && (
                  <span className={`inline-flex items-center gap-1 mt-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold ${cfg.color} border`}>
                    {cfg.icon} {cfg.label}
                  </span>
                )}
              </Link>
            )
          })}

          {result && result.messages.length === 0 && !loading && (
            <div className="p-10 text-center text-gray-400 dark:text-zinc-500">
              <p className="text-sm">Không tìm thấy kết quả</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function highlight(text: string, q: string): string {
  if (!q) return escapeHtml(text)
  const escapedText = escapeHtml(text)
  const safe = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return escapedText.replace(new RegExp(safe, 'gi'), m => `<mark class="bg-yellow-200 dark:bg-yellow-500/30 dark:text-yellow-100 rounded px-0.5">${m}</mark>`)
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
