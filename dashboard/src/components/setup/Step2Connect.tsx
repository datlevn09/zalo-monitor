'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import type { SetupState } from '@/app/setup/page'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

type Admin = { name: string; zalo: string; telegram: string; email: string }
type Mode = 'docker' | 'host' | 'windows'

export function Step2Connect({ setup, onDone }: { setup: SetupState; onDone: () => void }) {
  const [connected, setConnected] = useState(false)
  const [source, setSource] = useState<'hook-ping' | 'first-message' | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const [commands, setCommands] = useState({ oneLineCommand: '', dockerCommand: '', windowsCommand: '' })
  const [mode, setMode] = useState<Mode>(() => {
    if (typeof window === 'undefined') return 'host'
    // Ưu tiên user chọn (localStorage). Nếu chưa chọn → auto detect từ user-agent.
    const saved = localStorage.getItem('zm:mode') as Mode | null
    if (saved) return saved
    const ua = navigator.userAgent.toLowerCase()
    if (ua.includes('windows') || ua.includes('win64') || ua.includes('win32')) return 'windows'
    // Mac/Linux/iOS dùng host (curl bash)
    return 'host'
  })
  const [admin, setAdmin] = useState<Admin | null>(null)
  const [showHelp, setShowHelp] = useState(false)

  useEffect(() => {
    if (typeof window !== 'undefined') localStorage.setItem('zm:mode', mode)
  }, [mode])

  useEffect(() => {
    fetch(`${API}/api/setup/inject-command?tenantId=${setup.tenantId}`)
      .then(r => r.json())
      .then(d => {
        setCommands({ oneLineCommand: d.oneLineCommand, dockerCommand: d.dockerCommand, windowsCommand: d.windowsCommand ?? '' })
        setAdmin(d.admin)
      })
  }, [setup.tenantId])

  useEffect(() => {
    const es = new EventSource(`${API}/api/setup/connection-status?tenantId=${setup.tenantId}`)
    es.onmessage = (e) => {
      const d = JSON.parse(e.data)
      if (d.connected) {
        setConnected(true)
        setSource(d.source ?? null)
        es.close()
      }
    }
    return () => es.close()
  }, [setup.tenantId])

  function copy(text: string, key: string) {
    navigator.clipboard.writeText(text)
    setCopied(key)
    setTimeout(() => setCopied(null), 2000)
  }

  const command = mode === 'docker' ? commands.dockerCommand : mode === 'windows' ? commands.windowsCommand : commands.oneLineCommand

  // Text gửi admin khi cần hỗ trợ
  const supportMessage = `Xin chào ${admin?.name ?? 'support'}, tôi cần hỗ trợ cài đặt Zalo Monitor.
Tenant: ${setup.tenantId}
Lệnh cần chạy trên máy chủ của tôi:
${commands.dockerCommand || commands.oneLineCommand}`

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-zinc-100">Kết nối Zalo</h2>
        <p className="text-sm text-gray-500 dark:text-zinc-400 mt-1">Chạy lệnh sau trên máy chủ để cài listener Zalo Monitor</p>
      </div>

      {/* Mode selector - iOS segmented */}
      <div>
        <p className="text-[11px] text-gray-500 dark:text-zinc-400 mb-1.5">Chọn loại máy anh sẽ chạy listener:</p>
        <div className="bg-gray-100 dark:bg-white/10 p-1 rounded-xl grid grid-cols-3 gap-0.5">
          <button type="button" onClick={() => setMode('windows')}
            className={`py-2 rounded-lg text-sm font-medium transition-all ${mode === 'windows' ? 'bg-white dark:bg-white/15 text-gray-900 dark:text-white shadow-sm' : 'text-gray-600 dark:text-zinc-400'}`}>
            🪟 Windows
          </button>
          <button type="button" onClick={() => setMode('host')}
            className={`py-2 rounded-lg text-sm font-medium transition-all ${mode === 'host' ? 'bg-white dark:bg-white/15 text-gray-900 dark:text-white shadow-sm' : 'text-gray-600 dark:text-zinc-400'}`}>
            🐧 Mac/Linux
          </button>
          <button type="button" onClick={() => setMode('docker')}
            className={`py-2 rounded-lg text-sm font-medium transition-all ${mode === 'docker' ? 'bg-white dark:bg-white/15 text-gray-900 dark:text-white shadow-sm' : 'text-gray-600 dark:text-zinc-400'}`}>
            🐳 Docker
          </button>
        </div>
        {/* Auto-detect hint */}
        {typeof navigator !== 'undefined' && (() => {
          const ua = navigator.userAgent.toLowerCase()
          const detected: Mode = ua.includes('windows') ? 'windows' : ua.includes('mac') || ua.includes('linux') ? 'host' : 'host'
          if (detected !== mode) {
            return (
              <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1.5">
                💡 Trình duyệt của anh đang chạy trên <strong>{detected === 'windows' ? 'Windows' : 'Mac/Linux'}</strong> — chọn tab tương ứng nếu listener cũng chạy trên máy này.
              </p>
            )
          }
          return null
        })()}
      </div>

      {/* Command box */}
      <div>
        <p className="text-xs text-gray-500 dark:text-zinc-400 mb-2">
          {mode === 'docker'
            ? 'Mở terminal trên máy đang chạy Docker, paste lệnh này:'
            : mode === 'windows'
            ? 'Mở PowerShell (Run as Administrator), paste lệnh này:'
            : 'Mở terminal trên máy chủ, paste lệnh này:'}
        </p>
        <div className="bg-gray-900 dark:bg-black/60 dark:ring-1 dark:ring-white/5 rounded-xl p-4 font-mono text-xs text-green-400 break-all whitespace-pre-wrap">
          {command || 'Đang tải...'}
        </div>
        <div className="flex gap-2 mt-2">
          <Button variant="outline" size="sm" onClick={() => copy(command, mode)} disabled={!command}>
            {copied === mode ? '✓ Đã copy' : '📋 Copy lệnh'}
          </Button>
          <button
            onClick={() => setShowHelp(true)}
            className="text-sm text-blue-500 hover:text-blue-600 font-medium"
          >
            Cần hỗ trợ?
          </button>
        </div>
      </div>

      {/* Visual step-by-step guide */}
      <details className="group" open>
        <summary className="cursor-pointer text-sm text-gray-700 dark:text-zinc-300 font-medium flex items-center gap-2 hover:text-gray-900 list-none">
          <svg className="w-4 h-4 transition-transform group-open:rotate-90" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/>
          </svg>
          <span>Xem hướng dẫn từng bước</span>
        </summary>
        <div className="mt-3 space-y-2">
          {mode === 'host' && (
            <GuideStep num={1} title="SSH vào máy chủ" desc='Mở Terminal trên máy của bạn, chạy: ssh user@your-server-ip (thay user và IP thực tế). Nếu dùng key: ssh -i ~/.ssh/key.pem user@your-server-ip' />
          )}
          {mode === 'windows' && (
            <GuideStep num={1} title="Mở PowerShell" desc='Tìm kiếm "PowerShell" → Click phải → "Run as Administrator"' />
          )}
          <GuideStep num={mode === 'host' ? 2 : (mode === 'windows' ? 2 : 1)} title="Mở Terminal" desc={mode === 'docker'
            ? 'Mở ứng dụng Terminal trên máy Mac/Windows đang chạy Docker (biểu tượng màn hình đen)'
            : mode === 'windows'
            ? 'Đã có PowerShell Administrator rồi'
            : 'Sau khi SSH thành công, bạn đang ở trong terminal của máy chủ VPS rồi'} />
          <GuideStep num={mode === 'host' ? 3 : (mode === 'windows' ? 3 : 2)} title="Paste lệnh" desc={mode === 'windows'
            ? 'Nhấn nút 📋 Copy lệnh ở trên, sau đó dán vào PowerShell (Ctrl+V - tự động paste được)'
            : 'Nhấn nút 📋 Copy lệnh ở trên, sau đó dán vào terminal (⌘V trên Mac, Ctrl+V trên Linux)'} />
          <GuideStep num={mode === 'host' ? 4 : (mode === 'windows' ? 4 : 3)} title="Nhấn Enter" desc="Đợi 2-3 giây, hook sẽ tự tải và enable. Nếu thấy '🎉 Hoàn tất!' là OK." />
          <GuideStep num={mode === 'host' ? 5 : (mode === 'windows' ? 5 : 4)} title="Gửi thử 1 tin" desc="Nhắn bất kỳ tin trong nhóm Telegram/Zalo có bot → dashboard sẽ tự detect ở dưới" />
        </div>
      </details>

      {/* What it does */}
      <div className="bg-blue-50 dark:bg-blue-500/10 border border-blue-100 dark:border-blue-500/20 rounded-xl p-3.5 text-sm text-blue-900 dark:text-blue-200">
        <p className="font-medium mb-1 text-xs">Lệnh này sẽ:</p>
        <ul className="text-xs space-y-0.5 text-blue-800 dark:text-blue-300">
          <li>• Cài listener vào <code className="bg-blue-100 dark:bg-blue-500/20 px-1 rounded text-[11px]">~/.zalo-monitor/</code></li>
          <li>• Auto chạy nền dạng systemd service</li>
          <li>• Forward tin nhắn Zalo tới backend (read-only)</li>
        </ul>
      </div>

      {/* Connection status */}
      <div className={`rounded-xl p-4 transition-all ${connected ? 'bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-500/30' : 'bg-gray-50 dark:bg-white/5 border-2 border-dashed border-gray-300 dark:border-white/15'}`}>
        <div className="flex items-center gap-3">
          <div className="relative w-3 h-3">
            <div className={`absolute inset-0 rounded-full ${connected ? 'bg-green-500' : 'bg-gray-300 dark:bg-white/25 animate-pulse'}`} />
            {connected && <div className="absolute inset-0 rounded-full bg-green-500 animate-ping" />}
          </div>
          <div className="flex-1">
            <p className="font-medium text-sm text-gray-900 dark:text-zinc-100">
              {connected
                ? (source === 'hook-ping' ? '✅ Hook đã kết nối!' : '✅ Đã nhận tin nhắn đầu tiên!')
                : 'Đang chờ hook ping...'}
            </p>
            <p className="text-xs text-gray-500 dark:text-zinc-400 mt-0.5">
              {connected
                ? (source === 'hook-ping'
                    ? 'Script install đã ping backend — gửi 1 tin trong nhóm để test luồng end-to-end'
                    : 'Hook đã hoạt động, dashboard đã nhận được tin nhắn')
                : 'Copy lệnh trên, chạy trong terminal của máy chủ'}
            </p>
          </div>
          {connected && <Badge className="bg-green-500">Live</Badge>}
        </div>
      </div>

      <div className="space-y-2">
        <Button className="w-full" disabled={!connected} onClick={onDone}>
          {connected ? 'Tiếp theo →' : 'Chờ kết nối...'}
        </Button>
        {!connected && (
          <button onClick={onDone} className="w-full text-xs text-gray-500 dark:text-zinc-400 hover:text-gray-700 dark:text-zinc-300 py-1">
            Bỏ qua bước này (cài hook sau)
          </button>
        )}
      </div>

      {/* Help Modal */}
      {showHelp && admin && (
        <HelpModal
          admin={admin}
          supportMessage={supportMessage}
          onClose={() => setShowHelp(false)}
        />
      )}
    </div>
  )
}

