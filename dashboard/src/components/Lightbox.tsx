'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'

type Props = {
  url: string
  type: 'image' | 'video'
  filename?: string
  onClose: () => void
}

type Group = { id: string; name: string; channelType: string; isDirect?: boolean }

export function Lightbox({ url, type, filename, onClose }: Props) {
  const [showForward, setShowForward] = useState(false)

  // Đóng khi nhấn ESC
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  function copyUrl() {
    navigator.clipboard.writeText(url)
  }

  async function downloadFile() {
    try {
      const res = await fetch(url)
      const blob = await res.blob()
      const blobUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = blobUrl
      a.download = filename || (type === 'video' ? 'video.mp4' : 'image.jpg')
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(blobUrl)
    } catch {
      // Fallback: open in new tab
      window.open(url, '_blank', 'noopener,noreferrer')
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      {/* Top toolbar */}
      <div className="absolute top-3 right-3 flex items-center gap-2" onClick={e => e.stopPropagation()}>
        <button
          onClick={() => setShowForward(true)}
          title="Chuyển tiếp sang nhóm khác"
          className="px-3 py-1.5 text-xs font-medium text-white bg-blue-500 hover:bg-blue-600 rounded-lg transition-colors"
        >↪ Forward</button>
        <button
          onClick={copyUrl}
          title="Copy link"
          className="px-3 py-1.5 text-xs font-medium text-white bg-white/10 hover:bg-white/20 rounded-lg backdrop-blur transition-colors"
        >🔗 Copy</button>
        <button
          onClick={downloadFile}
          title="Tải về"
          className="px-3 py-1.5 text-xs font-medium text-white bg-white/10 hover:bg-white/20 rounded-lg backdrop-blur transition-colors"
        >⬇ Tải</button>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          title="Mở trong tab mới"
          className="px-3 py-1.5 text-xs font-medium text-white bg-white/10 hover:bg-white/20 rounded-lg backdrop-blur transition-colors"
          onClick={e => e.stopPropagation()}
        >↗ Tab</a>
        <button
          onClick={onClose}
          title="Đóng (Esc)"
          className="w-8 h-8 flex items-center justify-center text-white bg-white/10 hover:bg-white/20 rounded-lg backdrop-blur transition-colors text-lg"
        >×</button>
      </div>

      {showForward && (
        <ForwardModal url={url} type={type} onClose={() => setShowForward(false)} onDone={onClose} />
      )}

      {/* Content */}
      <div className="max-w-[90vw] max-h-[90vh] flex items-center justify-center" onClick={e => e.stopPropagation()}>
        {type === 'image' ? (
          <img
            src={url}
            alt={filename || 'preview'}
            className="max-w-full max-h-[88vh] object-contain rounded-lg"
          />
        ) : (
          <video
            src={url}
            controls
            autoPlay
            playsInline
            className="max-w-full max-h-[88vh] rounded-lg bg-black"
          />
        )}
      </div>
    </div>
  )
}

function ForwardModal({ url, type, onClose, onDone }: { url: string; type: 'image' | 'video'; onClose: () => void; onDone: () => void }) {
  const [groups, setGroups] = useState<Group[]>([])
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [sending, setSending] = useState(false)
  const [done, setDone] = useState<{ ok: number; fail: number } | null>(null)

  useEffect(() => {
    api<Group[]>('/api/groups').then((g) => setGroups(g.filter(x => x.channelType === 'ZALO'))).catch(() => undefined)
  }, [])

  function toggle(id: string) {
    setSelected((s) => {
      const next = new Set(s)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  async function send() {
    if (selected.size === 0) return
    setSending(true)
    let ok = 0, fail = 0
    for (const groupId of selected) {
      try {
        await api(`/api/groups/${groupId}/send`, {
          method: 'POST',
          body: JSON.stringify({ mediaUrl: url, mediaType: type }),
        })
        ok++
      } catch {
        fail++
      }
    }
    setSending(false)
    setDone({ ok, fail })
    setTimeout(() => {
      onDone()
    }, 1500)
  }

  const filtered = groups.filter(g => g.name.toLowerCase().includes(search.toLowerCase()))

  return (
    <div
      className="fixed inset-0 z-[110] bg-black/80 flex items-center justify-center p-4"
      onClick={(e) => { e.stopPropagation(); onClose() }}
    >
      <div className="bg-white dark:bg-zinc-900 rounded-2xl w-full max-w-md max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="px-4 py-3 border-b border-gray-200 dark:border-white/10 flex items-center justify-between">
          <h3 className="font-semibold text-gray-900 dark:text-zinc-100">Chuyển tiếp tới nhóm</h3>
          <button onClick={onClose} className="w-7 h-7 text-gray-400 hover:text-gray-600 dark:hover:text-zinc-200">×</button>
        </div>

        {done ? (
          <div className="p-8 text-center">
            <div className="text-3xl mb-2">{done.fail === 0 ? '✓' : '⚠️'}</div>
            <p className="text-sm font-semibold text-gray-900 dark:text-zinc-100">
              Đã gửi tới {done.ok} nhóm{done.fail > 0 ? `, ${done.fail} lỗi` : ''}
            </p>
          </div>
        ) : (
          <>
            <div className="px-4 py-3 border-b border-gray-200 dark:border-white/10">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Tìm nhóm..."
                className="w-full px-3 py-2 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex-1 overflow-auto">
              {filtered.map((g) => (
                <button
                  key={g.id}
                  onClick={() => toggle(g.id)}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-gray-50 dark:hover:bg-white/5 transition-colors ${selected.has(g.id) ? 'bg-blue-50 dark:bg-blue-500/10' : ''}`}
                >
                  <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 ${selected.has(g.id) ? 'bg-blue-500 border-blue-500' : 'border-gray-300 dark:border-white/20'}`}>
                    {selected.has(g.id) && <span className="text-white text-xs">✓</span>}
                  </div>
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white text-xs font-bold shrink-0">
                    {g.name[0]?.toUpperCase()}
                  </div>
                  <span className="text-sm text-gray-900 dark:text-zinc-100 truncate">{g.name}</span>
                  {g.isDirect && <span className="text-[10px] text-gray-400 dark:text-zinc-500 shrink-0 ml-auto">DM</span>}
                </button>
              ))}
              {filtered.length === 0 && (
                <p className="p-6 text-center text-sm text-gray-400 dark:text-zinc-500">Không tìm thấy nhóm</p>
              )}
            </div>
            <div className="px-4 py-3 border-t border-gray-200 dark:border-white/10 flex items-center justify-between gap-3">
              <span className="text-xs text-gray-500 dark:text-zinc-400">
                {selected.size > 0 ? `${selected.size} nhóm đã chọn` : 'Chọn ít nhất 1 nhóm'}
              </span>
              <button
                onClick={send}
                disabled={selected.size === 0 || sending}
                className="px-4 py-2 text-sm font-semibold text-white bg-blue-500 hover:bg-blue-600 disabled:opacity-50 rounded-lg"
              >
                {sending ? 'Đang gửi...' : `Gửi tới ${selected.size} nhóm`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
