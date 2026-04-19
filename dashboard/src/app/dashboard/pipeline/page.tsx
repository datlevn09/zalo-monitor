'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'

type Deal = {
  id: string
  title: string
  stage: 'NEW' | 'CONTACTED' | 'INTERESTED' | 'PROPOSAL' | 'WON' | 'LOST'
  value: number
  description: string | null
  customer?: { id: string; name: string | null; phone: string | null; tag: string } | null
}

const STAGES = [
  { key: 'NEW',        label: '🆕 Mới',        color: 'bg-gray-50 dark:bg-white/5',          border: 'border-gray-200 dark:border-white/10' },
  { key: 'CONTACTED',  label: '📞 Đã liên hệ', color: 'bg-blue-50 dark:bg-blue-500/10',      border: 'border-blue-200 dark:border-blue-500/20' },
  { key: 'INTERESTED', label: '🎯 Quan tâm',    color: 'bg-indigo-50 dark:bg-indigo-500/10',  border: 'border-indigo-200 dark:border-indigo-500/20' },
  { key: 'PROPOSAL',   label: '📄 Đề xuất',     color: 'bg-purple-50 dark:bg-purple-500/10',  border: 'border-purple-200 dark:border-purple-500/20' },
  { key: 'WON',        label: '✅ Won',         color: 'bg-green-50 dark:bg-green-500/10',    border: 'border-green-200 dark:border-green-500/20' },
  { key: 'LOST',       label: '❌ Lost',        color: 'bg-red-50 dark:bg-red-500/10',        border: 'border-red-200 dark:border-red-500/20' },
] as const

export default function PipelinePage() {
  const [deals, setDeals] = useState<Deal[]>([])
  const [showNew, setShowNew] = useState(false)
  const [newDeal, setNewDeal] = useState({ title: '', value: '' })

  function load() {
    api<Deal[]>('/api/deals').then(setDeals)
  }
  useEffect(() => { load() }, [])

  async function moveDeal(id: string, stage: string) {
    await api(`/api/deals/${id}`, { method: 'PATCH', body: JSON.stringify({ stage }) })
    load()
  }

  async function create() {
    if (!newDeal.title) return
    await api('/api/deals', {
      method: 'POST',
      body: JSON.stringify({ title: newDeal.title, value: Number(newDeal.value) || 0 }),
    })
    setNewDeal({ title: '', value: '' })
    setShowNew(false)
    load()
  }

  async function del(id: string) {
    if (!confirm('Xoá deal này?')) return
    await api(`/api/deals/${id}`, { method: 'DELETE' })
    load()
  }

  const totals = STAGES.map(s => ({
    ...s,
    deals: deals.filter(d => d.stage === s.key),
    totalValue: deals.filter(d => d.stage === s.key).reduce((sum, d) => sum + d.value, 0),
  }))

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      <div className="mb-6 flex items-start md:items-center justify-between flex-col md:flex-row gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-zinc-100 tracking-tight">💼 Pipeline</h1>
          <p className="text-gray-500 dark:text-zinc-400 mt-1 text-sm">
            {deals.length} deals · Tổng value: {deals.reduce((s, d) => s + d.value, 0).toLocaleString('vi-VN')}đ
          </p>
        </div>
        <button onClick={() => setShowNew(true)}
          className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded-full transition-colors">
          + Deal mới
        </button>
      </div>

      {/* New deal modal */}
      {showNew && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowNew(false)}>
          <div className="bg-white dark:bg-zinc-900 dark:ring-1 dark:ring-white/5 rounded-3xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-4">Thêm deal mới</h3>
            <input value={newDeal.title} onChange={e => setNewDeal({ ...newDeal, title: e.target.value })}
              placeholder="Tên deal (VD: Khách A - 5 căn hộ)"
              className="w-full mb-3 px-4 py-2.5 bg-gray-50 dark:bg-white/5 rounded-xl text-sm border-0 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <input value={newDeal.value} onChange={e => setNewDeal({ ...newDeal, value: e.target.value })}
              placeholder="Giá trị (VND)" type="number"
              className="w-full mb-4 px-4 py-2.5 bg-gray-50 dark:bg-white/5 rounded-xl text-sm border-0 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <div className="flex gap-2">
              <button onClick={() => setShowNew(false)}
                className="flex-1 py-2.5 bg-gray-100 dark:bg-white/10 hover:bg-gray-200 dark:hover:bg-white/15 text-gray-700 dark:text-zinc-300 rounded-xl text-sm font-medium">Huỷ</button>
              <button onClick={create}
                className="flex-1 py-2.5 bg-blue-500 hover:bg-blue-600 text-white rounded-xl text-sm font-medium">Tạo</button>
            </div>
          </div>
        </div>
      )}

      {/* Kanban */}
      <div className="overflow-x-auto pb-4">
        <div className="flex gap-3 md:gap-4 min-w-max">
          {totals.map(col => (
            <div key={col.key} className={`w-72 shrink-0 rounded-2xl ${col.color} border ${col.border} p-3`}>
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-semibold text-gray-900 dark:text-zinc-100">{col.label}</p>
                <span className="text-xs text-gray-500 dark:text-zinc-400 tabular-nums">{col.deals.length}</span>
              </div>
              {col.totalValue > 0 && (
                <p className="text-xs text-gray-500 dark:text-zinc-400 mb-3 font-medium">
                  Σ {col.totalValue.toLocaleString('vi-VN')}đ
                </p>
              )}
              <div className="space-y-2">
                {col.deals.map(d => (
                  <div key={d.id} className="bg-white dark:bg-zinc-800/80 dark:ring-1 dark:ring-white/5 rounded-xl p-3 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
                    <p className="text-sm font-medium text-gray-900 dark:text-zinc-100">{d.title}</p>
                    {d.value > 0 && (
                      <p className="text-xs font-semibold text-gray-700 dark:text-zinc-300 mt-1 tabular-nums">
                        {d.value.toLocaleString('vi-VN')}đ
                      </p>
                    )}
                    {d.customer && (
                      <p className="text-xs text-gray-500 dark:text-zinc-400 mt-1">
                        👤 {d.customer.name ?? d.customer.phone}
                      </p>
                    )}
                    <div className="flex items-center gap-1.5 mt-2">
                      <select value={d.stage} onChange={e => moveDeal(d.id, e.target.value)}
                        className="flex-1 text-xs bg-gray-50 dark:bg-white/10 border-0 rounded-md px-2 py-1 text-gray-700 dark:text-zinc-200 cursor-pointer">
                        {STAGES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                      </select>
                      <button onClick={() => del(d.id)} className="text-xs text-gray-400 dark:text-zinc-500 hover:text-red-500">🗑</button>
                    </div>
                  </div>
                ))}
                {col.deals.length === 0 && (
                  <p className="text-xs text-gray-400 dark:text-zinc-500 text-center py-4">Chưa có</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
