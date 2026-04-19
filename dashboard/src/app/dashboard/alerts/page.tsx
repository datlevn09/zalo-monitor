'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { api, connectWebSocket } from '@/lib/api'
import { LABEL_CFG, PRIORITY_CFG, formatRelative } from '@/lib/format'
import { channelDeepLink } from '@/lib/deeplink'

type Alert = {
  id: string
  groupId: string
  messageId: string | null
  label: keyof typeof LABEL_CFG
  priority: keyof typeof PRIORITY_CFG
  summary: string
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'IGNORED'
  createdAt: string
  resolvedAt: string | null
  group: { name: string; category: string | null; externalId?: string; channelType?: string }
}

const TABS = [
  { key: 'OPEN',        label: 'Cần xử lý', color: 'text-red-600' },
  { key: 'IN_PROGRESS', label: 'Đang xử lý', color: 'text-yellow-600' },
  { key: 'RESOLVED',    label: 'Đã xong',   color: 'text-green-600' },
  { key: 'ALL',         label: 'Tất cả',    color: 'text-gray-600' },
] as const

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [tab, setTab] = useState<typeof TABS[number]['key']>('OPEN')
  const [loading, setLoading] = useState(true)

  const load = () => {
    const q = tab === 'ALL' ? '' : `?status=${tab}`
    api<Alert[]>(`/api/alerts${q}`).then(a => { setAlerts(a); setLoading(false) })
  }

  useEffect(() => {
    setLoading(true)
    load()
  }, [tab])

  useEffect(() => {
    const close = connectWebSocket((event) => {
      if (event === 'alert:new') load()
    })
    return () => close()
  }, [])

  async function updateStatus(id: string, status: 'IN_PROGRESS' | 'RESOLVED' | 'IGNORED') {
    setAlerts(as => as.map(a => a.id === id ? { ...a, status } : a))
    await api(`/api/alerts/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) })
  }

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-zinc-100 tracking-tight">Cảnh báo</h1>
        <p className="text-gray-500 dark:text-zinc-400 mt-1">Tin nhắn cần chú ý từ AI phân tích</p>
      </div>

      {/* iOS segmented control */}
      <div className="mb-4 bg-gray-200/60 dark:bg-white/10 p-1 rounded-xl grid grid-cols-4 gap-0.5">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`py-2 rounded-lg text-sm font-medium transition-all ${
              tab === t.key
                ? 'bg-white dark:bg-white/15 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-600 dark:text-zinc-400 hover:text-gray-800'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Alerts list */}
      <div className="space-y-3">
        {loading && (
          <div className="bg-white dark:bg-zinc-900 dark:ring-1 dark:ring-white/5 rounded-2xl p-10 text-center text-gray-400 dark:text-zinc-500">
            Đang tải...
          </div>
        )}

        {!loading && alerts.length === 0 && (
          <div className="bg-white dark:bg-zinc-900 dark:ring-1 dark:ring-white/5 rounded-2xl p-10 text-center">
            <div className="text-5xl mb-3">🎉</div>
            <p className="text-gray-600 dark:text-zinc-400 font-medium">Không có cảnh báo nào</p>
            <p className="text-sm text-gray-400 dark:text-zinc-500 mt-1">Mọi thứ đang ổn định!</p>
          </div>
        )}

        {alerts.map(alert => {
          const label = LABEL_CFG[alert.label]
          const priority = PRIORITY_CFG[alert.priority]
          return (
            <div key={alert.id} className="bg-white dark:bg-zinc-900 dark:ring-1 dark:ring-white/5 rounded-2xl p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
              <div className="flex items-start gap-3">
                {/* Label icon */}
                <div className={`w-11 h-11 rounded-2xl ${label.color} border flex items-center justify-center text-xl shrink-0`}>
                  {label.icon}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${label.color} border`}>
                      {label.label}
                    </span>
                    <span className="inline-flex items-center gap-1 text-xs">
                      <span className={`w-1.5 h-1.5 rounded-full ${priority.dot}`} />
                      <span className={priority.color}>{priority.label}</span>
                    </span>
                    <span className="text-xs text-gray-400 dark:text-zinc-500 ml-auto">{formatRelative(alert.createdAt)}</span>
                  </div>

                  <p className="text-sm font-medium text-gray-900 dark:text-zinc-100 mt-2">{alert.summary}</p>

                  <div className="flex items-center gap-2 mt-1.5 text-xs">
                    <Link
                      href={`/dashboard/groups/${alert.groupId}`}
                      className="inline-flex items-center gap-1 text-blue-500 hover:underline"
                    >
                      <span>trong</span>
                      <span className="font-medium">{alert.group.name}</span>
                      <ChevronRight className="w-3 h-3" />
                    </Link>
                    {alert.group.externalId && alert.group.channelType && (() => {
                      const link = channelDeepLink(alert.group.channelType, alert.group.externalId)
                      return link ? (
                        <a href={link} target="_blank" rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 dark:bg-blue-500/10 text-blue-700 rounded-full hover:bg-blue-100 dark:hover:bg-blue-500/20 transition-colors"
                        >
                          <span>Mở {alert.group.channelType === 'ZALO' ? 'Zalo' : 'Telegram'}</span>
                          <span className="text-[10px]">↗</span>
                        </a>
                      ) : null
                    })()}
                  </div>

                  {/* Actions */}
                  {alert.status === 'OPEN' && (
                    <div className="flex gap-2 mt-3">
                      <button
                        onClick={() => updateStatus(alert.id, 'IN_PROGRESS')}
                        className="flex-1 px-3 py-2 bg-yellow-50 dark:bg-yellow-500/10 hover:bg-yellow-100 dark:hover:bg-yellow-500/20 text-yellow-800 rounded-xl text-xs font-medium transition-colors"
                      >
                        Đang xử lý
                      </button>
                      <button
                        onClick={() => updateStatus(alert.id, 'RESOLVED')}
                        className="flex-1 px-3 py-2 bg-green-50 dark:bg-green-500/10 hover:bg-green-100 dark:hover:bg-green-500/20 text-green-800 rounded-xl text-xs font-medium transition-colors"
                      >
                        ✓ Đã xong
                      </button>
                      <button
                        onClick={() => updateStatus(alert.id, 'IGNORED')}
                        className="px-3 py-2 bg-gray-50 dark:bg-white/5 hover:bg-gray-100 dark:hover:bg-white/10 text-gray-600 dark:text-zinc-400 rounded-xl text-xs font-medium transition-colors"
                      >
                        Bỏ qua
                      </button>
                    </div>
                  )}

                  {alert.status === 'IN_PROGRESS' && (
                    <button
                      onClick={() => updateStatus(alert.id, 'RESOLVED')}
                      className="mt-3 w-full px-3 py-2 bg-green-500 hover:bg-green-600 text-white rounded-xl text-xs font-medium transition-colors"
                    >
                      ✓ Đánh dấu đã xong
                    </button>
                  )}

                  {alert.status === 'RESOLVED' && (
                    <p className="text-xs text-green-600 mt-2 flex items-center gap-1">
                      ✓ Đã xử lý {alert.resolvedAt ? formatRelative(alert.resolvedAt) : ''}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ChevronRight(p: React.SVGProps<SVGSVGElement>) {
  return <svg {...p} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/></svg>
}
