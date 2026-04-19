'use client'

import { useEffect, useState } from 'react'
import { api, getTenantId } from '@/lib/api'

type Range = 'day' | 'week' | 'month'

type DigestResult = {
  digest: {
    tenantName: string
    rangeLabel: string
    date: string
    stats: {
      totalMessages: number
      activeGroups: number
      openAlerts: number
      newComplaints: number
      newOpportunities: number
    }
    urgentAlerts: Array<{ priority: string; label: string; summary: string; groupName: string }>
    opportunities: Array<{ groupName: string; summary: string }>
    topGroups: Array<{ name: string; category: string | null; messageCount: number }>
  }
  narrative: string | null
} | null

const RANGES: { key: Range; label: string }[] = [
  { key: 'day',   label: 'Hôm nay' },
  { key: 'week',  label: '7 ngày' },
  { key: 'month', label: '30 ngày' },
]

export function DigestModal({ onClose }: { onClose: () => void }) {
  const [data, setData] = useState<DigestResult>(null)
  const [loading, setLoading] = useState(true)
  const [range, setRange] = useState<Range>('day')

  useEffect(() => {
    const tenantId = getTenantId()
    if (!tenantId) return
    setLoading(true)
    api<DigestResult>('/api/digest/trigger', {
      method: 'POST',
      body: JSON.stringify({ tenantId, range }),
    }).then(d => { setData(d); setLoading(false) }).catch(() => setLoading(false))
  }, [range])

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end md:items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white dark:bg-zinc-900 dark:ring-1 dark:ring-white/10 rounded-3xl w-full max-w-xl max-h-[90vh] overflow-auto shadow-2xl" onClick={e => e.stopPropagation()}>
        {/* Handle bar */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-gray-300 dark:bg-white/20 rounded-full" />
        </div>

        <div className="p-6">
          <div className="text-center mb-5">
            <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-2xl">
              📊
            </div>
            <h3 className="text-xl font-bold text-gray-900 dark:text-zinc-100">Báo cáo</h3>
            {data && <p className="text-sm text-gray-500 dark:text-zinc-400 mt-1">{data.digest.tenantName} · {data.digest.rangeLabel ?? data.digest.date}</p>}
          </div>

          {/* Range selector — iOS segmented */}
          <div className="bg-gray-100 dark:bg-white/10 p-1 rounded-xl grid grid-cols-3 gap-0.5 mb-5">
            {RANGES.map(r => (
              <button
                key={r.key}
                onClick={() => setRange(r.key)}
                className={`py-2 rounded-lg text-sm font-medium transition-all ${
                  range === r.key ? 'bg-white dark:bg-white/15 text-gray-900 dark:text-zinc-100 shadow-sm' : 'text-gray-600 dark:text-zinc-400'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>

          {loading && (
            <div className="py-10 text-center text-gray-400 dark:text-zinc-500">
              <div className="inline-block animate-spin text-2xl">⏳</div>
              <p className="text-sm mt-2">Đang tổng hợp dữ liệu...</p>
            </div>
          )}

          {!loading && !data && (
            <div className="py-10 text-center">
              <p className="text-gray-500 dark:text-zinc-400 text-sm">Không có dữ liệu để tổng hợp.</p>
            </div>
          )}

          {data && (
            <>
              {/* AI narrative */}
              {data.narrative && (
                <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-500/15 dark:to-indigo-500/15 border border-blue-100 dark:border-blue-500/20 rounded-2xl p-4 mb-4">
                  <p className="text-xs font-semibold text-blue-700 dark:text-blue-300 mb-1.5">✨ Tóm tắt AI</p>
                  <p className="text-sm text-gray-900 dark:text-zinc-100 leading-relaxed whitespace-pre-wrap">{data.narrative}</p>
                </div>
              )}

              {/* Stats grid */}
              <div className="grid grid-cols-2 gap-2 mb-4">
                <Stat emoji="📨" label="Tin nhắn" value={data.digest.stats.totalMessages} tint="bg-blue-50 dark:bg-blue-500/10" />
                <Stat emoji="💬" label="Nhóm active" value={data.digest.stats.activeGroups} tint="bg-purple-50 dark:bg-purple-500/10" />
                <Stat emoji="🚨" label="Cảnh báo mở" value={data.digest.stats.openAlerts} tint="bg-red-50 dark:bg-red-500/10" highlight={data.digest.stats.openAlerts > 0} />
                <Stat emoji="💰" label="Cơ hội" value={data.digest.stats.newOpportunities} tint="bg-green-50 dark:bg-green-500/10" />
              </div>

              {/* Urgent alerts */}
              {data.digest.urgentAlerts.length > 0 && (
                <Section title="🚨 Cần xử lý">
                  {data.digest.urgentAlerts.map((a, i) => (
                    <div key={i} className="px-4 py-3 border-b last:border-0">
                      <p className="text-sm text-gray-900 dark:text-zinc-100 font-medium">{a.summary}</p>
                      <p className="text-xs text-gray-500 dark:text-zinc-400 mt-0.5">trong <span className="font-medium">{a.groupName}</span></p>
                    </div>
                  ))}
                </Section>
              )}

              {/* Top groups */}
              {data.digest.topGroups.length > 0 && (
                <Section title="📈 Nhóm hoạt động nhất">
                  {data.digest.topGroups.map((g, i) => (
                    <div key={i} className="px-4 py-3 border-b last:border-0 flex items-center justify-between">
                      <div>
                        <p className="text-sm text-gray-900 dark:text-zinc-100 font-medium">{g.name}</p>
                        {g.category && <p className="text-xs text-gray-500 dark:text-zinc-400">{g.category}</p>}
                      </div>
                      <span className="text-xs text-gray-500 dark:text-zinc-400 tabular-nums">{g.messageCount} tin</span>
                    </div>
                  ))}
                </Section>
              )}
            </>
          )}

          <button onClick={onClose} className="w-full mt-4 py-2.5 bg-gray-100 dark:bg-white/10 hover:bg-gray-200 dark:hover:bg-white/15 text-gray-700 dark:text-zinc-300 rounded-xl text-sm font-medium transition-colors">
            Đóng
          </button>
        </div>
      </div>
    </div>
  )
}

function Stat({ emoji, label, value, tint, highlight }: { emoji: string; label: string; value: number; tint: string; highlight?: boolean }) {
  return (
    <div className={`${tint} rounded-xl p-3 ${highlight ? 'ring-2 ring-red-200 dark:ring-red-500/30' : ''}`}>
      <div className="text-lg">{emoji}</div>
      <p className="text-xs text-gray-500 dark:text-zinc-400 mt-1">{label}</p>
      <p className="text-xl font-bold text-gray-900 dark:text-zinc-100 tabular-nums">{value}</p>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <p className="text-xs font-semibold text-gray-500 dark:text-zinc-400 uppercase tracking-wider px-1 mb-1.5">{title}</p>
      <div className="bg-gray-50 dark:bg-white/5 rounded-2xl overflow-hidden">{children}</div>
    </div>
  )
}
