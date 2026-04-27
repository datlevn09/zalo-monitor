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

type GroupItem = {
  id: string
  name: string
  channelType: string
  lastMessageAt: string | null
  _count?: { messages: number }
}

type BoardViewer = {
  id: string
  viewerUserId: string
  name: string
  email: string | null
  role: string
  grantedAt: string
}

const ROLES = { OWNER: '👑 Owner', MANAGER: '👔 Manager', STAFF: '👤 Staff' } as const
const CH_ICON: Record<string, string> = { ZALO: 'Z', TELEGRAM: '✈️', LARK: '🪶' }
const CH_COLOR: Record<string, string> = { ZALO: 'bg-blue-500', TELEGRAM: 'bg-sky-500', LARK: 'bg-teal-500' }

export default function TeamPage() {
  const [users, setUsers] = useState<TeamUser[]>([])
  const [myUserId, setMyUserId] = useState<string | null>(null)
  const [showInvite, setShowInvite] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', role: 'STAFF', grantBoardAccess: false })

  // Board viewers
  const [boardViewers, setBoardViewers] = useState<BoardViewer[]>([])
  const [maxViewers, setMaxViewers] = useState(0)
  const [showGrantModal, setShowGrantModal] = useState(false)

  // Group assignment
  const [assignUser, setAssignUser] = useState<TeamUser | null>(null)
  const [allGroups, setAllGroups] = useState<GroupItem[]>([])
  const [userGroups, setUserGroups] = useState<GroupItem[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [savingAssign, setSavingAssign] = useState(false)

  function load() {
    api<TeamUser[]>('/api/team').then(setUsers)
  }

  function loadBoardViewers(userId: string) {
    api<{ viewers: BoardViewer[]; count: number; maxViewers: number }>(`/api/board/${userId}/viewers`)
      .then((r) => {
        setBoardViewers(r.viewers)
        setMaxViewers(r.maxViewers)
      })
      .catch(() => undefined)
  }

  useEffect(() => {
    load()
    api<{ user: { id: string; name: string } }>('/api/auth/me')
      .then((me) => {
        setMyUserId(me.user.id)
        loadBoardViewers(me.user.id)
      })
      .catch(() => undefined)
  }, [])

  async function invite() {
    if (!form.name || !form.email) return
    await api('/api/team/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: form.name,
        email: form.email,
        role: form.role,
        ...(form.grantBoardAccess && myUserId ? { boardUserId: myUserId } : {}),
      }),
    })
    setForm({ name: '', email: '', role: 'STAFF', grantBoardAccess: false })
    setShowInvite(false)
    load()
    if (myUserId) loadBoardViewers(myUserId)
  }

  async function grantAccess(viewerUserId: string) {
    if (!myUserId) return
    await api(`/api/board/${myUserId}/viewers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ viewerUserId }),
    })
    loadBoardViewers(myUserId)
    setShowGrantModal(false)
  }

  async function revokeAccess(viewerUserId: string) {
    if (!myUserId || !confirm('Xoá quyền xem board?')) return
    await api(`/api/board/${myUserId}/viewers/${viewerUserId}`, { method: 'DELETE' })
    loadBoardViewers(myUserId)
  }

  async function updateRole(id: string, role: string) {
    await api(`/api/team/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role }),
    })
    load()
  }

  async function remove(id: string) {
    if (!confirm('Xoá thành viên này?')) return
    await api(`/api/team/${id}`, { method: 'DELETE' })
    load()
  }

  async function openAssign(u: TeamUser) {
    setAssignUser(u)
    setSelected(new Set())
    const [all, mine] = await Promise.all([
      api<GroupItem[]>('/api/groups'),
      api<GroupItem[]>(`/api/team/${u.id}/groups`),
    ])
    setAllGroups(all)
    setUserGroups(mine)
    setSelected(new Set(mine.map((g) => g.id)))
  }

  async function saveAssign() {
    if (!assignUser) return
    setSavingAssign(true)
    await api(`/api/team/${assignUser.id}/groups`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ groupIds: Array.from(selected) }),
    })
    setSavingAssign(false)
    setAssignUser(null)
    load()
  }

  function toggleGroup(id: string) {
    setSelected((s) => {
      const n = new Set(s)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }

  const viewerUserIds = new Set(boardViewers.map((v) => v.viewerUserId))
  const eligibleForGrant = users.filter((u) => u.id !== myUserId && !viewerUserIds.has(u.id))
  const limitReached = maxViewers > 0 && boardViewers.length >= maxViewers

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-zinc-100 tracking-tight">👔 Team</h1>
          <p className="text-gray-500 dark:text-zinc-400 mt-1 text-sm">{users.length} thành viên</p>
        </div>
        <button
          onClick={() => setShowInvite(true)}
          className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded-full transition-colors"
        >
          + Mời
        </button>
      </div>

      {/* User list */}
      <div className="bg-white dark:bg-zinc-900 dark:ring-1 dark:ring-white/5 rounded-2xl shadow-[0_1px_2px_rgba(0,0,0,0.04)] overflow-hidden divide-y divide-gray-100 dark:divide-white/5 mb-6">
        {users.map((u) => (
          <div key={u.id} className="px-4 py-3.5 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white font-bold shrink-0">
              {u.name[0]?.toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900 dark:text-zinc-100 truncate">{u.name}</p>
              <p className="text-xs text-gray-500 dark:text-zinc-400 truncate">{u.email}</p>
            </div>

            {u.role === 'STAFF' && (
              <button
                onClick={() => openAssign(u)}
                className="text-xs px-2.5 py-1.5 rounded-lg bg-cyan-50 dark:bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 hover:bg-cyan-100 dark:hover:bg-cyan-500/20 transition-colors font-medium"
              >
                🔗 Nhóm
              </button>
            )}

            <select
              value={u.role}
              onChange={(e) => updateRole(u.id, e.target.value)}
              disabled={u.role === 'OWNER'}
              className="text-xs bg-gray-100 dark:bg-white/10 border-0 rounded-lg px-2 py-1.5 text-gray-700 dark:text-zinc-300 cursor-pointer disabled:opacity-60"
            >
              {Object.entries(ROLES).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
            {u.role !== 'OWNER' && (
              <button onClick={() => remove(u.id)} className="text-gray-400 dark:text-zinc-500 hover:text-red-500 transition-colors text-sm">
                🗑
              </button>
            )}
          </div>
        ))}
        {users.length === 0 && <div className="px-4 py-8 text-center text-sm text-gray-400 dark:text-zinc-500">Chưa có thành viên</div>}
      </div>

      {/* Board viewers section */}
      <div className="mb-6">
        <div className="px-1 mb-2 flex items-center justify-between">
          <div>
            <h2 className="text-xs font-semibold text-gray-500 dark:text-zinc-400 uppercase tracking-wider">📋 Người xem board của tôi</h2>
            <p className="text-xs text-gray-500 dark:text-zinc-400 mt-0.5">
              Những người được phép xem board dữ liệu của bạn
              {maxViewers > 0 && <span className="ml-1 font-medium">({boardViewers.length}/{maxViewers} người)</span>}
            </p>
          </div>
          <button
            onClick={() => setShowGrantModal(true)}
            disabled={limitReached || eligibleForGrant.length === 0}
            className="text-xs px-3 py-1.5 bg-blue-500 hover:bg-blue-600 disabled:opacity-40 text-white rounded-full font-medium transition-colors"
          >
            + Thêm
          </button>
        </div>
        <div className="bg-white dark:bg-zinc-900 dark:ring-1 dark:ring-white/5 rounded-2xl shadow-[0_1px_2px_rgba(0,0,0,0.04)] overflow-hidden divide-y divide-gray-100 dark:divide-white/5">
          {boardViewers.map((v) => (
            <div key={v.id} className="px-4 py-3 flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-green-400 to-teal-500 flex items-center justify-center text-white text-sm font-bold shrink-0">
                {v.name[0]?.toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-zinc-100 truncate">{v.name}</p>
                <p className="text-xs text-gray-500 dark:text-zinc-400 truncate">{v.email}</p>
              </div>
              <span className="text-xs text-gray-400 dark:text-zinc-500 shrink-0">
                {ROLES[v.role as keyof typeof ROLES] ?? v.role}
              </span>
              <button
                onClick={() => revokeAccess(v.viewerUserId)}
                className="text-gray-400 dark:text-zinc-500 hover:text-red-500 transition-colors text-sm ml-1"
              >
                ×
              </button>
            </div>
          ))}
          {boardViewers.length === 0 && (
            <div className="px-4 py-6 text-center text-sm text-gray-400 dark:text-zinc-500">Chưa ai được xem board của bạn</div>
          )}
          {limitReached && (
            <div className="px-4 py-3 bg-amber-50 dark:bg-amber-500/10 text-xs text-amber-700 dark:text-amber-400">
              ⚠️ Đã đạt giới hạn {maxViewers} người xem. Liên hệ admin để nâng cấp license.
            </div>
          )}
        </div>
      </div>

      {/* Role legend */}
      <div className="mt-4 bg-blue-50 dark:bg-blue-500/10 rounded-xl px-4 py-3 text-xs text-blue-700 dark:text-blue-300 space-y-1">
        <p className="font-semibold mb-1">Phân quyền:</p>
        <p>
          👑 <b>Owner</b> — toàn quyền, xem tất cả nhóm
        </p>
        <p>
          👔 <b>Manager</b> — xem tất cả nhóm, quản lý staff
        </p>
        <p>
          👤 <b>Staff</b> — chỉ thấy nhóm được phân công + nhóm chưa phân công
        </p>
        <p>
          📋 <b>Board viewer</b> — chỉ xem board của người mời, không có quyền quản lý
        </p>
      </div>

      {/* Invite modal */}
      {showInvite && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowInvite(false)}>
          <div className="bg-white dark:bg-zinc-900 dark:ring-1 dark:ring-white/5 rounded-3xl p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-4 text-gray-900 dark:text-zinc-100">Mời thành viên</h3>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Tên"
              autoFocus
              className="w-full mb-3 px-4 py-2.5 bg-gray-50 dark:bg-white/5 rounded-xl text-sm border border-gray-200 dark:border-white/10 focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-zinc-100"
            />
            <input
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="Email"
              type="email"
              className="w-full mb-3 px-4 py-2.5 bg-gray-50 dark:bg-white/5 rounded-xl text-sm border border-gray-200 dark:border-white/10 focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-zinc-100"
            />
            <select
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
              className="w-full mb-3 px-4 py-2.5 bg-gray-50 dark:bg-white/5 rounded-xl text-sm border border-gray-200 dark:border-white/10 focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-zinc-100"
            >
              <option value="STAFF">Staff</option>
              <option value="MANAGER">Manager</option>
            </select>

            {/* Board access toggle */}
            <label className="flex items-center gap-3 px-4 py-3 bg-blue-50 dark:bg-blue-500/10 rounded-xl mb-4 cursor-pointer">
              <input
                type="checkbox"
                checked={form.grantBoardAccess}
                onChange={(e) => setForm({ ...form, grantBoardAccess: e.target.checked })}
                className="w-4 h-4 rounded accent-blue-500"
                disabled={limitReached}
              />
              <div className="flex-1">
                <p className="text-sm font-medium text-blue-700 dark:text-blue-300">📋 Cho xem board của tôi</p>
                <p className="text-xs text-blue-600/70 dark:text-blue-400/70">Người này có thể xem toàn bộ dữ liệu nhóm của bạn</p>
              </div>
              {limitReached && <span className="text-xs text-amber-600 dark:text-amber-400">Hết slot</span>}
            </label>

            <p className="text-xs text-gray-500 dark:text-zinc-400 mb-4">Hệ thống gửi email đặt mật khẩu cho người được mời (link hạn 7 ngày).</p>
            <div className="flex gap-2">
              <button onClick={() => setShowInvite(false)} className="flex-1 py-2.5 bg-gray-100 dark:bg-white/10 rounded-xl text-sm font-medium text-gray-700 dark:text-zinc-300">
                Huỷ
              </button>
              <button onClick={invite} className="flex-1 py-2.5 bg-blue-500 hover:bg-blue-600 text-white rounded-xl text-sm font-medium transition-colors">
                Gửi lời mời
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Grant access modal — add existing user to board viewers */}
      {showGrantModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowGrantModal(false)}>
          <div className="bg-white dark:bg-zinc-900 dark:ring-1 dark:ring-white/5 rounded-3xl p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-1 text-gray-900 dark:text-zinc-100">Thêm người xem board</h3>
            <p className="text-xs text-gray-500 dark:text-zinc-400 mb-4">Chọn thành viên trong team được xem board của bạn</p>
            <div className="space-y-1.5 max-h-64 overflow-y-auto">
              {eligibleForGrant.length === 0 && <p className="text-center text-sm text-gray-400 py-6">Tất cả thành viên đã được cấp quyền</p>}
              {eligibleForGrant.map((u) => (
                <button
                  key={u.id}
                  onClick={() => grantAccess(u.id)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-blue-50 dark:hover:bg-blue-500/10 transition-colors text-left"
                >
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white text-sm font-bold shrink-0">
                    {u.name[0]?.toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-zinc-100 truncate">{u.name}</p>
                    <p className="text-xs text-gray-500 dark:text-zinc-400 truncate">{u.email}</p>
                  </div>
                  <span className="text-xs text-blue-500">+ Thêm</span>
                </button>
              ))}
            </div>
            <button onClick={() => setShowGrantModal(false)} className="w-full mt-4 py-2.5 bg-gray-100 dark:bg-white/10 rounded-xl text-sm font-medium text-gray-700 dark:text-zinc-300">
              Đóng
            </button>
          </div>
        </div>
      )}

      {/* Assign groups modal */}
      {assignUser && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end md:items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl w-full max-w-md flex flex-col max-h-[80vh]">
            <div className="px-5 pt-5 pb-3 border-b border-gray-100 dark:border-white/10">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-zinc-100">Phân công nhóm</h3>
                  <p className="text-xs text-gray-500 dark:text-zinc-400 mt-0.5">
                    {assignUser.name} · {selected.size} nhóm được chọn
                  </p>
                </div>
                <button onClick={() => setAssignUser(null)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">
                  ×
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-3 space-y-1.5">
              {allGroups.length === 0 && <p className="text-center text-sm text-gray-400 py-8">Chưa có nhóm nào</p>}
              {allGroups.map((g) => {
                const checked = selected.has(g.id)
                return (
                  <label
                    key={g.id}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-colors ${
                      checked ? 'bg-blue-50 dark:bg-blue-500/10' : 'hover:bg-gray-50 dark:hover:bg-white/5'
                    }`}
                  >
                    <input type="checkbox" checked={checked} onChange={() => toggleGroup(g.id)} className="w-4 h-4 rounded accent-blue-500" />
                    <div className={`w-7 h-7 rounded-lg ${CH_COLOR[g.channelType] ?? 'bg-gray-400'} flex items-center justify-center text-white text-xs font-bold shrink-0`}>
                      {CH_ICON[g.channelType] ?? '?'}
                    </div>
                    <span className="text-sm text-gray-800 dark:text-zinc-200 truncate flex-1">{g.name}</span>
                    {checked && <span className="text-blue-500 text-xs shrink-0">✓</span>}
                  </label>
                )
              })}
            </div>

            <div className="px-5 pb-5 pt-3 border-t border-gray-100 dark:border-white/10 flex gap-3">
              <button
                onClick={() => setAssignUser(null)}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 dark:border-white/10 text-sm font-medium text-gray-700 dark:text-zinc-300"
              >
                Huỷ
              </button>
              <button
                onClick={saveAssign}
                disabled={savingAssign}
                className="flex-1 py-2.5 rounded-xl bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white text-sm font-medium transition-colors"
              >
                {savingAssign ? 'Đang lưu...' : `Lưu (${selected.size} nhóm)`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
