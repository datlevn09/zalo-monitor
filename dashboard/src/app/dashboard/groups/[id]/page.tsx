'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { api, connectWebSocket } from '@/lib/api'
import { LABEL_CFG, PRIORITY_CFG, formatTime, formatDateTime } from '@/lib/format'
import { channelDeepLink } from '@/lib/deeplink'
import { Lightbox } from '@/components/Lightbox'

type Message = {
  id: string
  senderType: 'SELF' | 'CONTACT'
  senderName: string | null
  senderId: string
  content: string | null
  contentType: string
  sentAt: string
  deletedAt?: string | null
  attachments?: string[]
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

type AiAnalysis = {
  summary: string
  sentiment: 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE'
  replies: [string, string, string]
  model: string
}

function parseMediaUrl(content: string | null, attachments?: string[]): string | null {
  // Ưu tiên attachments array (webhook handler set sẵn)
  if (attachments && attachments.length > 0) {
    const url = attachments.find(a => typeof a === 'string' && a.startsWith('http'))
    if (url) return url
  }
  if (!content) return null
  if (content.startsWith('http')) return content
  // Parse format openzca: "[media attached: <path> (mime) | <url>]"
  const m = content.match(/\|\s*(https?:\/\/[^\s\]]+)/)
  if (m) return m[1]
  try {
    const obj = JSON.parse(content)
    return obj.href ?? obj.url ?? obj.thumb ?? obj.thumbUrl ?? obj.mediaUrl ?? null
  } catch { return null }
}

function parseFileName(content: string | null): string {
  if (!content) return 'file'
  try {
    const obj = JSON.parse(content)
    return obj.name ?? obj.fileName ?? obj.title ?? 'file'
  } catch { return 'file' }
}

