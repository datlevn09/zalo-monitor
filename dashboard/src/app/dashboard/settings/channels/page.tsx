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
  const [showHistoryImport, setShowHistoryImport] = useState(false)
  const [pushConfig, setPushConfig] = useState<{
    backendUrl: string
    tenantId: string
    webhookSecret: string
    isOwner: boolean
  } | null>(null)
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  async function fetchPushConfig() {
    if (pushConfig) return
    try {
      const cfg = await api<any>('/api/zalo/history-push-config')
      setPushConfig(cfg)
    } catch {}
  }

  function copyToClipboard(text: string, key: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedKey(key)
      setTimeout(() => setCopiedKey(null), 2000)
    })
  }

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
              OpenClaw chưa chạy. Cài đặt theo hướng dẫn để bắt đầu theo dõi Zalo.
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

          {/* Session health warning */}
          {sessionHealth && sessionHealth.status !== 'healthy' && sessionHealth.status !== 'never' && (
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
          <div className="mt-2.5 flex items-center gap-2">
            {notInstalled ? (
              <a
                href="/docs/install-zalo"
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-1.5 text-xs font-medium text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 hover:bg-amber-100 dark:hover:bg-amber-500/20 rounded-lg transition-colors"
              >
                Xem hướng dẫn cài đặt
              </a>
            ) : (
              <button
                onClick={handleReconnect}
                disabled={disabled || reconnecting}
                className="px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-zinc-300 bg-gray-100 dark:bg-white/10 hover:bg-gray-200 dark:hover:bg-white/15 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {reconnecting ? 'Đang khởi động...' : status.connected ? 'Đổi tài khoản' : 'Kết nối lại'}
              </button>
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

          {/* Advanced: Import lịch sử đầy đủ */}
          {!notInstalled && (
            <div className="mt-3 border-t border-gray-100 dark:border-white/5 pt-3">
              <button
                onClick={() => {
                  setShowHistoryImport(v => !v)
                  if (!showHistoryImport) fetchPushConfig()
                }}
                className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-zinc-400 hover:text-gray-700 dark:hover:text-zinc-200 transition-colors group"
              >
                <span className="text-base leading-none">📦</span>
                <span className="font-medium">Import lịch sử đầy đủ</span>
                <svg
                  className={`w-3.5 h-3.5 transition-transform ${showHistoryImport ? 'rotate-180' : ''}`}
                  fill="none" stroke="currentColor" viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {showHistoryImport && (
                <div className="mt-3 space-y-4">
                  {/* Case 1 */}
                  <div className="rounded-lg bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-500/20 p-3">
                    <p className="text-xs font-semibold text-green-800 dark:text-green-300 mb-1">
                      ✅ Trường hợp 1: Hook chạy cùng máy Zalo PC App
                    </p>
                    <p className="text-xs text-green-700 dark:text-green-400 leading-relaxed">
                      Hook tự phát hiện SQLite của Zalo và sync <strong>5.000 tin/nhóm</strong> thay vì 50.
                      Không cần làm gì thêm — tự động khi kết nối.
                    </p>
                  </div>

                  {/* Case 2 */}
                  <div className="rounded-lg bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 p-3">
                    <p className="text-xs font-semibold text-gray-700 dark:text-zinc-200 mb-1">
                      🖥️ Trường hợp 2: Hook trên VPS, Zalo PC App trên máy riêng
                    </p>
                    <p className="text-xs text-gray-500 dark:text-zinc-400 mb-2.5 leading-relaxed">
                      Chạy script sau <strong>trên máy nhân viên</strong> (có cài Zalo PC App). Script đọc lịch sử cũ và đẩy lên backend.
                    </p>

                    {/* Step 1: Tải script */}
                    <p className="text-[11px] font-semibold text-gray-500 dark:text-zinc-400 uppercase tracking-wide mb-1.5">
                      Bước 1 — Tải script
                    </p>
                    <div className="flex items-center gap-2 mb-3">
                      <code className="flex-1 block bg-gray-900 dark:bg-black/40 text-green-400 text-[11px] font-mono rounded px-2.5 py-1.5 overflow-x-auto whitespace-nowrap">
                        {pushConfig
                          ? `curl -O ${pushConfig.backendUrl}/api/setup/hook-files/zalo-history-push.mjs`
                          : 'curl -O <BACKEND_URL>/api/setup/hook-files/zalo-history-push.mjs'}
                      </code>
                      <button
                        onClick={() => pushConfig && copyToClipboard(
                          `curl -O ${pushConfig.backendUrl}/api/setup/hook-files/zalo-history-push.mjs`,
                          'download'
                        )}
                        disabled={!pushConfig}
                        className="shrink-0 px-2 py-1.5 text-[11px] font-medium text-gray-600 dark:text-zinc-300 bg-gray-200 dark:bg-white/10 hover:bg-gray-300 dark:hover:bg-white/20 rounded transition-colors disabled:opacity-40"
                      >
                        {copiedKey === 'download' ? '✓' : 'Copy'}
                      </button>
                    </div>

                    {/* Step 2: Chạy */}
                    <p className="text-[11px] font-semibold text-gray-500 dark:text-zinc-400 uppercase tracking-wide mb-1.5">
                      Bước 2 — Chạy import
                    </p>
                    {pushConfig ? (
                      <div className="relative">
                        <pre className="bg-gray-900 dark:bg-black/40 text-green-400 text-[11px] font-mono rounded px-2.5 py-2 overflow-x-auto leading-relaxed whitespace-pre">
{`BACKEND_URL=${pushConfig.backendUrl} \\
WEBHOOK_SECRET=${pushConfig.webhookSecret} \\
TENANT_ID=${pushConfig.tenantId} \\
node zalo-history-push.mjs`}
                        </pre>
                        <button
                          onClick={() => copyToClipboard(
                            `BACKEND_URL=${pushConfig.backendUrl} WEBHOOK_SECRET=${pushConfig.webhookSecret} TENANT_ID=${pushConfig.tenantId} node zalo-history-push.mjs`,
                            'run'
                          )}
                          className="absolute top-2 right-2 px-2 py-1 text-[10px] font-medium text-gray-400 dark:text-zinc-400 bg-gray-700/50 hover:bg-gray-700 rounded transition-colors"
                        >
                          {copiedKey === 'run' ? '✓ Copied' : 'Copy'}
                        </button>
                      </div>
                    ) : (
                      <div className="bg-gray-900 dark:bg-black/40 rounded px-2.5 py-2 flex items-center gap-2">
                        <span className="w-3 h-3 border-2 border-green-400 border-t-transparent rounded-full animate-spin shrink-0" />
                        <span className="text-[11px] text-gray-500 dark:text-zinc-500">Đang tải thông tin...</span>
                      </div>
                    )}

                    {!pushConfig?.isOwner && pushConfig && (
                      <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1.5">
                        ⚠️ Chỉ Owner mới xem được Webhook Secret. Hỏi Owner để lấy lệnh đầy đủ.
                      </p>
                    )}

                    {/* Note */}
                    <p className="text-[11px] text-gray-400 dark:text-zinc-500 mt-2.5 leading-relaxed">
                      Yêu cầu Node.js 18+. Chạy 1 lần trên máy nhân viên — không ảnh hưởng sync bình thường.
                      Nếu không có openzca, cài thêm:{' '}
                      <code className="bg-gray-200 dark:bg-white/10 px-1 rounded">npm i -g better-sqlite3</code>
                    </p>
                  </div>

                  {/* Windows path note */}
                  <div className="rounded-lg bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 p-3">
                    <p className="text-xs font-semibold text-blue-800 dark:text-blue-300 mb-1.5">
                      📂 SQLite mặc định của Zalo PC App
                    </p>
                    <div className="space-y-1">
                      <div className="flex items-start gap-2">
                        <span className="text-[11px] font-medium text-blue-600 dark:text-blue-400 shrink-0 w-14">Windows:</span>
                        <code className="text-[11px] font-mono text-blue-700 dark:text-blue-300 break-all">%APPDATA%\ZaloPC\data\&lt;uid&gt;\messages.db</code>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="text-[11px] font-medium text-blue-600 dark:text-blue-400 shrink-0 w-14">Mac:</span>
                        <code className="text-[11px] font-mono text-blue-700 dark:text-blue-300 break-all">~/Library/Application Support/ZaloPC/data/&lt;uid&gt;/messages.db</code>
                      </div>
                    </div>
                    <p className="text-[11px] text-blue-600 dark:text-blue-400 mt-1.5">
                      Nếu path khác: <code className="bg-blue-100 dark:bg-white/10 px-1 rounded">ZALO_SQLITE_PATH=/path/to/messages.db node zalo-history-push.mjs</code>
                    </p>
                  </div>
                </div>
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
              🔄 Đang khởi động OpenClaw...<br/>QR sẽ hiện ngay, đừng đi đâu cả!
            </p>
          )}
        </div>

        {/* Native mode hint */}
        {nativeMode && !qrDataUrl && (
          <div className="w-full bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-lg p-3 text-xs text-amber-800 dark:text-amber-300">
            <p className="font-medium mb-1">OpenClaw đang chạy trên máy/server khác của bạn (không phải máy này)</p>
            <p>Vui lòng khởi động lại OpenClaw trên máy/server đó → QR sẽ tự hiện ở đây trong vài giây.</p>
          </div>
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
