'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'

type TrendPoint = { day: string; messages: number; alerts: number }

export function TrendChart() {
  const [data, setData] = useState<TrendPoint[]>([])

  useEffect(() => {
    api<TrendPoint[]>('/api/stats/trend?days=7').then(setData).catch(() => undefined)
  }, [])

  if (data.length === 0) return null

  const maxMsg = Math.max(...data.map(d => d.messages), 1)
  const maxAlert = Math.max(...data.map(d => d.alerts), 1)

  return (
    <div className="bg-white dark:bg-zinc-900 dark:ring-1 dark:ring-white/5 rounded-2xl shadow-[0_1px_2px_rgba(0,0,0,0.04)] p-5 mb-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-base font-semibold text-gray-900 dark:text-zinc-100">7 ngày qua</h3>
          <p className="text-xs text-gray-500 dark:text-zinc-400 mt-0.5">Xu hướng tin nhắn & cảnh báo</p>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded bg-blue-500" />
            <span className="text-gray-600 dark:text-zinc-400">Tin nhắn</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded bg-red-500" />
            <span className="text-gray-600 dark:text-zinc-400">Cảnh báo</span>
          </div>
        </div>
      </div>

      <div className="flex items-end gap-2 h-32">
        {data.map((d, i) => {
          const dt = new Date(d.day)
          const dayLabel = ['CN','T2','T3','T4','T5','T6','T7'][dt.getDay()]
          const msgPct = (d.messages / maxMsg) * 100
          const alertPct = (d.alerts / maxAlert) * 100

          return (
            <div key={i} className="flex-1 flex flex-col items-center gap-1">
              <div className="w-full flex items-end justify-center gap-0.5 h-full">
                <div
                  className="w-1/2 bg-gradient-to-t from-blue-400 to-blue-500 rounded-t transition-all hover:opacity-80"
                  style={{ height: `${Math.max(msgPct, d.messages > 0 ? 4 : 0)}%` }}
                  title={`${d.messages} tin nhắn`}
                />
                {d.alerts > 0 && (
                  <div
                    className="w-1/3 bg-gradient-to-t from-red-400 to-red-500 rounded-t"
                    style={{ height: `${Math.max(alertPct, 6)}%` }}
                    title={`${d.alerts} cảnh báo`}
                  />
                )}
              </div>
              <div className="text-center">
                <p className="text-[11px] text-gray-600 dark:text-zinc-400 font-medium tabular-nums">{d.messages}</p>
                <p className="text-[10px] text-gray-400 dark:text-zinc-500">{dayLabel}</p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
