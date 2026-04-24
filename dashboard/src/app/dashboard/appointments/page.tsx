'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'

type Appointment = {
  id: string
  title: string
  description: string | null
  scheduledAt: string
  remindBefore: number
  reminderSent: boolean
  status: 'UPCOMING' | 'DONE' | 'CANCELLED'
  assignedTo: string | null
}

const STATUS_CFG = {
  UPCOMING:  { label: 'Sắp diễn ra', color: 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300' },
  DONE:      { label: 'Đã xong',     color: 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-300' },
  CANCELLED: { label: 'Đã huỷ',      color: 'bg-gray-100 text-gray-500 dark:bg-white/10 dark:text-zinc-400' },
}

const REMIND_OPTIONS = [
  { value: 10,  label: '10 phút trước' },
  { value: 30,  label: '30 phút trước' },
  { value: 60,  label: '1 giờ trước' },
  { value: 120, label: '2 giờ trước' },
  { value: 1440,label: '1 ngày trước' },
]

function toLocalDatetimeInput(iso: string) {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const emptyForm = { title: '', description: '', scheduledAt: '', remindBefore: 30 }

export default function AppointmentsPage() {
  const [appts, setAppts] = useState<Appointment[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [editId, setEditId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [filterStatus, setFilterStatus] = useState<string>('UPCOMING')

  const load = () => {
    setLoading(true)
    api<Appointment[]>(`/api/appointments${filterStatus ? `?status=${filterStatus}` : ''}`)
      .then(setAppts).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [filterStatus])

  function openNew() {
    setEditId(null)
    const now = new Date(Date.now() + 60 * 60_000)
    const pad = (n: number) => String(n).padStart(2, '0')
    const defaultDt = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`
    setForm({ title: '', description: '', scheduledAt: defaultDt, remindBefore: 30 })
    setShowForm(true)
  }

  function openEdit(a: Appointment) {
    setEditId(a.id)
    setForm({ title: a.title, description: a.description ?? '', scheduledAt: toLocalDatetimeInput(a.scheduledAt), remindBefore: a.remindBefore })
    setShowForm(true)
  }

  async function save() {
    if (!form.title || !form.scheduledAt) return
    setSaving(true)
    try {
      const body = { ...form, scheduledAt: new Date(form.scheduledAt).toISOString() }
      if (editId) {
        await api(`/api/appointments/${editId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      } else {
        await api('/api/appointments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      }
      setShowForm(false)
      load()
    } finally {
      setSaving(false)
    }
  }

  async function updateStatus(id: string, status: string) {
    await api(`/api/appointments/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) })
    load()
  }

  async function remove(id: string) {
    if (!confirm('Xoá lịch hẹn này?')) return
    await api(`/api/appointments/${id}`, { method: 'DELETE' })
    load()
  }

  const upcoming = appts.filter(a => a.status === 'UPCOMING')
  const past     = appts.filter(a => a.status !== 'UPCOMING')

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-zinc-100">📅 Lịch hẹn</h1>
          <p className="text-sm text-gray-500 dark:text-zinc-400 mt-0.5">Nhắc nhở tự động qua Telegram</p>
        </div>
        <button onClick={openNew} className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded-xl transition-colors">
          + Thêm lịch
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 mb-4">
        {(['UPCOMING', 'DONE', 'CANCELLED', ''] as const).map(s => (
          <button
            key={s}
            onClick={() => setFilterStatus(s)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              filterStatus === s
                ? 'bg-blue-500 text-white'
                : 'bg-white dark:bg-zinc-800 text-gray-600 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-zinc-700'
            }`}
          >
            {s === '' ? 'Tất cả' : STATUS_CFG[s as keyof typeof STATUS_CFG]?.label ?? s}
          </button>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <div className="text-center py-12 text-gray-400">Đang tải...</div>
      ) : appts.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-5xl mb-3">📅</div>
          <p className="text-gray-600 dark:text-zinc-400 font-medium">Chưa có lịch hẹn</p>
          <p className="text-sm text-gray-400 dark:text-zinc-500 mt-1">Thêm lịch hẹn để nhận nhắc nhở tự động</p>
        </div>
      ) : (
        <div className="space-y-2">
          {appts.map(a => {
            const cfg = STATUS_CFG[a.status]
            const dt  = new Date(a.scheduledAt)
            const isToday = dt.toDateString() === new Date().toDateString()
            const isPast  = dt < new Date() && a.status === 'UPCOMING'
            return (
              <div key={a.id} className={`bg-white dark:bg-zinc-900 rounded-2xl p-4 border ${
                isPast ? 'border-orange-200 dark:border-orange-500/30' : 'border-gray-100 dark:border-white/10'
              } shadow-[0_1px_3px_rgba(0,0,0,0.04)]`}>
                <div className="flex items-start gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0 ${
                    a.status === 'UPCOMING' ? 'bg-blue-50 dark:bg-blue-500/10' : 'bg-gray-50 dark:bg-white/5'
                  }`}>
                    {a.status === 'DONE' ? '✅' : a.status === 'CANCELLED' ? '🚫' : isPast ? '⚠️' : '📅'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-gray-900 dark:text-zinc-100 truncate">{a.title}</p>
                      <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${cfg.color}`}>{cfg.label}</span>
                      {a.reminderSent && <span className="text-[11px] text-gray-400">🔔 Đã nhắc</span>}
                    </div>
                    <p className={`text-sm mt-0.5 font-medium ${isPast ? 'text-orange-500' : isToday ? 'text-blue-500' : 'text-gray-600 dark:text-zinc-400'}`}>
                      {dt.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'short', timeStyle: 'short' })}
                      {isToday && <span className="ml-1 text-xs">(Hôm nay)</span>}
                      {isPast  && <span className="ml-1 text-xs">(Đã qua)</span>}
                    </p>
                    {a.description && <p className="text-xs text-gray-500 dark:text-zinc-400 mt-1 line-clamp-2">{a.description}</p>}
                    <p className="text-[11px] text-gray-400 dark:text-zinc-500 mt-1">
                      ⏰ Nhắc trước {REMIND_OPTIONS.find(o => o.value === a.remindBefore)?.label ?? `${a.remindBefore} phút`}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {a.status === 'UPCOMING' && (
                      <button onClick={() => updateStatus(a.id, 'DONE')} title="Đánh dấu đã xong"
                        className="w-7 h-7 rounded-lg hover:bg-green-50 dark:hover:bg-green-500/10 flex items-center justify-center text-gray-400 hover:text-green-500 transition-colors text-base">
                        ✓
                      </button>
                    )}
                    <button onClick={() => openEdit(a)} title="Sửa"
                      className="w-7 h-7 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 flex items-center justify-center text-gray-400 transition-colors">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                      </svg>
                    </button>
                    <button onClick={() => remove(a.id)} title="Xoá"
                      className="w-7 h-7 rounded-lg hover:bg-red-50 dark:hover:bg-red-500/10 flex items-center justify-center text-gray-400 hover:text-red-500 transition-colors">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Form modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-end md:items-center justify-center p-4">
          <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
            <h2 className="text-base font-semibold text-gray-900 dark:text-zinc-100">
              {editId ? 'Sửa lịch hẹn' : 'Thêm lịch hẹn mới'}
            </h2>

            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-500 dark:text-zinc-400">Tiêu đề *</label>
              <input
                className="w-full border border-gray-200 dark:border-white/10 rounded-xl px-3 py-2 text-sm bg-white dark:bg-zinc-800 text-gray-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Gặp khách Nguyễn Văn A"
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-500 dark:text-zinc-400">Thời gian hẹn *</label>
              <input
                type="datetime-local"
                className="w-full border border-gray-200 dark:border-white/10 rounded-xl px-3 py-2 text-sm bg-white dark:bg-zinc-800 text-gray-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={form.scheduledAt}
                onChange={e => setForm(f => ({ ...f, scheduledAt: e.target.value }))}
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-500 dark:text-zinc-400">Nhắc nhở</label>
              <select
                className="w-full border border-gray-200 dark:border-white/10 rounded-xl px-3 py-2 text-sm bg-white dark:bg-zinc-800 text-gray-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={form.remindBefore}
                onChange={e => setForm(f => ({ ...f, remindBefore: Number(e.target.value) }))}
              >
                {REMIND_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-500 dark:text-zinc-400">Ghi chú</label>
              <textarea
                className="w-full border border-gray-200 dark:border-white/10 rounded-xl px-3 py-2 text-sm bg-white dark:bg-zinc-800 text-gray-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                rows={2}
                placeholder="Địa điểm, nội dung thảo luận..."
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              />
            </div>

            <div className="flex gap-3 pt-1">
              <button onClick={() => setShowForm(false)}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 dark:border-white/10 text-sm font-medium text-gray-700 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors">
                Huỷ
              </button>
              <button onClick={save} disabled={saving || !form.title || !form.scheduledAt}
                className="flex-1 py-2.5 rounded-xl bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white text-sm font-medium transition-colors">
                {saving ? 'Đang lưu...' : editId ? 'Cập nhật' : 'Tạo lịch'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
