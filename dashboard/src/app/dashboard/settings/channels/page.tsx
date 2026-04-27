'use client'

import { useEffect, useState } from 'react'
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

const CHANNEL_GUIDE_URLS: Record<string, string> = {
  zaloPersonal: 'https://docs.zalo-monitor.dev/install-zalo',
  telegram: 'https://docs.zalo-monitor.dev/install-telegram',
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
            <ChannelCard
              key={key}
              channelKey={key}
              config={cfg}
              onToggle={() => toggleChannel(key, !(cfg.enabled ?? false))}
              disabled={saving}
              guideUrl={CHANNEL_GUIDE_URLS[key]}
            />
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
