'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'

type TeamUser = {
  id: string
  name: string
  email: string | null
  role: 'OWNER' | 'MANAGER' | 'STAFF'
  createdAt: string
  assignedAlerts: number
}

const ROLES = { OWNER: '👑 Owner', MANAGER: '👔 Manager', STAFF: '👤 Staff' } as const

export default function TeamPage() {
  const [users, setUsers] = useState<TeamUser[]>([])
  const [showInvite, setShowInvite] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'STAFF' })

  function load() { api<TeamUser[]>('/api/team').then(setUsers) }
  useEffect(() => { load() }, [])

  async function invite() {
    if (!form.name || !form.email || !form.password) return
    await api('/api/team/invite', { method: 'POST', body: JSON.stringify(form) })
    setForm({ name: '', email: '', password: '', role: 'STAFF' })
    setShowInvite(false)
    load()
  }

  async function updateRole(id: string, role: string) {
    await api(`/api/team/${id}`, { method: 'PATCH', body: JSON.stringify({ role }) })
    load()
  }

  async function remove(id: string) {
    if (!confirm('Xoá thành viên?')) return
    await api(`/api/team/${id}`, { method: 'DELETE' })
    load()
  }

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-zinc-100 tracking-tight">👔 Team</h1>
          <p className="text-gray-500 dark:text-zinc-400 mt-1 text-sm">{users.length} thành viên</p>
        </div>
        <button onClick={() => setShowInvite(true)}
          className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded-full">
          + Mời
        </button>
      </div>

      {showInvite && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowInvite(false)}>
          <div className="bg-white dark:bg-zinc-900 dark:ring-1 dark:ring-white/5 rounded-3xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-4">Mời thành viên</h3>
            <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
              placeholder="Tên"
              className="w-full mb-3 px-4 py-2.5 bg-gray-50 dark:bg-white/5 rounded-xl text-sm border-0 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })}
              placeholder="Email" type="email"
              className="w-full mb-3 px-4 py-2.5 bg-gray-50 dark:bg-white/5 rounded-xl text-sm border-0 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <input value={form.password} onChange={e => setForm({ ...form, password: e.target.value })}
              placeholder="Mật khẩu tạm" type="password"
              className="w-full mb-3 px-4 py-2.5 bg-gray-50 dark:bg-white/5 rounded-xl text-sm border-0 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}
              className="w-full mb-4 px-4 py-2.5 bg-gray-50 dark:bg-white/5 rounded-xl text-sm border-0 focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="STAFF">Staff</option>
              <option value="MANAGER">Manager</option>
            </select>
            <div className="flex gap-2">
              <button onClick={() => setShowInvite(false)} className="flex-1 py-2.5 bg-gray-100 dark:bg-white/10 rounded-xl text-sm font-medium">Huỷ</button>
              <button onClick={invite} className="flex-1 py-2.5 bg-blue-500 hover:bg-blue-600 text-white rounded-xl text-sm font-medium">Mời</button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white dark:bg-zinc-900 dark:ring-1 dark:ring-white/5 rounded-2xl shadow-[0_1px_2px_rgba(0,0,0,0.04)] overflow-hidden divide-y divide-gray-100 dark:divide-white/5">
        {users.map(u => (
          <div key={u.id} className="px-4 py-3 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white font-bold">
              {u.name[0]?.toUpperCase()}
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-gray-900 dark:text-zinc-100">{u.name}</p>
              <p className="text-xs text-gray-500 dark:text-zinc-400">{u.email} · {u.assignedAlerts} alerts assigned</p>
            </div>
            <select value={u.role} onChange={e => updateRole(u.id, e.target.value)}
              disabled={u.role === 'OWNER'}
              className="text-xs bg-gray-100 dark:bg-white/10 border-0 rounded-lg px-2 py-1.5 text-gray-700 dark:text-zinc-300 cursor-pointer">
              {Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            {u.role !== 'OWNER' && (
              <button onClick={() => remove(u.id)} className="text-gray-400 dark:text-zinc-500 hover:text-red-500 text-sm">🗑</button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