export default function GroupDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [group, setGroup] = useState<Group | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const [aiPanel, setAiPanel] = useState(false)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiResult, setAiResult] = useState<AiAnalysis | null>(null)
  const [sendText, setSendText] = useState('')
  const [sending, setSending] = useState(false)
  const [pendingFile, setPendingFile] = useState<{ url: string; mediaType: 'image' | 'video' | 'file'; filename: string; previewUrl?: string } | null>(null)
  const [uploading, setUploading] = useState(false)
  const [lightbox, setLightbox] = useState<{ url: string; type: 'image' | 'video' } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)

  async function uploadFile(file: File) {
    if (!file || uploading) return
    setUploading(true); setSendError(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const token = localStorage.getItem('token')
      const tenantId = localStorage.getItem('tenantId')
      const apiBase = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'
      const res = await fetch(`${apiBase}/api/groups/${id}/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'X-Tenant-Id': tenantId ?? '' },
        body: fd,
      })
      if (!res.ok) throw new Error(`Upload fail ${res.status}`)
      const data = await res.json()
      setPendingFile({
        url: data.url,
        mediaType: data.mediaType,
        filename: data.filename,
        previewUrl: data.mediaType === 'image' ? URL.createObjectURL(file) : undefined,
      })
    } catch (err: any) {
      setSendError(`Upload thất bại: ${err.message}`)
    } finally {
      setUploading(false)
    }
  }

  function onPaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const items = e.clipboardData?.items
    if (!items) return
    for (const it of Array.from(items)) {
      if (it.kind === 'file') {
        const file = it.getAsFile()
        if (file) { e.preventDefault(); uploadFile(file); return }
      }
    }
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    const files = e.dataTransfer?.files
    if (files && files.length > 0) uploadFile(files[0])
  }
  const [sendError, setSendError] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const lastMsgCountRef = useRef(0)
  const [showScrollDown, setShowScrollDown] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Dev mode: chỉ active khi URL có ?showDeleted=1 (backend cũng check email DEV_EMAIL).
  // Không có UI toggle — user thường không biết tới feature này.
  const showDeleted = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('showDeleted') === '1'
  const loadGroup = () => api<Group[]>('/api/groups').then(gs => setGroup(gs.find(g => g.id === id) ?? null))
  const loadMessages = () => api<Message[]>(`/api/messages?groupId=${id}&limit=100${showDeleted ? '&showDeleted=1' : ''}`).then(m => {
    setMessages(m)
    setLoading(false)
  })

  async function runAiAnalyze() {
    setAiLoading(true)
    setAiResult(null)
    setAiPanel(true)
    try {
      const res = await api<AiAnalysis>(`/api/groups/${id}/analyze`, { method: 'POST' })
      setAiResult(res)
    } catch {
      setAiResult(null)
    } finally {
      setAiLoading(false)
    }
  }

  function useReply(text: string) {
    setSendText(text)
    setAiPanel(false)
    setTimeout(() => textareaRef.current?.focus(), 100)
  }

  async function handleSend() {
    const text = sendText.trim()
    if (!text && !pendingFile) return
    if (sending) return
    setSending(true)
    setSendError(null)
    const payload = {
      text,
      mediaUrl: pendingFile?.url,
      mediaType: pendingFile?.mediaType,
    }
    setSendText(''); setPendingFile(null)
    try {
      const res = await api<{ ok: boolean; queued?: boolean; message?: Message }>(`/api/groups/${id}/send`, {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      if (res.message) {
        setMessages(prev => [...prev, res.message!])
      } else if (res.queued) {
        // Queued — will appear when hook processes it
        const optimistic: Message = {
          id: `optimistic-${Date.now()}`,
          senderType: 'SELF',
          senderName: 'Bạn',
          senderId: 'bot',
          content: text,
          contentType: 'TEXT',
          sentAt: new Date().toISOString(),
          analysis: null,
        }
        setMessages(prev => [...prev, optimistic])
      }
    } catch (err: any) {
      setSendError(err?.message ?? 'Gửi thất bại')
      setSendText(text) // restore
    } finally {
      setSending(false)
    }
  }

  // Auto-resize textarea
  function handleTextareaChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setSendText(e.target.value)
    e.target.style.height = 'auto'
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'
  }

  useEffect(() => {
    loadGroup()
    loadMessages()
    const close = connectWebSocket((event, data) => {
      if (event === 'message:new' && data.groupId === id) loadMessages()
      if (event === 'analysis:result' && data.groupId === id) loadMessages()
    })
    // Polling fallback: WS có thể fail qua Cloudflare/proxy → poll mỗi 5s khi user
    // ở chat detail page. Stop khi unmount hoặc tab inactive.
    const pollInterval = setInterval(() => {
      if (document.visibilityState === 'visible') loadMessages()
    }, 5000)
    return () => { close(); clearInterval(pollInterval) }
  }, [id])

  // Theo dõi vị trí scroll để show/hide nút "cuộn về cuối"
  useEffect(() => {
    const c = messagesContainerRef.current
    if (!c) return
    const onScroll = () => {
      const distance = c.scrollHeight - c.scrollTop - c.clientHeight
      setShowScrollDown(distance > 200)
    }
    c.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => c.removeEventListener('scroll', onScroll)
  }, [loading, messages.length])

  // Auto-scroll: chỉ scroll xuống cuối khi
  //  (a) lần đầu load (loading vừa false → có data),
  //  (b) số lượng tin TĂNG (tin mới về) VÀ user đang ở gần đáy (<150px).
  // Không scroll nếu user đang cuộn lên đọc tin cũ → tránh giật về cuối liên tục.
  useEffect(() => {
    if (loading) return
    const prev = lastMsgCountRef.current
    const curr = messages.length
    lastMsgCountRef.current = curr
    if (prev === 0) {
      // Lần đầu load — scroll xuống ngay (instant để không thấy giật)
      messagesEndRef.current?.scrollIntoView({ behavior: 'auto' })
      return
    }
    if (curr > prev) {
      const c = messagesContainerRef.current
      if (!c) return
      const distanceFromBottom = c.scrollHeight - c.scrollTop - c.clientHeight
      if (distanceFromBottom < 150) {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
      }
    }
  }, [messages, loading])

  if (!group) return (
    <div className="p-8 text-center text-gray-400 dark:text-zinc-500">Đang tải...</div>
  )

  return (
    <div className="flex flex-col h-screen md:h-[calc(100vh)]">
      {/* Header */}
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

          <button
            onClick={runAiAnalyze}
            className="inline-flex items-center gap-1 px-3 py-1.5 bg-violet-500 hover:bg-violet-600 text-white text-xs font-medium rounded-full transition-colors"
          >
            <span>✨</span><span>AI</span>
          </button>

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

      {/* AI Panel — nổi rõ trên chat: bg gradient violet + border + shadow */}
      {aiPanel && (
        <div className="px-3 md:px-4 pt-3 md:pt-4 max-w-3xl mx-auto w-full">
          <div className="bg-gradient-to-br from-violet-50 via-indigo-50 to-blue-50 dark:from-violet-500/10 dark:via-indigo-500/10 dark:to-blue-500/10 ring-1 ring-violet-200 dark:ring-violet-500/30 rounded-2xl px-4 py-3.5 shadow-md">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-violet-700 dark:text-violet-300 flex items-center gap-1.5">
              <span>✨</span> Trợ lý AI
            </p>
            <button onClick={() => setAiPanel(false)} className="w-7 h-7 rounded-full hover:bg-violet-100 dark:hover:bg-violet-500/20 flex items-center justify-center text-violet-600 dark:text-violet-300 leading-none">×</button>
          </div>

          {aiLoading && (
            <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-zinc-400">
              <span className="w-4 h-4 border-2 border-violet-400 border-t-transparent rounded-full animate-spin" />
              Đang phân tích hội thoại...
            </div>
          )}

          {!aiLoading && aiResult && (
            <div className="space-y-3">
              <div className="bg-violet-50 dark:bg-violet-500/10 rounded-xl px-4 py-3 flex gap-3 items-start">
                <div className="flex-1">
                  <p className="text-xs font-semibold text-violet-700 dark:text-violet-300 mb-1">Tóm tắt hội thoại</p>
                  <p className="text-sm text-gray-800 dark:text-zinc-200">{aiResult.summary}</p>
                </div>
                <span className={`shrink-0 text-xs font-semibold px-2 py-1 rounded-full ${
                  aiResult.sentiment === 'POSITIVE' ? 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-300' :
                  aiResult.sentiment === 'NEGATIVE' ? 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300' :
                  'bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-zinc-300'
                }`}>
                  {aiResult.sentiment === 'POSITIVE' ? '😊 Tích cực' : aiResult.sentiment === 'NEGATIVE' ? '😟 Tiêu cực' : '😐 Trung lập'}
                </span>
              </div>

              {group.channelType === 'ZALO' && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 dark:text-zinc-400 mb-2">💬 Gợi ý câu trả lời</p>
                  <div className="space-y-1.5">
                    {aiResult.replies.map((reply, i) => (
                      <button
                        key={i}
                        onClick={() => useReply(reply)}
                        className="w-full text-left px-3 py-2 rounded-lg bg-gray-50 dark:bg-zinc-800 hover:bg-violet-50 dark:hover:bg-violet-500/10 border border-gray-200 dark:border-white/10 hover:border-violet-300 dark:hover:border-violet-500/30 transition-colors group"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm text-gray-800 dark:text-zinc-200 flex-1">{reply}</p>
                          <span className="shrink-0 text-[10px] font-medium text-gray-400 group-hover:text-violet-500 transition-colors whitespace-nowrap">
                            ↩ Dùng để trả lời
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <p className="text-[10px] text-gray-400 dark:text-zinc-500">Model: {aiResult.model}</p>
            </div>
          )}
          </div>
        </div>
      )}

      {/* Chat thread */}
      <div ref={messagesContainerRef} className="flex-1 overflow-auto bg-[#f2f2f7] dark:bg-zinc-950">
        <div className="max-w-3xl mx-auto p-4 space-y-3">
          {loading && <p className="text-center text-gray-400 dark:text-zinc-500 text-sm">Đang tải tin nhắn...</p>}

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

            const mediaUrl = parseMediaUrl(msg.content, (msg as any).attachments)

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
                      {isSelf ? '👤' : (msg.senderName?.[0]?.toUpperCase() ?? '?')}
                    </div>
                  ) : (
                    <div className="w-8 shrink-0" />
                  )}

                  <div className={`flex-1 min-w-0 group ${isSelf ? 'flex flex-col items-end' : ''}`}>
                    {!sameSender && (
                      <div className={`flex items-baseline gap-2 mb-1 ${isSelf ? 'flex-row-reverse' : ''}`}>
                        <p className="text-xs font-semibold text-gray-700 dark:text-zinc-300">
                          {isSelf ? 'Bạn' : (msg.senderName ?? 'Ẩn danh')}
                        </p>
                        <p className="text-[10px] text-gray-400 dark:text-zinc-500">{formatTime(msg.sentAt)}</p>
                        <CopyBtn text={msg.content ?? ''} />
                      </div>
                    )}

                    <div className={`inline-block max-w-[85%] rounded-2xl px-3.5 py-2 ${
                      isSelf
                        ? 'bg-blue-500 text-white'
                        : isFlagged
                          ? 'bg-white dark:bg-zinc-800 ring-2 ring-offset-2 ring-offset-[#f2f2f7] dark:ring-offset-zinc-950 ' + (cfg?.color.replace('text-', 'ring-').split(' ').find(c => c.startsWith('ring-')) ?? 'ring-blue-200 dark:ring-blue-500/30')
                          : 'bg-white dark:bg-zinc-800'
                    } shadow-[0_1px_2px_rgba(0,0,0,0.04)]`}>

                      {msg.contentType === 'IMAGE' ? (
                        mediaUrl ? (
                          <button
                            type="button"
                            onClick={() => setLightbox({ url: mediaUrl, type: 'image' })}
                            className="block focus:outline-none"
                          >
                            <img
                              src={mediaUrl}
                              alt="ảnh"
                              className="max-w-[220px] max-h-[220px] rounded-xl object-cover hover:opacity-90 cursor-zoom-in transition-opacity"
                              onError={e => { (e.target as HTMLImageElement).parentElement!.innerHTML = '<p class="text-sm italic text-gray-400 p-1">[hình ảnh không tải được]</p>' }}
                            />
                          </button>
                        ) : (
                          <p className={`text-sm italic ${isSelf ? 'text-blue-100' : 'text-gray-400 dark:text-zinc-500'}`}>🖼️ [hình ảnh]</p>
                        )
                      ) : msg.contentType === 'STICKER' ? (
                        mediaUrl ? (
                          <img src={mediaUrl} alt="sticker" className="w-20 h-20 object-contain" />
                        ) : (
                          <p className="text-sm">😊 [sticker]</p>
                        )
                      ) : msg.contentType === 'FILE' ? (
                        mediaUrl ? (
                          <a href={mediaUrl} target="_blank" rel="noopener noreferrer"
                            className={`flex items-center gap-2 text-sm hover:underline ${isSelf ? 'text-blue-100' : 'text-blue-600 dark:text-blue-400'}`}>
                            <span>📎</span>
                            <span>{parseFileName(msg.content)}</span>
                          </a>
                        ) : (
                          <p className={`text-sm italic ${isSelf ? 'text-blue-100' : 'text-gray-400 dark:text-zinc-500'}`}>📎 [file]</p>
                        )
                      ) : msg.contentType === 'VIDEO' ? (
                        mediaUrl ? (
                          <button
                            type="button"
                            onClick={() => setLightbox({ url: mediaUrl, type: 'video' })}
                            className="relative block focus:outline-none group/vid"
                          >
                            <video
                              src={mediaUrl}
                              playsInline
                              muted
                              preload="metadata"
                              className="max-w-[260px] max-h-[200px] rounded-xl bg-black cursor-pointer"
                              onError={e => {
                                const el = e.target as HTMLVideoElement
                                el.style.display = 'none'
                              }}
                            />
                            <span className="absolute inset-0 flex items-center justify-center pointer-events-none">
                              <span className="w-12 h-12 rounded-full bg-black/60 backdrop-blur flex items-center justify-center group-hover/vid:bg-black/80 transition-colors">
                                <span className="text-white text-xl pl-1">▶</span>
                              </span>
                            </span>
                          </button>
                        ) : (
                          <a href={`zalo://conversation?groupid=${group.externalId}`}
                            className={`flex items-center gap-2 text-sm ${isSelf ? 'text-blue-100' : 'text-gray-600 dark:text-zinc-300'}`}>
                            <span>🎬</span>
                            <span>Video · <span className={`font-medium ${isSelf ? 'text-blue-200' : 'text-blue-500 dark:text-blue-400 hover:underline'}`}>Mở trong Zalo ↗</span></span>
                          </a>
                        )
                      ) : msg.contentType === 'VOICE' ? (
                        <a href={`zalo://conversation?groupid=${group.externalId}`}
                          className={`flex items-center gap-3 text-sm group/voice ${isSelf ? 'text-blue-100' : 'text-gray-700 dark:text-zinc-300'}`}>
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${isSelf ? 'bg-blue-400/40' : 'bg-gray-100 dark:bg-zinc-700'}`}>
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3zm-1 3a1 1 0 0 1 2 0v8a1 1 0 0 1-2 0V4zM7 10H5a7 7 0 0 0 14 0h-2a5 5 0 0 1-10 0zm5 9v2H9v2h6v-2h-3v-2a7 7 0 0 0 7-7h-2a5 5 0 0 1-10 0H5a7 7 0 0 0 7 7z"/>
                            </svg>
                          </div>
                          <div>
                            <p className="text-xs font-medium">Tin nhắn thoại</p>
                            <p className={`text-[10px] group-hover/voice:underline ${isSelf ? 'text-blue-200' : 'text-blue-500 dark:text-blue-400'}`}>Mở trong Zalo để nghe ↗</p>
                          </div>
                        </a>
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
                      <div className={`flex items-center gap-1.5 mt-0.5 ${isSelf ? 'flex-row-reverse mr-1' : 'ml-1'}`}>
                        <p className="text-[10px] text-gray-400 dark:text-zinc-500">{formatTime(msg.sentAt)}</p>
                        <CopyBtn text={msg.content ?? ''} />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
          <div ref={messagesEndRef} />
        </div>

      </div>

      {/* Nút "cuộn về cuối" — fixed ngay phía trên ô nhập, z-index cao */}
      {showScrollDown && group.channelType === 'ZALO' && (
        <button
          onClick={() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })}
          aria-label="Cuộn về tin mới nhất"
          className="fixed right-4 md:right-8 bottom-32 md:bottom-36 z-30 w-11 h-11 rounded-full bg-white dark:bg-zinc-800 shadow-lg ring-1 ring-gray-200 dark:ring-white/10 flex items-center justify-center text-gray-700 dark:text-zinc-200 hover:bg-gray-50 dark:hover:bg-zinc-700 transition"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
      )}

      {/* Send input — only for ZALO. Nền trong suốt, dùng cùng bg chat thread */}
      {group.channelType === 'ZALO' && (
        <div className="border-t border-gray-200 dark:border-white/10 bg-[#f2f2f7] dark:bg-zinc-950 px-4 py-3 sticky bottom-0">
          <div
            className="max-w-3xl mx-auto"
            onDragOver={e => { e.preventDefault() }}
            onDrop={onDrop}
          >
            {pendingFile && (
              <div className="mb-2 flex items-center gap-2 bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/30 rounded-xl p-2">
                {pendingFile.previewUrl ? (
                  <img src={pendingFile.previewUrl} alt={pendingFile.filename} className="w-12 h-12 object-cover rounded shrink-0" />
                ) : (
                  <span className="text-2xl shrink-0">{pendingFile.mediaType === 'video' ? '🎬' : '📎'}</span>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-gray-900 dark:text-zinc-100 truncate">{pendingFile.filename}</p>
                  <p className="text-[10px] text-gray-500 dark:text-zinc-400">{pendingFile.mediaType} — sẽ gửi kèm tin nhắn</p>
                </div>
                <button onClick={() => setPendingFile(null)}
                  className="text-gray-500 hover:text-gray-700 dark:text-zinc-400 px-2 text-lg">×</button>
              </div>
            )}
            <input ref={fileInputRef} type="file" className="hidden"
              accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.zip"
              onChange={e => { const f = e.target.files?.[0]; if (f) uploadFile(f); e.target.value = '' }}
            />
            <input ref={imageInputRef} type="file" className="hidden"
              accept="image/*"
              onChange={e => { const f = e.target.files?.[0]; if (f) uploadFile(f); e.target.value = '' }}
            />

            {/* Toolbar — giống Zalo: 1 hàng icon trên ô nhập */}
            <div className="flex items-center gap-1 mb-1.5 px-1 text-gray-500 dark:text-zinc-400">
              <ToolBtn title="Ảnh" onClick={() => imageInputRef.current?.click()} disabled={uploading}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
              </ToolBtn>
              <ToolBtn title="Đính kèm file" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
              </ToolBtn>
              <ToolBtn title="AI phân tích cuộc hội thoại" onClick={runAiAnalyze} disabled={aiLoading}>
                {aiLoading ? <span className="w-[18px] h-[18px] border-2 border-purple-500 border-t-transparent rounded-full animate-spin" /> : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/></svg>
                )}
              </ToolBtn>
              {uploading && <span className="ml-1 text-[11px] text-gray-400">Đang upload...</span>}
            </div>

            <div className="flex items-end gap-2">
            <textarea
              ref={textareaRef}
              value={sendText}
              onChange={handleTextareaChange}
              onPaste={onPaste}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
              }}
              placeholder={pendingFile ? "Caption (tuỳ chọn)..." : "Nhập tin... (Enter gửi · Paste/Drag ảnh để đính kèm)"}
              rows={1}
              style={{ minHeight: '42px', maxHeight: '120px', height: '42px' }}
              className="flex-1 resize-none px-3.5 py-2.5 rounded-2xl border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-zinc-800 text-sm text-gray-900 dark:text-zinc-100 placeholder-gray-400 dark:placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 transition-all overflow-hidden"
              disabled={sending}
            />
            <button
              onClick={handleSend}
              disabled={sending || (!sendText.trim() && !pendingFile)}
              className="w-10 h-10 rounded-full bg-blue-500 hover:bg-blue-600 disabled:bg-blue-200 dark:disabled:bg-blue-800/50 text-white flex items-center justify-center shrink-0 transition-colors"
            >
              {sending ? (
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <svg className="w-5 h-5 translate-x-0.5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
                </svg>
              )}
            </button>
            </div>
          </div>
          {sendError && (
            <p className="text-xs text-red-500 dark:text-red-400 mt-1.5 max-w-3xl mx-auto">{sendError}</p>
          )}
        </div>
      )}

      {lightbox && (
        <Lightbox url={lightbox.url} type={lightbox.type} onClose={() => setLightbox(null)} />
      )}
    </div>
  )
}

/** Toolbar button trên ô nhập tin (style giống Zalo). */
function ToolBtn({ children, title, onClick, disabled }: {
  children: React.ReactNode; title: string; onClick: () => void; disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      className="w-8 h-8 rounded-md hover:bg-gray-100 dark:hover:bg-white/10 flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
    >
      {children}
    </button>
  )
}

/** Nút copy nội dung tin nhắn — hover-revealed bên cạnh thời gian/sender. */
function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  if (!text) return null
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(text).catch(() => undefined)
        setCopied(true); setTimeout(() => setCopied(false), 1500)
      }}
      title={copied ? 'Đã copy' : 'Copy tin nhắn'}
      aria-label="Copy"
      className="opacity-0 group-hover:opacity-100 transition-opacity inline-flex items-center justify-center w-5 h-5 rounded text-gray-400 hover:text-gray-700 dark:hover:text-zinc-200 hover:bg-gray-100 dark:hover:bg-white/10"
    >
      {copied ? (
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
      ) : (
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
      )}
    </button>
  )
}