function GuideStep({ num, title, desc }: { num: number; title: string; desc: string }) {
  return (
    <div className="flex gap-3 bg-gray-50 dark:bg-white/5 rounded-xl p-3">
      <div className="w-6 h-6 rounded-full bg-blue-500 text-white text-xs font-bold flex items-center justify-center shrink-0">
        {num}
      </div>
      <div>
        <p className="text-sm font-medium text-gray-900 dark:text-zinc-100">{title}</p>
        <p className="text-xs text-gray-500 dark:text-zinc-400 mt-0.5">{desc}</p>
      </div>
    </div>
  )
}

function HelpModal({ admin, supportMessage, onClose }: {
  admin: Admin
  supportMessage: string
  onClose: () => void
}) {
  const [copied, setCopied] = useState(false)

  function copyMessage() {
    navigator.clipboard.writeText(supportMessage)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const zaloLink = admin.zalo ? `https://zalo.me/${admin.zalo.replace(/^0/, '84')}` : ''
  const telegramLink = admin.telegram ? `https://t.me/${admin.telegram.replace(/^@/, '')}` : ''
  const emailLink = admin.email ? `mailto:${admin.email}?subject=${encodeURIComponent('Hỗ trợ Zalo Monitor')}&body=${encodeURIComponent(supportMessage)}` : ''

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end md:items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white dark:bg-zinc-900 dark:ring-1 dark:ring-white/10 rounded-3xl w-full max-w-md max-h-[90vh] overflow-auto shadow-2xl" onClick={e => e.stopPropagation()}>
        {/* Handle bar - iOS */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-gray-300 dark:bg-white/20 rounded-full" />
        </div>

        <div className="p-6">
          <div className="text-center mb-6">
            <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-blue-500/10 flex items-center justify-center text-2xl">
              🙋‍♂️
            </div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-zinc-100">Cần hỗ trợ cài đặt?</h3>
            <p className="text-sm text-gray-500 dark:text-zinc-400 mt-1">Liên hệ trực tiếp với {admin.name} để được giúp</p>
          </div>

          {/* Contact buttons */}
          <div className="space-y-2 mb-5">
            {zaloLink && (
              <a href={zaloLink} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-3 w-full p-3.5 bg-blue-50 dark:bg-blue-500/10 hover:bg-blue-100 dark:hover:bg-blue-500/20 rounded-2xl transition-colors">
                <div className="w-10 h-10 rounded-2xl bg-blue-500 flex items-center justify-center text-white font-bold">Z</div>
                <div className="flex-1 text-left">
                  <p className="text-sm font-semibold text-gray-900 dark:text-zinc-100">Zalo</p>
                  <p className="text-xs text-gray-500 dark:text-zinc-400">{admin.zalo}</p>
                </div>
                <ArrowIcon />
              </a>
            )}

            {telegramLink && (
              <a href={telegramLink} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-3 w-full p-3.5 bg-sky-50 dark:bg-sky-500/10 hover:bg-sky-100 rounded-2xl transition-colors">
                <div className="w-10 h-10 rounded-2xl bg-sky-500 flex items-center justify-center text-white text-lg">✈️</div>
                <div className="flex-1 text-left">
                  <p className="text-sm font-semibold text-gray-900 dark:text-zinc-100">Telegram</p>
                  <p className="text-xs text-gray-500 dark:text-zinc-400">@{admin.telegram.replace(/^@/, '')}</p>
                </div>
                <ArrowIcon />
              </a>
            )}

            {emailLink && (
              <a href={emailLink}
                className="flex items-center gap-3 w-full p-3.5 bg-gray-50 dark:bg-white/5 hover:bg-gray-100 dark:hover:bg-white/10 rounded-2xl transition-colors">
                <div className="w-10 h-10 rounded-2xl bg-gray-500 flex items-center justify-center text-white text-lg">✉️</div>
                <div className="flex-1 text-left">
                  <p className="text-sm font-semibold text-gray-900 dark:text-zinc-100">Email</p>
                  <p className="text-xs text-gray-500 dark:text-zinc-400 truncate">{admin.email}</p>
                </div>
                <ArrowIcon />
              </a>
            )}
          </div>

          {/* Share message for admin */}
          <div className="border-t border-gray-100 dark:border-white/5 pt-4">
            <p className="text-xs text-gray-500 dark:text-zinc-400 mb-2 font-medium">Hoặc gửi thông tin này cho admin:</p>
            <div className="bg-gray-50 dark:bg-white/5 rounded-xl p-3 text-xs font-mono text-gray-700 dark:text-zinc-300 mb-2 max-h-32 overflow-auto whitespace-pre-wrap break-all">
              {supportMessage}
            </div>
            <Button variant="outline" size="sm" className="w-full" onClick={copyMessage}>
              {copied ? '✓ Đã copy thông tin' : '📋 Copy thông tin cho admin'}
            </Button>
          </div>

          <button onClick={onClose} className="w-full mt-4 py-2 text-sm text-gray-500 dark:text-zinc-400 hover:text-gray-700 dark:text-zinc-300">
            Đóng
          </button>
        </div>
      </div>
    </div>
  )
}

function ArrowIcon() {
  return (
    <svg className="w-4 h-4 text-gray-400 dark:text-zinc-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/>
    </svg>
  )
}
