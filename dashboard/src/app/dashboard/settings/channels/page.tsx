'use client'

import { useEffect, useState, useRef } from 'react'
import { api } from '@/lib/api'

type ChannelConfig = {
  [key: string]: {
    enabled?: boolean
    icon: string
    label: string
    groupCount?: number
    comingSoon?: boolean
  }
}

interface ZaloConnectionStatus {
  connected: boolean
  qrPending: boolean
  containerRunning: boolean
  lastMessageAt?: string
  qrFileAgeSeconds?: number
}

// Guide URLs — only set if a real page exists
const CHANNEL_GUIDE_URLS: Record<string, string> = {
  // telegram: '/docs/install-telegram',
}

// Helper: detect OS để chọn file installer phù hợp
function detectInstallerOs(): 'mac' | 'win' {
  if (typeof navigator === 'undefined') return 'mac'
  return navigator.userAgent.toLowerCase().includes('windows') ? 'win' : 'mac'
}

// Tải file installer (.command/.bat) qua fetch + blob (cần auth header)
function downloadInstaller(target: 'mac' | 'win') {
  const API = process.env.NEXT_PUBLIC_API_URL ?? ''
  const token = typeof window !== 'undefined' ? localStorage.getItem('zm:token') : null
  if (!token) { alert('Chưa đăng nhập'); return }
  fetch(`${API}/api/auth/my-installer?os=${target}`, { headers: { Authorization: `Bearer ${token}` } })
    .then(r => { if (!r.ok) throw new Error('Tải fail'); return r.blob() })
    .then(blob => {
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = target === 'win' ? 'zalo-monitor-installer.bat' : 'zalo-monitor-installer.command'
      document.body.appendChild(a); a.click(); a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    })
    .catch(() => alert('Không tải được — thử lại sau'))
}

export default function ChannelsPage() {
  const [channels, setChannels] = useState<ChannelConfig | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api<ChannelConfig>('/api/config/channels').then(cfg => {
      setChannels(cfg)
      setLoading(false)
    }).catch(err => {
      console.error('Failed to load channels config:', err)
      setLoading(false)
    })
  }, [])

  async function toggleChannel(key: string, enabled: boolean) {
    if (!channels) return

    setSaving(true)
    try {
      const enabledKeys = Object.entries(channels)
        .filter(([_, cfg]) => {
          if (cfg.comingSoon) return false
          if (key === _) return enabled
          return cfg.enabled ?? false
        })
        .map(([k, _]) => {
          // Convert key to channel name
          if (k === 'zaloPersonal') return 'ZALO'
          if (k === 'telegram') return 'TELEGRAM'
          if (k === 'zaloOA') return 'ZALO_OA'
          if (k === 'lark') return 'LARK'
          return k.toUpperCase()
        })

      await api('/api/config/channels', {
        method: 'PATCH',
        body: JSON.stringify({ enabledChannels: enabledKeys }),
      })

      setChannels(prev => {
        if (!prev) return prev
        return {
          ...prev,
          [key]: { ...prev[key], enabled }
        }
      })

      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      console.error('Failed to update channels:', err)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="p-8 text-gray-400 dark:text-zinc-500">Đang tải...</div>
  }

  if (!channels) {
    return <div className="p-8 text-red-500">Lỗi tải cấu hình kênh</div>
  }

  // Separate active and coming soon channels
  const activeChannels = Object.entries(channels).filter(([_, cfg]) => !cfg.comingSoon)
  const comingSoonChannels = Object.entries(channels).filter(([_, cfg]) => cfg.comingSoon)

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-zinc-100 tracking-tight">
          Kênh theo dõi
        </h1>
        <p className="text-gray-500 dark:text-zinc-400 mt-1">
          Kết nối các kênh liên lạc để đồng bộ dữ liệu khách hàng
        </p>
      </div>

      {/* Active Channels Section */}
      <div className="mb-8">
        <div className="px-1 mb-3">
          <h2 className="text-xs font-semibold text-gray-500 dark:text-zinc-400 uppercase tracking-wider">
            Kênh đang sử dụng
          </h2>
        </div>
        <div className="space-y-3">
          {activeChannels.map(([key, cfg]) => (
            key === 'zaloPersonal' ? (
              <ZaloChannelCard
                key={key}
                channelKey={key}
                config={cfg}
                onToggle={() => toggleChannel(key, !(cfg.enabled ?? false))}
                disabled={saving}
                guideUrl={CHANNEL_GUIDE_URLS[key]}
              />
            ) : (
              <ChannelCard
                key={key}
                channelKey={key}
                config={cfg}
                onToggle={() => toggleChannel(key, !(cfg.enabled ?? false))}
                disabled={saving}
                guideUrl={CHANNEL_GUIDE_URLS[key]}
              />
            )
          ))}
        </div>
      </div>

      {/* Coming Soon Section */}
      <div className="mb-8">
        <div className="px-1 mb-3">
          <h2 className="text-xs font-semibold text-gray-500 dark:text-zinc-400 uppercase tracking-wider">
            Sắp ra mắt
          </h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {comingSoonChannels.map(([key, cfg]) => (
            <ComingSoonCard key={key} config={cfg} />
          ))}
        </div>
      </div>

      {/* Save indicator */}
      {saved && (
        <div className="fixed bottom-20 md:bottom-8 left-1/2 -translate-x-1/2 bg-gray-900 text-white px-4 py-2 rounded-full text-sm shadow-lg z-50 animate-in fade-in slide-in-from-bottom-2">
          ✓ Đã lưu
        </div>
      )}
    </div>
  )
}

