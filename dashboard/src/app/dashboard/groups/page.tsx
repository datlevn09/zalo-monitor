'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { api } from '@/lib/api'
import { formatRelative } from '@/lib/format'
import { channelDeepLink } from '@/lib/deeplink'

type Group = {
  id: string
  name: string
  externalId: string
  channelType: 'ZALO' | 'TELEGRAM'
  category: string | null
  avatarUrl: string | null
  botEnabled: boolean
  monitorEnabled: boolean
  lastMessageAt: string | null
  isActive: boolean
  _count: { messages: number; alerts: number }
}

const CATEGORIES = ['Tất cả', 'Khách hàng', 'Đại lý', 'Nội bộ', 'Nhà cung cấp', 'Chưa phân loại']

export default function GroupsPage() {
  const [groups, setGroups] = useState<Group[]>([])
  const [allGroups, setAllGroups] = useState<Group[]>([])
  const [category, setCategory] = useState('Tất cả')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [showCustomize, setShowCustomize] = useState(false)
  const [pinnedGroupIds, setPinnedGroupIds] = useState<string[]>([])
  const [selectedPins, setSelectedPins] = useState<string[]>([])
  const [savingPins, setSavingPins] = useState(false)

  useEffect(() => {
    const loadData = async () => {
      try {
        // Load all groups
        const allGroupsData = await api<Group[]>('/api/groups')
        setAllGroups(allGroupsData)

        // Load user's pinned group IDs
        const pinsData = await api<{ pinnedGroupIds: string[] }>('/api/groups/pins')
        const pinned = pinsData.pinnedGroupIds
        setPinnedGroupIds(pinned)
        setSelectedPins(pinned)

        // Filter groups: if pinnedGroupIds is empty, show all; otherwise show only pinned
        const filtered = pinned.length === 0
          ? allGroupsData
          : allGroupsData.filter(g => pinned.includes(g.id))
        setGroups(filtered)
      } catch (err) {
        console.error('Failed to load groups:', err)
        setLoading(false)
        return
      }
      setLoading(false)
    }
    loadData()
  }, [])

  async function updateCategory(id: string, newCategory: string) {
    setGroups(gs => gs.map(g => g.id === id ? { ...g, category: newCategory } : g))
    await api(`/api/groups/${id}`, { method: 'PATCH', body: JSON.stringify({ category: newCategory }) })
  }

  async function toggleMonitor(id: string, enabled: boolean) {
    setGroups(gs => gs.map(g => g.id === id ? { ...g, monitorEnabled: enabled } : g))
    await api(`/api/groups/${id}`, { method: 'PATCH', body: JSON.stringify({ monitorEnabled: enabled }) })
  }

  async function savePinnedGroups() {
    setSavingPins(true)
    try {
      await api('/api/groups/pins', {
        method: 'PUT',
        body: JSON.stringify({ groupIds: selectedPins }),
      })
      setPinnedGroupIds(selectedPins)
      // Re-filter groups
      const filtered = selectedPins.length === 0
        ? allGroups
        : allGroups.filter(g => selectedPins.includes(g.id))
      setGroups(filtered)
      setShowCustomize(false)
    } catch (err) {
      console.error('Failed to save pinned groups:', err)
    } finally {
      setSavingPins(false)
    }
  }

  function togglePin(groupId: string) {
    setSelectedPins(ids =>
      ids.includes(groupId)
        ? ids.filter(id => id !== groupId)
        : [...ids, groupId]
    )
  }

  const filtered = groups.filter(g => {
    if (search && !g.name.toLowerCase().includes(search.toLowerCase())) return false
    if (category === 'Tất cả') return true
    if (category === 'Chưa phân loại') return !g.category
    return g.category === category
  })

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-6xl mx-auto w-full">
      <div className="mb-6 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-zinc-100 tracking-tight">Nhóm chat</h1>
          <p className="text-gray-500 dark:text-zinc-400 mt-1 text-sm">
            {pinnedGroupIds.length > 0
              ? `Hiển thị ${groups.length}/${allGroups.length} nhóm • `
              : `${groups.length} nhóm đang theo dõi`
            }
            {pinnedGroupIds.length > 0 && (
              <button
                onClick={() => setShowCustomize(true)}
                className="text-blue-500 hover:underline font-medium"
              >
                Tùy chỉnh
              </button>
            )}
          </p>
        </div>
        {pinnedGroupIds.length === 0 && (
          <button
            onClick={() => setShowCustomize(true)}
            className="shrink-0 px-4 py-2 text-sm font-medium text-gray-700 dark:text-zinc-300 bg-white dark:bg-white/10 hover:bg-gray-50 dark:hover:bg-white/15 rounded-lg border border-gray-200 dark:border-white/10 transition-colors"
          >
            ⚙️ Tùy chỉnh board
          </button>
        )}
      </div>

      {/* Search */}
      <div className="mb-4 relative">
        <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-zinc-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
        </svg>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Tìm kiếm nhóm..."
          className="w-full pl-11 pr-4 py-3 bg-white dark:bg-zinc-900 dark:ring-1 dark:ring-white/5 rounded-2xl text-sm border-0 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
        />
      </div>

      {/* Category filter - iOS segmented style, scrollable on mobile */}
      <div className="mb-4 flex gap-2 overflow-x-auto pb-2 -mx-4 px-4 md:mx-0 md:px-0 snap-x">
        {CATEGORIES.map(c => (
          <button
            key={c}
            onClick={() => setCategory(c)}
            className={`shrink-0 px-3 md:px-4 py-2 rounded-full text-sm font-medium transition-all whitespace-nowrap ${
              category === c
                ? 'bg-gray-900 dark:bg-white/15 text-white shadow-md'
                : 'bg-white dark:bg-white/10 text-gray-700 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-white/15 shadow-[0_1px_2px_rgba(0,0,0,0.04)]'
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      {/* Bulk monitor toggle */}
      <div className="mb-4 flex gap-2 flex-wrap items-center">
        <span className="text-xs text-gray-500 dark:text-zinc-400">Bật/tắt đồng bộ hàng loạt:</span>
        <button
          onClick={async () => {
            if (!confirm('Bật đồng bộ TẤT CẢ nhóm Zalo?')) return
            await api('/api/groups/bulk-monitor', { method: 'POST', body: JSON.stringify({ enabled: true, channelType: 'ZALO' }) })
            window.location.reload()
          }}
          className="px-3 py-1.5 text-xs font-medium bg-green-100 dark:bg-green-500/20 text-green-700 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-500/30 rounded-full"
        >
          ✅ Bật tất cả
        </button>
        <button
          onClick={async () => {
            if (!confirm('Tắt đồng bộ TẤT CẢ nhóm Zalo?')) return
            await api('/api/groups/bulk-monitor', { method: 'POST', body: JSON.stringify({ enabled: false, channelType: 'ZALO' }) })
            window.location.reload()
          }}
          className="px-3 py-1.5 text-xs font-medium bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-500/30 rounded-full"
        >
          ⛔ Tắt tất cả
        </button>
      </div>

      {/* Groups list - iOS settings style */}
      <div className="bg-white dark:bg-zinc-900 dark:ring-1 dark:ring-white/5 rounded-2xl shadow-[0_1px_2px_rgba(0,0,0,0.04)] overflow-hidden">
        {loading && (
          <div className="p-10 text-center text-gray-400 dark:text-zinc-500">
            <p className="text-sm">Đang tải...</p>
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div className="p-10 text-center">
            <div className="text-5xl mb-3">💬</div>
            <p className="text-gray-600 dark:text-zinc-400 font-medium">Chưa có nhóm nào</p>
            <p className="text-sm text-gray-400 dark:text-zinc-500 mt-1">
              Nhóm sẽ tự xuất hiện khi listener forward tin nhắn mới về
            </p>
          </div>
        )}

        <div className="divide-y divide-gray-100 dark:divide-white/5">
          {filtered.map(g => {
            const deepLink = channelDeepLink(g.channelType, g.externalId)
            return (
            <div key={g.id} className="px-4 py-3.5 flex items-center gap-2 md:gap-3 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors overflow-hidden">
              {/* Avatar / channel icon */}
              <div className="shrink-0 relative">
                {g.avatarUrl ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={g.avatarUrl} alt={g.name} className="w-11 h-11 rounded-2xl object-cover" />
                ) : (
                  <div className={`w-11 h-11 rounded-2xl flex items-center justify-center text-white text-lg font-bold ${
                    g.channelType === 'ZALO' ? 'bg-blue-500'
                    : g.channelType === 'TELEGRAM' ? 'bg-sky-500'
                    : 'bg-emerald-500'
                  }`}>
                    {g.channelType === 'ZALO' ? 'Z' : g.channelType === 'TELEGRAM' ? '✈️' : '🪶'}
                  </div>
                )}
                <div className={`absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full flex items-center justify-center text-[8px] text-white font-bold shadow-md ring-2 ring-white ${
                  g.channelType === 'ZALO' ? 'bg-blue-500'
                  : g.channelType === 'TELEGRAM' ? 'bg-sky-500'
                  : 'bg-emerald-500'
                }`}>{g.channelType === 'ZALO' ? 'Z' : g.channelType === 'TELEGRAM' ? 'T' : 'L'}</div>
              </div>

              <Link href={`/dashboard/groups/${g.id}`} className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-gray-900 dark:text-zinc-100 truncate">{g.name}</p>
                  {g._count.alerts > 0 && (
                    <span className="shrink-0 inline-flex items-center justify-center min-w-5 h-5 px-1.5 bg-red-500 text-white text-[10px] font-bold rounded-full">
                      {g._count.alerts}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <p className="text-xs text-gray-500 dark:text-zinc-400 truncate">
                    {g._count.messages} tin nhắn · {formatRelative(g.lastMessageAt)}
                  </p>
                  {g.category && (
                    <span className="shrink-0 text-[10px] px-1.5 py-0.5 bg-gray-100 dark:bg-white/10 text-gray-600 dark:text-zinc-400 rounded font-medium">
                      {g.category}
                    </span>
                  )}
                </div>
              </Link>

              {/* Open in Zalo - hidden on mobile */}
              {deepLink && (
                <a href={deepLink} target="_blank" rel="noopener noreferrer"
                  onClick={e => e.stopPropagation()}
                  title={`Mở trong ${g.channelType}`}
                  className="shrink-0 w-8 h-8 rounded-full bg-blue-50 dark:bg-blue-500/10 hover:bg-blue-100 dark:hover:bg-blue-500/20 flex items-center justify-center text-blue-600 transition-colors hidden md:flex">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/>
                  </svg>
                </a>
              )}

              {/* Quick category picker - hidden on mobile */}
              <select
                value={g.category ?? ''}
                onChange={e => updateCategory(g.id, e.target.value)}
                onClick={e => e.stopPropagation()}
                className="hidden md:block text-xs bg-gray-100 dark:bg-white/10 border-0 rounded-lg px-2 py-1.5 text-gray-700 dark:text-zinc-300 cursor-pointer hover:bg-gray-200 dark:hover:bg-white/15 transition-colors shrink-0"
              >
                <option value="">Phân loại...</option>
                <option>Khách hàng</option>
                <option>Đại lý</option>
                <option>Nội bộ</option>
                <option>Nhà cung cấp</option>
              </select>

              {/* iOS toggle */}
              <button
                onClick={() => toggleMonitor(g.id, !g.monitorEnabled)}
                className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${
                  g.monitorEnabled ? 'bg-green-500' : 'bg-gray-300'
                }`}
              >
                <span
                  className="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-md transition-transform"
                  style={{ transform: g.monitorEnabled ? 'translateX(20px)' : 'translateX(0)' }}
                />
              </button>
            </div>
            )
          })}
        </div>
      </div>

      {/* Customize Board Modal */}
      {showCustomize && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl max-w-md w-full max-h-[80vh] overflow-hidden flex flex-col">
            {/* Header */}
            <div className="px-6 py-5 border-b border-gray-100 dark:border-white/10 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-zinc-100">Tùy chỉnh board</h2>
              <button
                onClick={() => setShowCustomize(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-zinc-400 w-6 h-6 flex items-center justify-center"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
                </svg>
              </button>
            </div>

            {/* Groups List */}
            <div className="flex-1 overflow-y-auto px-6 py-4">
              <p className="text-xs text-gray-500 dark:text-zinc-400 mb-3 font-medium">
                Chọn các nhóm muốn hiển thị trên board của bạn
              </p>
              <div className="space-y-2">
                {allGroups.map(g => (
                  <label key={g.id} className="flex items-center gap-3 p-2.5 hover:bg-gray-50 dark:hover:bg-white/5 rounded-lg cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedPins.includes(g.id)}
                      onChange={() => togglePin(g.id)}
                      className="w-4 h-4 rounded border-gray-300 dark:border-white/20 text-blue-500 focus:ring-blue-500 dark:focus:ring-blue-400"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-zinc-100 truncate">{g.name}</p>
                      <p className="text-xs text-gray-500 dark:text-zinc-400">
                        {g._count.messages} tin • {g.category || 'Chưa phân loại'}
                      </p>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-gray-100 dark:border-white/10 flex gap-3 bg-gray-50 dark:bg-zinc-800/50">
              <button
                onClick={() => setShowCustomize(false)}
                className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 dark:text-zinc-300 bg-white dark:bg-white/10 hover:bg-gray-100 dark:hover:bg-white/20 rounded-lg border border-gray-200 dark:border-white/10 transition-colors"
              >
                Hủy
              </button>
              <button
                onClick={savePinnedGroups}
                disabled={savingPins}
                className="flex-1 px-4 py-2 text-sm font-medium text-white bg-blue-500 hover:bg-blue-600 disabled:bg-blue-400 rounded-lg transition-colors"
              >
                {savingPins ? 'Đang lưu...' : 'Lưu'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
