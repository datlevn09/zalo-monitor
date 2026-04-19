'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { api, connectWebSocket } from '@/lib/api'
import { LABEL_CFG, PRIORITY_CFG, formatTime, formatDateTime } from '@/lib/format'
import { channelDeepLink } from '@/lib/deeplink'

type Message = {
  id: string
  senderType: 'SELF' | 'CONTACT'
  senderName: string | null
  senderId: string
  content: string | null
  contentType: string
  sentAt: string
  analysis: {
    label: keyof typeof LABEL_CFG
    sentiment: string
    priority: keyof typeof PRIORITY_CFG
    confidence: number
    reason: string | null
  } | null
}

type Group = {
  id: string
  name: string
  externalId: string
  channelType: 'ZALO' | 'TELEGRAM'
  category: string | null
  monitorEnabled: boolean
  lastMessageAt: string | null
}

export default function GroupDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [group, setGroup] = useState<Group | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)

  const loadGroup = () => api<Group[]>('/api/groups').then(gs => setGroup(gs.find(g => g.id === id) ?? null))
  const loadMessages = () => api<Message[]>(`/api/messages?groupId=${id}&limit=100`).then(m => { setMessages(m); setLoading(false) })

  useEffect(() => {
    loadGroup()
    loadMessages()

    const close = connectWebSocket((event, data) => {
      if (event === 'message:new' && data.groupId === id) loadMessages()
      if (event === 'analysis:result' && data.groupId === id) loadMessages()
    })
    return () => close()
  }, [id])

  if (!group) return (
    <div className="p-8 text-center text-gray-400 dark:text-zinc-500">Đang tải...</div>
  )

  return (
    <div className="flex flex-col h-screen md:h-[calc(100vh)]">
      {/* iOS navigation bar */}
      <header className="bg-white/80 dark:bg-zinc-900/80 backdrop-blur-xl border-b border-gray-200 dark:border-white/10 px-4 py-3 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="w-9 h-9 rounded-full hover:bg-gray-100 dark:hover:bg-white/10 flex items-center justify-center text-blue-500"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/>
            </svg>
          </button>

          <div className={`w-10 h-10 rounded-2xl flex items-center justify-center text-white shrink-0 ${
            group.channelType === 'ZALO' ? 'bg-blue-500' : 'bg-sky-500'
          }`}>
            {group.channelType === 'ZALO' ? 'Z' : '✈️'}
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-base font-semibold text-gray-900 dark:text-zinc-100 truncate">{group.name}</p>
            <p className="text-xs text-gray-500 dark:text-zinc-400 flex items-center gap-1.5">
              {group.monitorEnabled && (
                <span className="inline-flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                  <span>Đang theo dõi</span>
                </span>
              )}
              {group.category && <><span>·</span><span>{group.category}</span></>}
            </p>
          </div>

          {(() => {
            const link = channelDeepLink(group.channelType, group.externalId)
            return link ? (
              <a href={link} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1 px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white text-xs font-medium rounded-full">
                <span>Mở {group.channelType === 'ZALO' ? 'Zalo' : 'Telegram'}</span>
                <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/>
                </svg>
              </a>
            ) : null
          })()}
        </div>
      </header>

      {/* Chat thread */}
      <div className="flex-1 overflow-auto bg-[#f2f2f7] dark:bg-zinc-950">
        <div className="max-w-3xl mx-auto p-4 space-y-3">
          {loading && <p className="text-center text-gray-400 dark:text-zinc-500 text-sm">Đang tải tin nhắn...</p>}

          {/* History info banner */}
          {!loading && messages.length > 0 && (
            <div className="bg-blue-50 dark:bg-blue-500/10 border border-blue-100 dark:border-blue-500/20 rounded-xl p-3 text-center">
              <p className="text-xs text-blue-900 dark:text-blue-200">
                🔒 Bắt đầu theo dõi từ {formatDateTime(messages[0]?.sentAt)}
              </p>
              <p className="text-[11px] text-blue-700 dark:text-blue-300 mt-0.5">
                {group.channelType === 'TELEGRAM'
                  ? 'Telegram Bot không thể đọc tin nhắn trước khi bot được thêm vào nhóm'
                  : 'Tin nhắn trước thời điểm cài hook chưa được đồng bộ'}
              </p>
              {group.channelType !== 'TELEGRAM' && (
                <button className="mt-2 text-[11px] text-blue-600 dark:text-blue-400 hover:underline font-medium">
                  ↻ Đồng bộ lịch sử (coming soon)
                </button>
              )}
            </div>
          )}

          {!loading && messages.length === 0 && (
            <div className="text-center py-20">
              <div className="text-5xl mb-3">💬</div>
              <p className="text-gray-600 dark:text-zinc-400 font-medium">Chưa có tin nhắn</p>
              <p className="text-sm text-gray-400 dark:text-zinc-500 mt-1">Tin nhắn sẽ hiện ở đây khi nhóm có hoạt động</p>
            </div>
          )}

          {messages.map((msg, i) => {
            const prev = messages[i - 1]
            const showDate = !prev || new Date(msg.sentAt).toDateString() !== new Date(prev.sentAt).toDateString()
            const sameSender = prev?.senderId === msg.senderId && !showDate
            const cfg = msg.analysis ? LABEL_CFG[msg.analysis.label] : null
            const isFlagged = msg.analysis && ['COMPLAINT', 'RISK', 'OPPORTUNITY'].includes(msg.analysis.label)
            const isSelf = msg.senderType === 'SELF'

            return (
              <div key={msg.id}>
                {showDate && (
                  <div className="text-center my-5">
                    <span className="text-[11px] text-gray-500 dark:text-zinc-400 bg-white/50 dark:bg-zinc-800/60 px-3 py-1 rounded-full font-medium">
                      {formatDateTime(msg.sentAt)}
                    </span>
                  </div>
                )}

                <div className={`flex gap-2 ${sameSender ? 'mt-0.5' : 'mt-3'} ${isSelf ? 'flex-row-reverse' : ''}`}>
                  {!sameSender ? (
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-semibold shrink-0 ${
                      isSelf ? 'bg-gradient-to-br from-green-400 to-emerald-500' : 'bg-gradient-to-br from-blue-400 to-purple-500'
                    }`}>
                      {isSelf ? '🤖' : (msg.senderName?.[0]?.toUpperCase() ?? '?')}
                    </div>
                  ) : (
                    <div className="w-8 shrink-0" />
                  )}

                  <div className={`flex-1 min-w-0 ${isSelf ? 'flex flex-col items-end' : ''}`}>
                    {!sameSender && (
                      <div className={`flex items-baseline gap-2 mb-1 ${isSelf ? 'flex-row-reverse' : ''}`}>
                        <p className="text-xs font-semibold text-gray-700 dark:text-zinc-300">
                          {isSelf ? 'Bot' : (msg.senderName ?? 'Ẩn danh')}
                        </p>
                        <p className="text-[10px] text-gray-400 dark:text-zinc-500">{formatTime(msg.sentAt)}</p>
                      </div>
                    )}

                    <div className={`inline-block max-w-[85%] rounded-2xl px-3.5 py-2 ${
                      isSelf
                        ? 'bg-blue-500 text-white'
                        : isFlagged
                          ? 'bg-white dark:bg-zinc-800 ring-2 ring-offset-2 ring-offset-[#f2f2f7] dark:ring-offset-zinc-950 ' + (cfg?.color.replace('text-', 'ring-').split(' ').find(c => c.startsWith('ring-')) ?? 'ring-blue-200 dark:ring-blue-500/30')
                          : 'bg-white dark:bg-zinc-800'
                    } shadow-[0_1px_2px_rgba(0,0,0,0.04)]`}>
                      {msg.contentType !== 'TEXT' ? (
                        <p className={`text-sm italic ${isSelf ? 'text-blue-100' : 'text-gray-500 dark:text-zinc-400'}`}>
                          [{msg.contentType.toLowerCase()}]
                        </p>
                      ) : (
                        <p className={`text-sm whitespace-pre-wrap break-words ${isSelf ? 'text-white' : 'text-gray-900 dark:text-zinc-100'}`}>{msg.content}</p>
                      )}

                      {cfg && msg.analysis && !isSelf && (
                        <div className="mt-1.5 pt-1.5 border-t border-gray-100 dark:border-white/5 flex items-center gap-1.5 flex-wrap">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${cfg.color} border`}>
                            <span>{cfg.icon}</span>
                            <span>{cfg.label}</span>
                          </span>
                          {msg.analysis.priority !== 'LOW' && (
                            <span className="inline-flex items-center gap-1 text-[10px]">
                              <span className={`w-1.5 h-1.5 rounded-full ${PRIORITY_CFG[msg.analysis.priority].dot}`} />
                              <span className={PRIORITY_CFG[msg.analysis.priority].color}>{PRIORITY_CFG[msg.analysis.priority].label}</span>
                            </span>
                          )}
                          {msg.analysis.reason && (
                            <span className="text-[10px] text-gray-500 dark:text-zinc-400 italic ml-1">💡 {msg.analysis.reason}</span>
                          )}
                        </div>
                      )}
                    </div>

                    {sameSender && (
                      <p className="text-[10px] text-gray-400 dark:text-zinc-500 ml-1 mt-0.5">{formatTime(msg.sentAt)}</p>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
