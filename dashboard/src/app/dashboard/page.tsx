'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { api, connectWebSocket } from '@/lib/api'
import { LABEL_CFG, formatRelative } from '@/lib/format'
import { DigestModal } from '@/components/dashboard/DigestModal'
import { TrendChart } from '@/components/dashboard/TrendChart'

type TenantInfo = {
  plan: string
  maxGroups: number
  maxMessagesPerMonth: number
  maxBoardViewers: number
  messagesThisMonth: number
}

type Overview = {
  stats: {
    totalGroups: number
    activeGroups: number
    messages24h: number
    openAlerts: number
    complaints7d: number
    opportunities7d: number
  }
  recentActivity: Array<{
    id: string
    content: string | null
    senderName: string | null
    contentType: string
    sentAt: string
    group: { id: string; name: string; category: string | null }
    analysis: { label: keyof typeof LABEL_CFG; priority: string } | null
  }>
}

export default function OverviewPage() {
  const [data, setData] = useState<Overview | null>(null)
  const [live, setLive] = useState(false)
  const [showDigest, setShowDigest] = useState(false)
  const [myGroupsCount, setMyGroupsCount] = useState<number | null>(null)
  const [installCmd, setInstallCmd] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [zaloConnected, setZaloConnected] = useState<boolean | null>(null)
  const [tenantInfo, setTenantInfo] = useState<TenantInfo | null>(null)
  const [sessionHealth, setSessionHealth] = useState<{
    status: 'healthy' | 'warning' | 'dead' | 'never'
    hoursSincePing: number | null
    syncStatus: 'never' | 'pending' | 'syncing' | 'done'
    lastAutoSyncAt: string | null
  } | null>(null)

  const load = () => api<Overview>('/api/stats/overview').then(setData).catch(() => undefined)

  useEffect(() => {
    load()
    // Check user đã cài hook chưa (bằng số groups họ sở hữu)
    api<any[]>('/api/groups?scope=mine').then(gs => setMyGroupsCount(gs.length)).catch(() => undefined)
    api<{ oneLineCommand: string }>('/api/auth/my-install-command').then(d => setInstallCmd(d.oneLineCommand)).catch(() => undefined)
    // Check Zalo connection status — ẩn banner nếu đã kết nối
    api<{ connected: boolean; containerRunning: boolean }>('/api/zalo/connection-status')
      .then(s => setZaloConnected(s.connected || s.containerRunning))
      .catch(() => setZaloConnected(false))
    // Fetch tenant info for plan card
    api<TenantInfo>('/api/tenants/current').then(setTenantInfo).catch(() => undefined)
    // Fetch session health for status widget
    api<any>('/api/zalo/session-health').then(setSessionHealth).catch(() => undefined)

    const close = connectWebSocket((event) => {
      if (event === 'message:new' || event === 'alert:new' || event === 'analysis:result') {
        setLive(true)
        setTimeout(() => setLive(false), 2000)
        load()
      }
    })
    const i = setInterval(load, 30_000)
    return () => { close(); clearInterval(i) }
  }, [])

  function copyCmd() {
    if (!installCmd) return
    navigator.clipboard.writeText(installCmd)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const s = data?.stats

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      {/* Onboarding banner — chỉ hiện khi chưa có kết nối Zalo nào */}
      {myGroupsCount === 0 && installCmd && zaloConnected === false && (
        <div className="mb-5 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-500/10 dark:to-indigo-500/10 border border-blue-200 dark:border-blue-500/30 rounded-2xl p-4 md:p-5">
          <div className="flex items-start gap-3">
            <div className="text-2xl">👋</div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900 dark:text-zinc-100">Chào mừng! Cài listener để bắt đầu theo dõi Zalo của bạn</p>
              <p className="text-xs text-gray-600 dark:text-zinc-400 mt-0.5 mb-3">
                Chạy lệnh sau trên máy chủ có Zalo cá nhân của bạn. Tin nhắn sẽ forward về đây và chỉ bạn (và OWNER/MANAGER) thấy được.
              </p>
              <div className="bg-gray-900 dark:bg-black/60 rounded-xl p-2.5 font-mono text-[11px] text-green-400 break-all whitespace-pre-wrap">
                {installCmd}
              </div>
              <div className="flex gap-2 mt-2">
                <button onClick={copyCmd} className="px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white text-xs font-medium rounded-lg">
                  {copied ? '✓ Đã copy' : '📋 Copy lệnh'}
                </button>
                <Link href="/dashboard/settings" className="px-3 py-1.5 bg-white dark:bg-white/10 border border-gray-200 dark:border-white/10 text-gray-700 dark:text-zinc-300 text-xs font-medium rounded-lg hover:bg-gray-50 dark:hover:bg-white/15">
                  Hướng dẫn chi tiết
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="mb-6 md:mb-8 flex items-start md:items-center justify-between flex-col md:flex-row gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-zinc-100 tracking-tight">Chào buổi sáng 👋</h1>
          <p className="text-gray-500 dark:text-zinc-400 mt-1">Hôm nay có {s?.openAlerts ?? '…'} cảnh báo cần xử lý</p>
        </div>
        <div className="flex items-center gap-3">
          {live && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-green-500/10 rounded-full">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
              </span>
              <span className="text-xs text-green-700 font-medium">Có tin nhắn mới</span>
            </div>
          )}
          <button
            onClick={() => setShowDigest(true)}
            className="px-4 py-2 bg-gradient-to-r from-blue-500 to-indigo-600 text-white text-sm font-medium rounded-full shadow-md hover:shadow-lg transition-shadow"
          >
            📊 Xem báo cáo
          </button>
        </div>
      </div>

      {showDigest && <DigestModal onClose={() => setShowDigest(false)} />}

      {tenantInfo && <PlanCard tenant={tenantInfo} groupCount={data?.stats.totalGroups ?? 0} />}

      {/* Zalo session + sync status widget */}
      {sessionHealth && <ZaloStatusWidget health={sessionHealth} />}

      {/* Stats Grid - iOS widget style */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4 mb-6">
        <StatCard
          icon={<span className="text-xl">💬</span>}
          tint="bg-blue-500/10 text-blue-600"
          label="Nhóm đang theo dõi"
          value={s?.totalGroups ?? '—'}
          sub={`${s?.activeGroups ?? 0} hoạt động 24h`}
        />
        <StatCard
          icon={<span className="text-xl">📨</span>}
          tint="bg-purple-500/10 text-purple-600"
          label="Tin nhắn hôm nay"
          value={s?.messages24h ?? '—'}
          sub="trong 24 giờ qua"
        />
        <StatCard
          icon={<span className="text-xl">🚨</span>}
          tint="bg-red-500/10 text-red-600"
          label="Cần xử lý"
          value={s?.openAlerts ?? '—'}
          sub="cảnh báo đang mở"
          highlight={s && s.openAlerts > 0}
        />
        <StatCard
          icon={<span className="text-xl">⚠️</span>}
          tint="bg-orange-500/10 text-orange-600"
          label="Khiếu nại"
          value={s?.complaints7d ?? '—'}
          sub="trong 7 ngày"
        />
        <StatCard
          icon={<span className="text-xl">💰</span>}
          tint="bg-green-500/10 text-green-600"
          label="Cơ hội"
          value={s?.opportunities7d ?? '—'}
          sub="trong 7 ngày"
        />
        <StatCard
          icon={<span className="text-xl">✨</span>}
          tint="bg-indigo-500/10 text-indigo-600"
          label="AI đã phân tích"
          value={s?.messages24h ?? '—'}
          sub="tin nhắn hôm nay"
        />
      </div>

      {/* Trend chart */}
      <TrendChart />

      {/* Live Activity */}
      <div className="bg-white dark:bg-zinc-900 dark:ring-1 dark:ring-white/5 rounded-2xl shadow-[0_1px_2px_rgba(0,0,0,0.04)] overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 dark:border-white/5 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-zinc-100">Hoạt động gần đây</h2>
            <p className="text-xs text-gray-500 dark:text-zinc-400 mt-0.5">Tin nhắn mới nhất từ các nhóm</p>
          </div>
          <Link href="/dashboard/groups" className="text-sm text-blue-500 font-medium hover:underline">
            Xem tất cả
          </Link>
        </div>

        <div className="divide-y divide-gray-100 dark:divide-white/5">
          {data?.recentActivity.length === 0 && (
            <div className="p-10 text-center text-gray-400 dark:text-zinc-500">
              <div className="text-4xl mb-2">💤</div>
              <p className="text-sm">Chưa có tin nhắn nào. Đang chờ...</p>
            </div>
          )}

          {data?.recentActivity.map(msg => {
            const cfg = msg.analysis ? LABEL_CFG[msg.analysis.label] : null
            return (
              <Link
                key={msg.id}
                href={`/dashboard/groups/${msg.group.id}`}
                className="flex items-start gap-3 px-5 py-3.5 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
              >
                {/* Avatar */}
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white font-semibold text-sm shrink-0">
                  {msg.senderName?.[0]?.toUpperCase() ?? '?'}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2">
                    <p className="text-sm font-semibold text-gray-900 dark:text-zinc-100 truncate">{msg.senderName ?? 'Ẩn danh'}</p>
                    <p className="text-xs text-gray-400 dark:text-zinc-500 shrink-0">{formatRelative(msg.sentAt)}</p>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-zinc-400 truncate">trong <span className="font-medium text-gray-700 dark:text-zinc-300">{msg.group.name}</span></p>
                  <p className="text-sm text-gray-800 dark:text-zinc-200 mt-1 line-clamp-2">{msg.content ?? `[${msg.contentType}]`}</p>

                  {cfg && (
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${cfg.color} border`}>
                        <span>{cfg.icon}</span>
                        <span>{cfg.label}</span>
                      </span>
                    </div>
                  )}
                </div>
              </Link>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function PlanCard({ tenant, groupCount }: { tenant: TenantInfo; groupCount: number }) {
  const [syncing, setSyncing] = useState(false)
  const [syncDone, setSyncDone] = useState(false)

  async function triggerSync() {
    setSyncing(true)
    try {
      await api('/api/zalo/sync-all-history', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ groups: 30, limit: 100 }) })
      setSyncDone(true)
      setTimeout(() => setSyncDone(false), 3000)
    } finally { setSyncing(false) }
  }

  const msgPct = tenant.maxMessagesPerMonth > 0 ? Math.min(100, (tenant.messagesThisMonth / tenant.maxMessagesPerMonth) * 100) : 0
  const grpPct = tenant.maxGroups > 0 ? Math.min(100, (groupCount / tenant.maxGroups) * 100) : 0

  const PLAN_COLORS: Record<string, string> = {
    free: 'bg-gray-100 dark:bg-white/10 text-gray-600 dark:text-zinc-400',
    starter: 'bg-green-100 dark:bg-green-500/20 text-green-700 dark:text-green-400',
    basic: 'bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400',
    pro: 'bg-purple-100 dark:bg-purple-500/20 text-purple-700 dark:text-purple-400',
    business: 'bg-orange-100 dark:bg-orange-500/20 text-orange-700 dark:text-orange-400',
    enterprise: 'bg-yellow-100 dark:bg-yellow-500/20 text-yellow-700 dark:text-yellow-400',
  }

  return (
    <div className="bg-white dark:bg-zinc-900 dark:ring-1 dark:ring-white/5 rounded-2xl p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)] mb-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-zinc-100">Gói dịch vụ</h3>
          <span className={`text-xs px-2 py-0.5 rounded-full font-semibold uppercase ${PLAN_COLORS[tenant.plan] ?? PLAN_COLORS.free}`}>
            {tenant.plan}
          </span>
        </div>
        <button
          onClick={triggerSync}
          disabled={syncing}
          className="text-xs px-3 py-1.5 bg-blue-50 dark:bg-blue-500/10 hover:bg-blue-100 dark:hover:bg-blue-500/20 text-blue-600 dark:text-blue-400 rounded-lg font-medium transition-colors disabled:opacity-50"
        >
          {syncDone ? '✓ Đã sync' : syncing ? 'Đang sync...' : '🔄 Sync lịch sử'}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {/* Messages usage */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-gray-500 dark:text-zinc-400">Tin nhắn tháng này</span>
            <span className="text-xs font-medium text-gray-700 dark:text-zinc-300 tabular-nums">
              {(tenant.messagesThisMonth ?? 0).toLocaleString('vi-VN')}
              {tenant.maxMessagesPerMonth > 0 && <span className="text-gray-400">/{(tenant.maxMessagesPerMonth ?? 0).toLocaleString('vi-VN')}</span>}
            </span>
          </div>
          <div className="h-1.5 bg-gray-100 dark:bg-white/10 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${msgPct > 90 ? 'bg-red-500' : msgPct > 70 ? 'bg-amber-500' : 'bg-blue-500'}`}
              style={{ width: tenant.maxMessagesPerMonth > 0 ? `${msgPct}%` : '0%' }}
            />
          </div>
        </div>

        {/* Groups usage */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-gray-500 dark:text-zinc-400">Nhóm đang theo dõi</span>
            <span className="text-xs font-medium text-gray-700 dark:text-zinc-300 tabular-nums">
              {groupCount}
              {tenant.maxGroups > 0 && <span className="text-gray-400">/{tenant.maxGroups}</span>}
            </span>
          </div>
          <div className="h-1.5 bg-gray-100 dark:bg-white/10 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${grpPct > 90 ? 'bg-red-500' : grpPct > 70 ? 'bg-amber-500' : 'bg-green-500'}`}
              style={{ width: tenant.maxGroups > 0 ? `${grpPct}%` : '0%' }}
            />
          </div>
        </div>
      </div>

      {tenant.maxMessagesPerMonth > 0 && msgPct > 80 && (
        <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
          ⚠️ Đã dùng {Math.round(msgPct)}% quota tin nhắn tháng này.
        </p>
      )}
    </div>
  )
}

function StatCard({
  icon, tint, label, value, sub, highlight,
}: {
  icon: React.ReactNode
  tint: string
  label: string
  value: string | number
  sub?: string
  highlight?: boolean | null | undefined
}) {
  return (
    <div className={`bg-white dark:bg-zinc-900 dark:ring-1 dark:ring-white/5 rounded-2xl p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-transform hover:scale-[1.01] ${highlight ? 'ring-2 ring-red-500/20' : ''}`}>
      <div className="flex items-start justify-between">
        <div className={`w-9 h-9 rounded-xl ${tint} flex items-center justify-center`}>
          {icon}
        </div>
      </div>
      <p className="text-xs text-gray-500 dark:text-zinc-400 mt-3 font-medium">{label}</p>
      <p className="text-2xl font-bold text-gray-900 dark:text-zinc-100 mt-0.5 tabular-nums">{value}</p>
      {sub && <p className="text-[11px] text-gray-400 dark:text-zinc-500 mt-0.5">{sub}</p>}
    </div>
  )
}

function ZaloStatusWidget({ health }: {
  health: {
    status: 'healthy' | 'warning' | 'dead' | 'never'
    hoursSincePing: number | null
    syncStatus: 'never' | 'pending' | 'syncing' | 'done'
    lastAutoSyncAt: string | null
  }
}) {
  const sessionCfg = {
    healthy: { dot: 'bg-green-500', text: 'Đã kết nối',     color: 'text-green-600 dark:text-green-400' },
    warning: { dot: 'bg-amber-400 animate-pulse', text: 'Tín hiệu yếu', color: 'text-amber-600 dark:text-amber-400' },
    dead:    { dot: 'bg-red-500',   text: 'Mất kết nối',      color: 'text-red-600 dark:text-red-400' },
    never:   { dot: 'bg-gray-400',  text: 'Chưa kết nối',     color: 'text-gray-500 dark:text-zinc-400' },
  }[health.status]

  const syncLabel =
    health.syncStatus === 'syncing' ? '⟳ Đang sync...' :
    health.syncStatus === 'done' && health.lastAutoSyncAt
      ? `✓ Đã sync ${new Date(health.lastAutoSyncAt).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}`
      : health.syncStatus === 'pending' ? '⏳ Chờ sync lần đầu'
      : '—'

  if (health.status === 'healthy' && health.syncStatus === 'done') return null

  return (
    <Link href="/dashboard/settings/channels"
      className="mb-4 flex items-center gap-3 bg-white dark:bg-zinc-900 dark:ring-1 dark:ring-white/5 rounded-2xl px-4 py-3 border border-gray-200 dark:border-white/10 hover:shadow-md transition-all group">
      <div className="w-9 h-9 rounded-xl bg-blue-500 flex items-center justify-center text-white font-bold shrink-0 text-base">Z</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full shrink-0 ${sessionCfg.dot}`} />
          <span className={`text-sm font-medium ${sessionCfg.color}`}>{sessionCfg.text}</span>
          {health.status === 'dead' && health.hoursSincePing && (
            <span className="text-xs text-red-400 dark:text-red-500">· {health.hoursSincePing}h rồi</span>
          )}
        </div>
        <p className="text-xs text-gray-400 dark:text-zinc-500 mt-0.5 truncate">{syncLabel}</p>
      </div>
      <span className="text-gray-400 dark:text-zinc-500 group-hover:text-gray-600 dark:group-hover:text-zinc-300 text-xs shrink-0">
        {health.status === 'dead' ? 'Kết nối lại →' : 'Quản lý →'}
      </span>
    </Link>
  )
}
