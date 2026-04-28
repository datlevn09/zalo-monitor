'use client'

import { useEffect } from 'react'

type Props = {
  url: string
  type: 'image' | 'video'
  filename?: string
  onClose: () => void
}

export function Lightbox({ url, type, filename, onClose }: Props) {
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
          onClick={copyUrl}
          title="Copy link"
          className="px-3 py-1.5 text-xs font-medium text-white bg-white/10 hover:bg-white/20 rounded-lg backdrop-blur transition-colors"
        >🔗 Copy link</button>
        <button
          onClick={downloadFile}
          title="Tải về"
          className="px-3 py-1.5 text-xs font-medium text-white bg-white/10 hover:bg-white/20 rounded-lg backdrop-blur transition-colors"
        >⬇ Tải về</button>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          title="Mở trong tab mới"
          className="px-3 py-1.5 text-xs font-medium text-white bg-white/10 hover:bg-white/20 rounded-lg backdrop-blur transition-colors"
          onClick={e => e.stopPropagation()}
        >↗ Tab mới</a>
        <button
          onClick={onClose}
          title="Đóng (Esc)"
          className="w-8 h-8 flex items-center justify-center text-white bg-white/10 hover:bg-white/20 rounded-lg backdrop-blur transition-colors text-lg"
        >×</button>
      </div>

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
