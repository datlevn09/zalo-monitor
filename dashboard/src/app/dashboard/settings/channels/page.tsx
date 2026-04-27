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
          Kết nối các kênh liên lạc để theo dõi tin nhắn từ khách hàng
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
  const [showQrModal, setShowQrModal] = useState(false)
  const [reconnecting, setReconnecting] = useState(false)
  const statusPollInterval = useRef<ReturnType<typeof setInterval> | undefined>(undefined)
  const qrPollInterval = useRef<ReturnType<typeof setInterval> | undefined>(undefined)
  const showQrModalRef = useRef(showQrModal)
  useEffect(() => { showQrModalRef.current = showQrModal }, [showQrModal])

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

  const handleReconnect = async () => {
    setReconnecting(true)
    try {
      await api('/api/zalo/reconnect', { method: 'POST' })
      setShowQrModal(true)
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
    if (status.connected)  return { color: 'bg-green-100 dark:bg-green-500/20 text-green-700 dark:text-green-300', dot: 'bg-green-600 dark:bg-green-400',   text: 'Đang kết nối' }
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
          <p className="text-sm text-gray-500 dark:text-zinc-400 mt-1">
            Theo dõi tin nhắn từ nhóm Zalo cá nhân
          </p>
          {/* Not installed — show install hint */}
          {notInstalled && (
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
              OpenClaw chưa chạy. Cài đặt theo hướng dẫn để bắt đầu theo dõi Zalo.
            </p>
          )}
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
          {/* Show install guide if not installed, reconnect button if disconnected */}
          {notInstalled ? (
            <a
              href="https://datthongdong.com/openclaw-install"
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1.5 text-xs font-medium text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 hover:bg-amber-100 dark:hover:bg-amber-500/20 rounded-lg transition-colors"
            >
              Xem hướng dẫn cài đặt
            </a>
          ) : !status.connected && (
            <button
              onClick={handleReconnect}
              disabled={disabled || reconnecting}
              className="px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-white/10 hover:bg-gray-200 dark:hover:bg-white/20 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {reconnecting ? 'Đang khởi động...' : 'Kết nối lại'}
            </button>
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

      {/* QR Modal */}
      {showQrModal && (
        <ZaloQRModal
          onClose={() => setShowQrModal(false)}
          isConnected={status.connected}
        />
      )}
    </>
  )
}

function ZaloQRModal({
  onClose,
  isConnected,
}: {
  onClose: () => void
  isConnected: boolean
}) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const qrPollInterval = useRef<ReturnType<typeof setInterval> | undefined>(undefined)

  useEffect(() => {
    const pollQR = async () => {
      try {
        const result = await api<{ dataUrl: string }>('/api/zalo/qr')
        setQrDataUrl(result.dataUrl)
        setLoading(false)
      } catch (err) {
        console.error('Failed to get Zalo QR:', err)
      }
    }

    // Fetch immediately
    pollQR()

    // Poll every 5s
    qrPollInterval.current = setInterval(pollQR, 5000)

    return () => {
      if (qrPollInterval.current) {
        clearInterval(qrPollInterval.current)
      }
    }
  }, [])

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
            Mở Zalo trên điện thoại → Quét mã QR để đăng nhập lại
          </p>
        </div>

        {/* QR Image or Loading */}
        <div className="w-56 h-56 bg-gray-100 dark:bg-zinc-800 rounded-lg flex items-center justify-center">
          {loading ? (
            <div className="flex flex-col items-center gap-3">
              <div className="w-12 h-12 border-4 border-gray-300 dark:border-zinc-600 border-t-blue-500 rounded-full animate-spin" />
              <p className="text-sm text-gray-500 dark:text-zinc-400">Đang tải mã QR...</p>
            </div>
          ) : qrDataUrl ? (
            <img
              src={qrDataUrl}
              alt="Zalo QR Code"
              className="w-48 h-48 object-contain"
            />
          ) : (
            <p className="text-sm text-gray-500 dark:text-zinc-400">Không thể tải mã QR</p>
          )}
        </div>

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