function ChannelCard({
  channelKey,
  config,
  onToggle,
  disabled,
  guideUrl,
}: {
  channelKey: string
  config: any
  onToggle: () => void
  disabled: boolean
  guideUrl?: string
}) {
  return (
    <div className="bg-white dark:bg-zinc-900 dark:ring-1 dark:ring-white/5 rounded-xl border border-gray-200 dark:border-white/10 p-5 flex items-start gap-4 transition-all hover:shadow-md">
      <div className="text-3xl shrink-0">{config.icon}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="font-semibold text-gray-900 dark:text-zinc-100">{config.label}</h3>
        </div>
        <p className="text-sm text-gray-500 dark:text-zinc-400 mt-1">
          {channelKey === 'zaloPersonal' && 'Theo dõi tin nhắn từ nhóm Zalo cá nhân'}
          {channelKey === 'telegram' && 'Theo dõi tin nhắn từ nhóm Telegram'}
          {channelKey === 'lark' && 'Theo dõi tin nhắn từ Lark/Feishu'}
          {channelKey === 'zaloOA' && 'Quản lý OA Zalo'}
        </p>
        {(config.groupCount ?? 0) > 0 && (
          <div className="text-xs text-gray-400 dark:text-zinc-500 mt-2">
            {config.groupCount} nhóm đang theo dõi
          </div>
        )}
      </div>
      <div className="shrink-0 flex items-center gap-3">
        {guideUrl && (
          <a
            href={guideUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-500/10 rounded-lg transition-colors"
          >
            Hướng dẫn
          </a>
        )}
        <button
          onClick={onToggle}
          disabled={disabled}
          className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${
            config.enabled ?? false ? 'bg-green-500' : 'bg-gray-300 dark:bg-white/15'
          } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
        >
          <span
            className="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-md transition-transform"
            style={{ transform: (config.enabled ?? false) ? 'translateX(20px)' : 'translateX(0)' }}
          />
        </button>
      </div>
    </div>
  )
}

function ZaloChannelCard({
  channelKey,
  config,
  onToggle,
  disabled,
  guideUrl,
}: {
  channelKey: string
  config: any
  onToggle: () => void
  disabled: boolean
  guideUrl?: string
}) {
  const [status, setStatus] = useState<ZaloConnectionStatus>({
    connected: false,
    qrPending: false,
    containerRunning: false,
  })
  const [sessionHealth, setSessionHealth] = useState<{
    status: 'healthy' | 'warning' | 'dead' | 'never'
    hoursSincePing: number | null
    lastAutoSyncAt: string | null
    syncStatus: 'never' | 'pending' | 'syncing' | 'done'
  } | null>(null)
  const [showQrModal, setShowQrModal] = useState(false)
  const [reconnecting, setReconnecting] = useState(false)
  const [resettingSync, setResettingSync] = useState(false)
  const [nativeMode, setNativeMode] = useState(false)
  const [installCmd, setInstallCmd] = useState<{ oneLineCommand?: string; windowsCommand?: string; dockerCommand?: string } | null>(null)
  const [installOS, setInstallOS] = useState<'linux' | 'windows' | 'docker'>(() => {
    if (typeof navigator === 'undefined') return 'linux'
    const ua = navigator.userAgent.toLowerCase()
    if (ua.includes('windows')) return 'windows'
    if (ua.includes('mac')) return 'linux' // Mac dùng tab linux (cùng bash command)
    return 'linux'
  })
  const [showInstall, setShowInstall] = useState(false)
  const [copied, setCopied] = useState(false)

  const statusPollInterval = useRef<ReturnType<typeof setInterval> | undefined>(undefined)
  const qrPollInterval = useRef<ReturnType<typeof setInterval> | undefined>(undefined)
  const showQrModalRef = useRef(showQrModal)
  useEffect(() => { showQrModalRef.current = showQrModal }, [showQrModal])

  // Fetch install command 1 lần lúc mount
  useEffect(() => {
    api<{ oneLineCommand: string; windowsCommand?: string; dockerCommand?: string }>('/api/auth/my-install-command')
      .then(d => setInstallCmd(d))
      .catch(() => undefined)
  }, [])

  // Poll connection status every 30s on mount
  useEffect(() => {
    const pollStatus = async () => {
      try {
        const result = await api<ZaloConnectionStatus>('/api/zalo/connection-status')
        setStatus(result)
        // Auto-open QR modal if qrPending becomes true
        if (result.qrPending && !showQrModalRef.current) {
          setShowQrModal(true)
        }
        // Also fetch session health
        const health = await api<any>('/api/zalo/session-health').catch(() => null)
        if (health) setSessionHealth(health)
      } catch (err) {
        console.error('Failed to poll Zalo status:', err)
      }
    }

    // Poll immediately on mount
    pollStatus()

    // Set up interval for polling every 30s
    statusPollInterval.current = setInterval(pollStatus, 30000)

    return () => {
      clearInterval(statusPollInterval.current)
    }
  }, [])

  // Poll connection status more frequently while QR modal is open
  useEffect(() => {
    if (!showQrModal) {
      if (qrPollInterval.current) {
        clearInterval(qrPollInterval.current)
      }
      return
    }

    const pollStatus = async () => {
      try {
        const result = await api<ZaloConnectionStatus>('/api/zalo/connection-status')
        setStatus(result)
        // Auto-close modal when connected
        if (result.connected) {
          setShowQrModal(false)
        }
      } catch (err) {
        console.error('Failed to poll Zalo status:', err)
      }
    }

    // Poll every 5s while modal is open
    qrPollInterval.current = setInterval(pollStatus, 5000)

    return () => {
      if (qrPollInterval.current) {
        clearInterval(qrPollInterval.current)
      }
    }
  }, [showQrModal])

  const [showConfirm, setShowConfirm] = useState(false)

  const handleReconnect = async () => {
    // Check if QR is already available (hook just pushed one)
    // If yes → show QR immediately, no restart needed
    if (status.qrPending) {
      setShowQrModal(true)
      return
    }
    // No QR available → need to restart to generate one
    setShowConfirm(true)
  }

  async function handleResetSync() {
    setResettingSync(true)
    try {
      await api('/api/zalo/reset-sync', { method: 'POST' })
      // Refetch health
      const health = await api<any>('/api/zalo/session-health').catch(() => null)
      if (health) setSessionHealth(health)
    } catch {}
    finally { setResettingSync(false) }
  }

  const handleConfirmedReconnect = async () => {
    setShowConfirm(false)
    setReconnecting(true)
    // Mở modal NGAY — user thấy "đang khởi động" thay vì màn hình trắng
    setShowQrModal(true)
    try {
      const res = await api<{ ok: boolean; nativeMode?: boolean; message?: string }>('/api/zalo/reconnect', { method: 'POST', body: JSON.stringify({}) })
      setNativeMode(res.nativeMode ?? false)
      // Trigger immediate status poll
      const result = await api<ZaloConnectionStatus>('/api/zalo/connection-status')
      setStatus(result)
    } catch (err) {
      console.error('Failed to reconnect Zalo:', err)
    } finally {
      setReconnecting(false)
    }
  }

  // 3 states: not installed, disconnected, connected
  const notInstalled = !status.containerRunning

  const getStatusBadge = () => {
    if (notInstalled)      return { color: 'bg-gray-100 dark:bg-white/5 text-gray-500 dark:text-zinc-400',    dot: 'bg-gray-400',                          text: 'Chưa cài đặt' }
    if (status.connected)  return { color: 'bg-green-100 dark:bg-green-500/20 text-green-700 dark:text-green-300', dot: 'bg-green-600 dark:bg-green-400',   text: 'Đã kết nối' }
    if (status.qrPending)  return { color: 'bg-yellow-100 dark:bg-yellow-500/20 text-yellow-700 dark:text-yellow-300', dot: 'bg-yellow-500 animate-pulse', text: 'Chờ quét QR...' }
    return                        { color: 'bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-300',     dot: 'bg-red-500',                           text: 'Mất kết nối' }
  }

  const badge = getStatusBadge()

  return (
    <>
      <div className="bg-white dark:bg-zinc-900 dark:ring-1 dark:ring-white/5 rounded-xl border border-gray-200 dark:border-white/10 p-5 flex items-start gap-4 transition-all hover:shadow-md">
        <div className="text-3xl shrink-0">{config.icon}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-gray-900 dark:text-zinc-100">{config.label}</h3>
            <span className={`inline-flex items-center gap-1.5 px-2 py-1 text-xs font-medium rounded-md ${badge.color}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${badge.dot}`} />
              {badge.text}
            </span>
          </div>
          <p className="text-sm text-gray-500 dark:text-zinc-400 mt-0.5">
            Theo dõi tin nhắn từ nhóm Zalo cá nhân
          </p>

          {/* Account info — hiện tên/SĐT đang login */}
          {(status as any).zaloName && (
            <p className="text-xs text-gray-600 dark:text-zinc-300 mt-1 font-medium">
              {(status as any).zaloName}
              {(status as any).zaloPhone && (
                <span className="text-gray-400 dark:text-zinc-500 font-normal ml-1">[{(status as any).zaloPhone}]</span>
              )}
            </p>
          )}

          {/* Not installed — install hint */}
          {notInstalled && (
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-1.5">
              Listener chưa cài. Lấy lệnh cài để bắt đầu theo dõi Zalo.
            </p>
          )}

          {/* Zalo Web warning — hiện khi đang kết nối */}
          {status.connected && (
            <div className="mt-2.5 flex items-start gap-2 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/25 rounded-lg px-3 py-2">
              <span className="text-amber-500 shrink-0 mt-0.5">⚠️</span>
              <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
                <span className="font-semibold">Đừng đăng nhập Zalo Web</span> (chat.zalo.me) trên trình duyệt — sẽ ngắt kết nối board này. Dùng dashboard để nhắn tin và theo dõi nhóm thay thế.
              </p>
            </div>
          )}

          {/* Vừa đăng nhập — chờ tin đầu tiên */}
          {(() => {
            const scannedAt = typeof window !== 'undefined' ? Number(localStorage.getItem('zm:scanned-at') ?? 0) : 0
            const justScanned = scannedAt && (Date.now() - scannedAt) < 30 * 60_000
            if (!justScanned) return null
            if (sessionHealth?.status === 'healthy') return null
            return (
              <div className="mt-2 flex items-start gap-2 rounded-lg px-3 py-2 bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/25">
                <span className="shrink-0 mt-0.5">✓</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-blue-700 dark:text-blue-300">Đã đăng nhập Zalo</p>
                  <p className="text-xs mt-0.5 text-blue-600 dark:text-blue-400">
                    Hệ thống sẽ tự động đồng bộ ngay khi có tin nhắn mới đến nhóm Zalo của bạn.
                  </p>
                </div>
              </div>
            )
          })()}

          {/* Session health warning — ẩn nếu vừa scan xong */}
          {sessionHealth && sessionHealth.status !== 'healthy' && sessionHealth.status !== 'never' &&
           !(typeof window !== 'undefined' && Number(localStorage.getItem('zm:scanned-at') ?? 0) > Date.now() - 30 * 60_000) && (
            <div className={`mt-2 flex items-start gap-2 rounded-lg px-3 py-2 ${
              sessionHealth.status === 'dead'
                ? 'bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/25'
                : 'bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/25'
            }`}>
              <span className="shrink-0 mt-0.5">{sessionHealth.status === 'dead' ? '🔴' : '🟡'}</span>
              <div className="flex-1 min-w-0">
                <p className={`text-xs font-semibold ${sessionHealth.status === 'dead' ? 'text-red-700 dark:text-red-300' : 'text-amber-700 dark:text-amber-300'}`}>
                  {sessionHealth.status === 'dead'
                    ? `Mất kết nối ${sessionHealth.hoursSincePing} tiếng rồi`
                    : `Không có tín hiệu trong ${sessionHealth.hoursSincePing}h qua`}
                </p>
                <p className={`text-xs mt-0.5 ${sessionHealth.status === 'dead' ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'}`}>
                  {sessionHealth.status === 'dead'
                    ? 'Session Zalo có thể đã hết hạn. Bấm "Kết nối lại" để quét QR.'
                    : 'Hook đang im lặng — có thể máy tắt hoặc mạng yếu.'}
                </p>
              </div>
            </div>
          )}

          {/* Reconnect / install button — nằm dưới info, bên trái */}
          <div className="mt-2.5 flex items-center gap-2 flex-wrap">
            {notInstalled ? (
              <>
                <button
                  onClick={() => downloadInstaller(detectInstallerOs())}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-blue-500 hover:bg-blue-600 rounded-lg transition-colors"
                >
                  <span>{detectInstallerOs() === 'win' ? '🪟' : ''}</span>
                  <span>Cài đặt cho {detectInstallerOs() === 'win' ? 'Windows' : 'Mac'}</span>
                </button>
                <button
                  onClick={() => setShowInstall(s => !s)}
                  className="px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-zinc-400 hover:bg-gray-100 dark:hover:bg-white/5 rounded-lg transition-colors"
                  title="Cho người rành máy tính"
                >
                  {showInstall ? 'Ẩn dòng lệnh' : '⌨️ Tôi rành máy tính'}
                </button>
                <a
                  href="/dashboard/docs/install"
                  className="px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-zinc-400 hover:bg-gray-100 dark:hover:bg-white/5 rounded-lg transition-colors"
                >
                  Hướng dẫn chi tiết →
                </a>
              </>
            ) : (
              <>
                <button
                  onClick={handleReconnect}
                  disabled={disabled || reconnecting}
                  className="px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-zinc-300 bg-gray-100 dark:bg-white/10 hover:bg-gray-200 dark:hover:bg-white/15 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {reconnecting ? 'Đang khởi động...' : status.connected ? 'Đổi tài khoản' : 'Kết nối lại'}
                </button>
                <span className="text-[11px] text-emerald-600 dark:text-emerald-400 inline-flex items-center gap-1" title="Listener tự cập nhật mỗi 6 giờ">
                  ⚡ <span>Tự cập nhật</span>
                </span>
              </>
            )}
            {sessionHealth && !notInstalled && (
              <button
                onClick={handleResetSync}
                disabled={resettingSync || sessionHealth.syncStatus === 'syncing'}
                title="Xóa mốc sync — hook sẽ tự backfill lại lịch sử trong ~1 phút"
                className="px-3 py-1.5 text-xs font-medium text-gray-500 dark:text-zinc-400 hover:text-gray-700 dark:hover:text-zinc-200 hover:bg-gray-100 dark:hover:bg-white/10 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {resettingSync ? '...' :
                 sessionHealth.syncStatus === 'syncing' ? '⟳ Đang sync...' :
                 '↺ Sync lại lịch sử'}
              </button>
            )}
            {guideUrl && (
              <a href={guideUrl} target="_blank" rel="noopener noreferrer"
                className="px-3 py-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-500/10 rounded-lg transition-colors">
                Hướng dẫn
              </a>
            )}
            {(config.groupCount ?? 0) > 0 && (
              <span className="text-xs text-gray-400 dark:text-zinc-500">
                {config.groupCount} nhóm đang theo dõi
              </span>
            )}
          </div>

          {/* Install command — hiện khi user bấm "Lấy lệnh" (cả notInstalled lẫn installed để cập nhật) */}
          {showInstall && installCmd && (
            <div className="mt-3 bg-gray-50 dark:bg-white/5 rounded-xl p-3 space-y-2">
              <p className="text-xs font-medium text-gray-700 dark:text-zinc-300">Cài đặt / Cập nhật listener — chạy trên server có Zalo:</p>

              {/* OS tabs */}
              <div className="flex gap-1.5 text-[11px]">
                {([
                  ['linux',   '🐧 Mac/Linux'],
                  ['windows', '🪟 Windows'],
                  ['docker',  '🐳 Docker'],
                ] as const).map(([k, label]) => (
                  <button
                    key={k}
                    onClick={() => setInstallOS(k)}
                    className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                      installOS === k
                        ? 'bg-blue-500 text-white'
                        : 'bg-white dark:bg-white/10 text-gray-600 dark:text-zinc-400 hover:bg-gray-100 dark:hover:bg-white/15'
                    }`}
                  >{label}</button>
                ))}
              </div>

              {(() => {
                const cmd = installOS === 'windows'
                  ? (installCmd.windowsCommand ?? '')
                  : installOS === 'docker'
                  ? (installCmd.dockerCommand ?? '')
                  : (installCmd.oneLineCommand ?? '')
                return (
                  <div className="relative">
                    <pre className="bg-gray-900 dark:bg-black text-green-400 text-[11px] font-mono p-3 rounded-lg overflow-x-auto whitespace-pre-wrap break-all select-all pr-16">
                      {cmd || 'Đang tải...'}
                    </pre>
                    <button
                      onClick={() => { if (cmd) { navigator.clipboard.writeText(cmd); setCopied(true); setTimeout(() => setCopied(false), 2000) } }}
                      disabled={!cmd}
                      className="absolute top-2 right-2 px-2 py-1 text-[10px] font-semibold text-white bg-blue-500 hover:bg-blue-600 disabled:opacity-50 rounded-md"
                    >{copied ? '✓' : 'Copy'}</button>
                  </div>
                )
              })()}

              <p className="text-[11px] text-gray-500 dark:text-zinc-400">
                💡 Lệnh idempotent — chạy lần đầu để <strong>cài</strong>, chạy lại bất cứ lúc nào để <strong>cập nhật</strong> listener về phiên bản mới nhất. Sau đó QR sẽ hiện ngay tại đây.
              </p>
            </div>
          )}

          {/* Sync status row */}
          {sessionHealth && !notInstalled && (
            <div className="mt-2 flex items-center gap-1.5">
              {sessionHealth.syncStatus === 'syncing' && (
                <>
                  <span className="w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin shrink-0" />
                  <span className="text-xs text-blue-600 dark:text-blue-400">Đang sync lịch sử tin nhắn...</span>
                </>
              )}
              {sessionHealth.syncStatus === 'done' && sessionHealth.lastAutoSyncAt && (
                <>
                  <span className="text-xs text-green-600 dark:text-green-400">✓ Đã sync</span>
                  <span className="text-xs text-gray-400 dark:text-zinc-500">
                    · {new Date(sessionHealth.lastAutoSyncAt).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </>
              )}
              {sessionHealth.syncStatus === 'pending' && (
                <>
                  <span className="text-xs text-gray-400 dark:text-zinc-500">⏳ Chờ sync — hook sẽ tự chạy trong ~1 phút</span>
                </>
              )}
            </div>
          )}

        </div>

        {/* Toggle — chỉ bật/tắt kênh, nằm bên phải */}
        <button
          onClick={onToggle}
          disabled={disabled}
          className={`relative w-11 h-6 rounded-full transition-colors shrink-0 mt-0.5 ${
            config.enabled ?? false ? 'bg-green-500' : 'bg-gray-300 dark:bg-white/15'
          } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
        >
          <span
            className="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-md transition-transform"
            style={{ transform: (config.enabled ?? false) ? 'translateX(20px)' : 'translateX(0)' }}
          />
        </button>
      </div>

      {/* Confirm before reconnect */}
      {showConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowConfirm(false)}>
          <div
            className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl max-w-sm w-full p-6 flex flex-col gap-4"
            onClick={e => e.stopPropagation()}
          >
            <div className="text-center">
              <div className="text-4xl mb-3">📱</div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-zinc-100">Đăng nhập lại Zalo?</h2>
              {(status as any).zaloName && (
                <div className="mt-2 px-3 py-2 bg-gray-50 dark:bg-white/5 rounded-lg text-sm text-gray-700 dark:text-zinc-300">
                  Đang dùng: <span className="font-semibold">{(status as any).zaloName}</span>
                  {(status as any).zaloPhone && <span className="text-gray-500 dark:text-zinc-400 ml-1">[{(status as any).zaloPhone}]</span>}
                </div>
              )}
              <p className="text-sm text-gray-500 dark:text-zinc-400 mt-3">
                Mở sẵn <span className="font-medium text-gray-700 dark:text-zinc-200">Zalo trên điện thoại</span> để quét QR ngay sau khi nhấn tiếp tục.
              </p>
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
                ⚠️ QR chỉ hiệu lực ~60 giây, quét ngay khi xuất hiện.
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowConfirm(false)}
                className="flex-1 py-2.5 text-sm font-medium text-gray-700 dark:text-zinc-300 bg-gray-100 dark:bg-white/10 hover:bg-gray-200 dark:hover:bg-white/15 rounded-xl transition-colors"
              >
                Để sau
              </button>
              <button
                onClick={handleConfirmedReconnect}
                className="flex-1 py-2.5 text-sm font-medium text-white bg-blue-500 hover:bg-blue-600 rounded-xl transition-colors"
              >
                Tôi đã sẵn sàng →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* QR Modal */}
      {showQrModal && (
        <ZaloQRModal
          onClose={() => setShowQrModal(false)}
          isConnected={status.connected}
          nativeMode={nativeMode}
          isRestarting={reconnecting}
        />
      )}
    </>
  )
}

const QR_TTL = 60 // Zalo QR valid ~60s

function ZaloQRModal({
  onClose,
  isConnected,
  nativeMode,
  isRestarting,
}: {
  onClose: () => void
  isConnected: boolean
  nativeMode?: boolean
  isRestarting?: boolean
}) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [qrPushedAt, setQrPushedAt] = useState<number | null>(null)
  const [secondsLeft, setSecondsLeft] = useState(QR_TTL)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const qrPollInterval = useRef<ReturnType<typeof setInterval> | undefined>(undefined)
  const countdownInterval = useRef<ReturnType<typeof setInterval> | undefined>(undefined)

  const isExpired = secondsLeft <= 0 && !!qrDataUrl

  // Countdown từ pushedAt
  useEffect(() => {
    if (!qrPushedAt) return
    const tick = () => {
      const age = Math.floor((Date.now() - qrPushedAt) / 1000)
      setSecondsLeft(Math.max(0, QR_TTL - age))
    }
    tick()
    countdownInterval.current = setInterval(tick, 1000)
    return () => clearInterval(countdownInterval.current)
  }, [qrPushedAt])

  // Poll QR mỗi 5s
  useEffect(() => {
    const pollQR = async () => {
      try {
        const result = await api<{ dataUrl: string; pushedAt?: number }>('/api/zalo/qr')
        // Khi có QR mới (pushedAt khác) → reset countdown
        if (result.pushedAt && result.pushedAt !== qrPushedAt) {
          setQrPushedAt(result.pushedAt)
        }
        setQrDataUrl(result.dataUrl)
        setLoading(false)
      } catch {
        // QR chưa có — giữ loading
      }
    }
    pollQR()
    qrPollInterval.current = setInterval(pollQR, 5000)
    return () => clearInterval(qrPollInterval.current)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleRefresh() {
    setRefreshing(true)
    try {
      await api('/api/zalo/reconnect', { method: 'POST', body: JSON.stringify({}) })
    } catch {}
    setRefreshing(false)
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="relative bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl max-w-sm w-full p-6 flex flex-col items-center gap-6"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-gray-400 dark:text-zinc-500 hover:text-gray-600 dark:hover:text-zinc-300 transition-colors"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Title */}
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-zinc-100 mb-2">
            Quét mã QR
          </h2>
          <p className="text-sm text-gray-500 dark:text-zinc-400">
            Mở <span className="font-medium text-gray-700 dark:text-zinc-300">Zalo trên điện thoại</span> → Quét mã QR để đăng nhập
          </p>
          <p className="text-xs text-amber-600 dark:text-amber-400 mt-1.5">
            ⚠️ Không quét bằng Zalo Web — sẽ không hoạt động và ngắt kết nối board
          </p>
        </div>

        {/* QR Image + countdown */}
        <div className="flex flex-col items-center gap-2 w-full">
          <div className="relative w-56 h-56 bg-gray-100 dark:bg-zinc-800 rounded-lg flex items-center justify-center overflow-hidden">
            {/* Loading / restarting */}
            {(loading || (isRestarting && !qrDataUrl)) && (
              <div className="flex flex-col items-center gap-3 px-4 text-center">
                <div className="w-12 h-12 border-4 border-gray-300 dark:border-zinc-600 border-t-blue-500 rounded-full animate-spin" />
                <p className="text-sm text-gray-500 dark:text-zinc-400">
                  {isRestarting ? 'Đang khởi động...\nQR sẽ hiện ngay đây' : 'Đang tải mã QR...'}
                </p>
              </div>
            )}

            {/* QR image */}
            {!loading && qrDataUrl && (
              <img src={qrDataUrl} alt="Zalo QR Code" className="w-48 h-48 object-contain" />
            )}

            {/* Expired overlay */}
            {isExpired && (
              <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center gap-3 rounded-lg">
                <span className="text-3xl">⏱</span>
                <p className="text-white font-semibold text-sm">QR đã hết hạn</p>
                <button
                  onClick={handleRefresh}
                  disabled={refreshing}
                  className="px-4 py-2 text-sm font-medium bg-white text-gray-900 rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-60"
                >
                  {refreshing ? 'Đang tải...' : '↺ Lấy QR mới'}
                </button>
              </div>
            )}

            {/* No QR */}
            {!loading && !qrDataUrl && !isRestarting && (
              <p className="text-sm text-gray-500 dark:text-zinc-400 px-4 text-center">Không thể tải mã QR</p>
            )}
          </div>

          {/* Countdown bar */}
          {qrDataUrl && !isExpired && (
            <div className="w-56">
              <div className="flex justify-between text-[11px] mb-1">
                <span className={secondsLeft <= 15 ? 'text-amber-500 font-semibold' : 'text-gray-400 dark:text-zinc-500'}>
                  {secondsLeft <= 15 ? `⏱ Còn ${secondsLeft}s — quét ngay!` : `Còn ${secondsLeft}s`}
                </span>
                <span className="text-gray-400 dark:text-zinc-500">60s</span>
              </div>
              <div className="h-1 bg-gray-200 dark:bg-zinc-700 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-1000 ${secondsLeft <= 15 ? 'bg-amber-500' : 'bg-blue-500'}`}
                  style={{ width: `${(secondsLeft / QR_TTL) * 100}%` }}
                />
              </div>
            </div>
          )}

          {/* Restarting hint */}
          {isRestarting && !qrDataUrl && (
            <p className="text-xs text-blue-600 dark:text-blue-400 text-center max-w-[200px]">
              🔄 Đang khởi động listener...<br/>QR sẽ hiện ngay, đừng đi đâu cả!
            </p>
          )}
        </div>

        {/* Đã quét xong button — khách bấm để đóng modal khi login thành công */}
        {qrDataUrl && (
          <button
            onClick={async () => {
              try { await api('/api/zalo/clear-qr', { method: 'POST', body: JSON.stringify({}) }) } catch {}
              try { localStorage.setItem('zm:scanned-at', String(Date.now())) } catch {}
              onClose()
            }}
            className="w-full py-2 text-sm font-medium text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-500/10 hover:bg-green-100 dark:hover:bg-green-500/20 rounded-lg transition-colors"
          >
            ✓ Tôi đã đăng nhập xong
          </button>
        )}

        {/* Manual fallback: nếu hook không phản hồi, khách copy lệnh chạy thủ công */}
        {!qrDataUrl && (
          <ManualLoginFallback />
        )}

        {/* Status message */}
        {isConnected && (
          <div className="w-full bg-green-100 dark:bg-green-500/20 border border-green-300 dark:border-green-500/50 rounded-lg p-3 text-sm text-green-700 dark:text-green-300 text-center">
            ✓ Kết nối thành công! Đang đóng...
          </div>
        )}

        {/* Close button */}
        <button
          onClick={onClose}
          className="w-full px-4 py-2.5 bg-gray-900 dark:bg-zinc-800 text-white rounded-lg font-medium hover:bg-gray-800 dark:hover:bg-zinc-700 transition-colors"
        >
          Đóng
        </button>
      </div>
    </div>
  )
}

function ComingSoonCard({ config }: { config: any }) {
  return (
    <div className="bg-white dark:bg-zinc-900 dark:ring-1 dark:ring-white/5 rounded-xl border border-gray-200 dark:border-white/10 p-5 flex flex-col items-center text-center gap-3 opacity-60">
      <div className="text-3xl">{config.icon}</div>
      <div className="min-w-0">
        <h3 className="font-semibold text-gray-900 dark:text-zinc-100 text-sm">{config.label}</h3>
        <span className="inline-block mt-2 px-2 py-1 text-xs font-medium bg-amber-100 dark:bg-amber-500/20 text-amber-800 dark:text-amber-300 rounded-md">
          Sắp ra mắt
        </span>
      </div>
    </div>
  )
}

function ManualLoginFallback() {
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)
  const [os, setOs] = useState<'linux' | 'windows'>(() => {
    if (typeof navigator === 'undefined') return 'linux'
    return navigator.userAgent.toLowerCase().includes('windows') ? 'windows' : 'linux'
  })

  // Linux/Mac — file-based: openzca xuất qr.png → đọc file, encode base64, push.
  // Tránh phụ thuộc vào output stdout của --qr-base64 (có thể đổi format).
  const linuxRestart = 'systemctl --user restart zalo-monitor-listener'
  const linuxPush = `set -a; . ~/.zalo-monitor/.env; set +a; QR=/tmp/zm-qr.png; rm -f $QR; openzca --profile zalo-monitor auth login --qr-path $QR >/dev/null 2>&1 & PID=$!; for i in 1 2 3 4 5 6 7 8 9 10; do [ -s $QR ] && break; sleep 1; done; kill $PID 2>/dev/null; if [ -s $QR ]; then B64=$(base64 -w0 < $QR 2>/dev/null || base64 < $QR | tr -d '\\n'); curl -s -X POST "$BACKEND_URL/api/setup/qr-push" -H 'content-type: application/json' -H "x-webhook-secret: $WEBHOOK_SECRET" -H "x-tenant-id: $TENANT_ID" -d "{\\"dataUrl\\":\\"data:image/png;base64,$B64\\"}"; echo 'QR pushed'; else echo 'QR file not generated'; fi`

  // Windows PowerShell — Run as Admin. File-based.
  const winRestart = 'schtasks /End /TN ZaloMonitorListener; Start-Sleep 1; schtasks /Run /TN ZaloMonitorListener'
  const winPush = `$envFile = "$env:USERPROFILE\\.zalo-monitor\\.env"; Get-Content $envFile | ForEach-Object { if ($_ -match '^([^=]+)=(.*)$') { Set-Variable -Name $matches[1] -Value $matches[2] } }; $qr = "$env:TEMP\\zm-qr.png"; Remove-Item $qr -ErrorAction SilentlyContinue; $proc = Start-Process openzca -ArgumentList @('--profile','zalo-monitor','auth','login','--qr-path',$qr) -WindowStyle Hidden -PassThru; for ($i=0; $i -lt 30; $i++) { Start-Sleep 1; if (Test-Path $qr) { break } }; if (Test-Path $qr) { $b64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes($qr)); $body = @{dataUrl="data:image/png;base64,$b64"} | ConvertTo-Json; Invoke-WebRequest -Uri "$BACKEND_URL/api/setup/qr-push" -Method POST -Headers @{'Content-Type'='application/json';'x-webhook-secret'=$WEBHOOK_SECRET;'x-tenant-id'=$TENANT_ID} -Body $body -UseBasicParsing | Out-Null; Write-Host 'QR pushed' } else { Write-Host 'QR file not generated' }`

  const restartCmd = os === 'windows' ? winRestart : linuxRestart
  const pushCmd = os === 'windows' ? winPush : linuxPush

  function copy(text: string, key: string) {
    navigator.clipboard.writeText(text)
    setCopied(key)
    setTimeout(() => setCopied(null), 2000)
  }

  return (
    <div className="w-full bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-lg p-3 text-xs text-amber-800 dark:text-amber-300 space-y-2">
      <p className="font-medium">⏱ Đang đợi listener phản hồi...</p>
      <p className="text-[11px] opacity-90">
        Hệ thống đã gửi yêu cầu login Zalo tới listener — QR sẽ tự hiện trong vài giây.
        Nếu không thấy QR sau ~15 giây →{' '}
        <button onClick={() => setShowAdvanced(s => !s)} className="underline font-medium">
          {showAdvanced ? 'ẩn' : 'chạy thủ công'}
        </button>
      </p>
      {showAdvanced && (
        <div className="pt-2 border-t border-amber-200 dark:border-amber-500/30 space-y-3">
          <div className="flex gap-1 text-[11px]">
            <button
              onClick={() => setOs('windows')}
              className={`px-2 py-1 rounded ${os === 'windows' ? 'bg-amber-600 text-white' : 'bg-white/40 dark:bg-white/10'}`}
            >🪟 Windows</button>
            <button
              onClick={() => setOs('linux')}
              className={`px-2 py-1 rounded ${os === 'linux' ? 'bg-amber-600 text-white' : 'bg-white/40 dark:bg-white/10'}`}
            >🍎 Mac/Linux</button>
          </div>
          <div className="space-y-1.5">
            <p className="font-medium">Cách 1 — Restart listener (đơn giản):</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 bg-gray-900 text-green-400 text-[11px] font-mono px-2 py-1.5 rounded overflow-x-auto select-all">
                {restartCmd}
              </code>
              <button
                onClick={() => copy(restartCmd, 'restart')}
                className="px-2 py-1 text-[11px] font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded shrink-0"
              >
                {copied === 'restart' ? '✓' : 'Copy'}
              </button>
            </div>
          </div>
          <div className="space-y-1.5">
            <p className="font-medium">Cách 2 — Push QR thẳng về dashboard:</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 bg-gray-900 text-green-400 text-[10px] font-mono px-2 py-1.5 rounded overflow-x-auto select-all whitespace-pre-wrap break-all">
                {pushCmd}
              </code>
              <button
                onClick={() => copy(pushCmd, 'push')}
                className="px-2 py-1 text-[11px] font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded shrink-0"
              >
                {copied === 'push' ? '✓' : 'Copy'}
              </button>
            </div>
            <p className="text-[11px] opacity-75">QR sẽ tự hiện trên dashboard sau ~5 giây.</p>
          </div>
        </div>
      )}
    </div>
  )
}
