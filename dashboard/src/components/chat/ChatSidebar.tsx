'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { formatRelative } from '@/lib/format'

type GroupItem = {
  id: string
  name: string
  channelType: 'ZALO' | 'TELEGRAM'
  category: string | null
  avatarUrl: string | null
  isDirect?: boolean
  lastMessageAt: string | null
  _count: { messages: number; alerts: number }
  messages?: Array<{
    content: string | null
    contentType: string
    senderName: string | null
    senderType: 'SELF' | 'CONTACT'
  }>
}

function previewMessage(g: GroupItem): string {
  const m = g.messages?.[0]
  if (!m) return 'Chưa có tin'
  const prefix =
    m.senderType === 'SELF' ? 'Bạn: '
    : m.senderName ? `${m.senderName.split(' ').slice(-1)[0]}: `
    : ''
  let body = m.content ?? ''
  if (m.contentType === 'IMAGE') body = '[Hình ảnh]'
  else if (m.contentType === 'VIDEO') body = '[Video]'
  else if (m.contentType === 'STICKER') body = '[Sticker]'
  else if (m.contentType === 'VOICE') body = '[Thoại]'
  else if (m.contentType === 'FILE') body = '[File]'
  body = body.replace(/\[media attached:[^\]]*\]/gi, '[Tệp]').trim()
  if (body.length > 50) body = body.slice(0, 50) + '…'
  return prefix + (body || '…')
}

/**
 * Sidebar danh sách hội thoại — chỉ hiển thị desktop (md:flex), ẩn mobile.
 * Đặt trong chat detail page để có 2-pane layout giống Zalo PC / Telegram.
 */
export function ChatSidebar({ activeId }: { activeId: string }) {
  const [groups, setGroups] = useState<GroupItem[]>([])
  const [search, setSearch] = useState('')

  useEffect(() => {
    let stop = false
    const load = () => {
      api<GroupItem[]>('/api/groups').then(g => { if (!stop) setGroups(g) }).catch(() => undefined)
    }
    load()
    const i = setInterval(load, 15_000)
    return () => { stop = true; clearInterval(i) }
  }, [])

  const filtered = search.trim()
    ? groups.filter(g => g.name.toLowerCase().includes(search.toLowerCase()))
    : groups

  return (
    <aside className="hidden md:flex flex-col w-80 lg:w-96 border-r border-gray-200 dark:border-white/10 bg-white dark:bg-zinc-900 h-full overflow-hidden shrink-0">
      {/* Header search */}
      <div className="px-3 py-3 border-b border-gray-200 dark:border-white/10">
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
          </svg>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Tìm kiếm..."
            className="w-full pl-9 pr-3 py-2 bg-gray-100 dark:bg-white/5 border-0 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40"
          />
        </div>
      </div>

      {/* Group list */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 && (
          <p className="text-center text-xs text-gray-400 dark:text-zinc-500 py-6">
            {search ? 'Không tìm thấy' : 'Chưa có hội thoại'}
          </p>
        )}
        {filtered.map(g => {
          const isActive = g.id === activeId
          return (
            <Link
              key={g.id}
              href={`/dashboard/groups/${g.id}`}
              className={`flex items-center gap-3 px-3 py-2.5 border-b border-gray-100 dark:border-white/5 transition-colors ${
                isActive
                  ? 'bg-blue-50 dark:bg-blue-500/10'
                  : 'hover:bg-gray-50 dark:hover:bg-white/5'
              }`}
            >
              {/* Avatar */}
              <div className="shrink-0 relative">
                {g.avatarUrl ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={g.avatarUrl} alt={g.name} className="w-11 h-11 rounded-2xl object-cover" />
                ) : (
                  <div className={`w-11 h-11 rounded-2xl flex items-center justify-center text-white text-base font-bold ${
                    g.channelType === 'ZALO' ? 'bg-blue-500' : 'bg-sky-500'
                  }`}>
                    {g.channelType === 'ZALO' ? 'Z' : 'T'}
                  </div>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p className={`text-sm font-semibold truncate ${isActive ? 'text-blue-600 dark:text-blue-400' : 'text-gray-900 dark:text-zinc-100'}`}>
                    {g.name}
                  </p>
                  <p className="text-[10px] text-gray-400 dark:text-zinc-500 shrink-0">
                    {formatRelative(g.lastMessageAt)}
                  </p>
                </div>
                <div className="flex items-center justify-between gap-2 mt-0.5">
                  <p className="text-xs text-gray-500 dark:text-zinc-400 truncate flex-1">
                    {previewMessage(g)}
                  </p>
                  {g._count.alerts > 0 && (
                    <span className="shrink-0 inline-flex items-center justify-center min-w-4 h-4 px-1 bg-red-500 text-white text-[9px] font-bold rounded-full">
                      {g._count.alerts}
                    </span>
                  )}
                </div>
              </div>
            </Link>
          )
        })}
      </div>
    </aside>
  )
}
