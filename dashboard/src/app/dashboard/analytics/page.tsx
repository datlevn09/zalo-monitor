'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { SyncHistoryButton } from '@/components/SyncHistoryButton'
import { GradientAreaChart, MultiLineChart } from '@/components/charts/AreaChart'
import { DonutChart, DonutLegend } from '@/components/charts/Donut'
import { Heatmap } from '@/components/charts/Heatmap'
import { WordCloud } from '@/components/charts/WordCloud'
import { TopList } from '@/components/charts/TopList'
import { LABEL_CFG, formatRelative } from '@/lib/format'
import { zaloChatUserLink } from '@/lib/deeplink'

type GroupHealth = {
  topPositive: any[]; topNegative: any[]
  topOpportunity: any[]; topComplaint: any[]
  zombie: any[]
}
type Sender = {
  senderId: string; senderName: string
  avatarUrl: string | null; phone: string | null
  messageCount: number; groupCount: number
  positive: number; negative: number
}
type HeatmapData = { grid: number[][]; maxValue: number }
type SentimentPoint = { day: string; positive: number; negative: number; neutral: number }
type WeekCompare = {
  thisWeek: { total: number; opportunity: number; complaint: number; positive: number }
  lastWeek: { total: number; opportunity: number; complaint: number; positive: number }
  delta: { total: number; opportunity: number; complaint: number; positive: number }
}
type LabelDist = Array<{ label: string; count: number }>
type ChannelBreak = Array<{ channel: string; total: number; positive: number; negative: number; opportunity: number }>
type WordCloudData = { words: Array<{ word: string; count: number }>; total: number }
type SlowReply = Array<{ id: string; name: string; avgLagSec: number | null; openMessages: number }>

// Plan-gated time ranges
type Range = 7 | 30 | 90 | 365 | 'custom'
const RANGE_PLAN: Record<Range, { label: string; minPlan: string }> = {
  7:        { label: '7 ngày',   minPlan: 'free' },
  30:       { label: '30 ngày',  minPlan: 'free' },
  90:       { label: 'Quý',      minPlan: 'pro' },
  365:      { label: 'Năm',      minPlan: 'business' },
  'custom': { label: 'Tùy chỉnh', minPlan: 'business' },
}
const PLAN_RANK: Record<string, number> = { free: 0, pro: 1, business: 2, unlimited: 3 }

function isUnlocked(rangePlan: string, userPlan: string): boolean {
  return (PLAN_RANK[userPlan] ?? 0) >= (PLAN_RANK[rangePlan] ?? 0)
}

type FilterType = 'all' | 'group' | 'dm'

export default function AnalyticsPage() {
  const [range, setRange] = useState<Range>(7)
  const [customDays, setCustomDays] = useState(60)
  const [filter, setFilter] = useState<FilterType>('all')
  const [plan, setPlan] = useState<string>('free')
  const [health, setHealth] = useState<GroupHealth | null>(null)
  const [senders, setSenders] = useState<Sender[]>([])
  const [heatmap, setHeatmap] = useState<HeatmapData | null>(null)
  const [trend, setTrend] = useState<SentimentPoint[]>([])
  const [week, setWeek] = useState<WeekCompare | null>(null)
  const [labels, setLabels] = useState<LabelDist>([])
  const [channels, setChannels] = useState<ChannelBreak>([])
  const [wordCloud, setWordCloud] = useState<WordCloudData | null>(null)
  const [slow, setSlow] = useState<SlowReply>([])

  // Effective days for API
  const days = range === 'custom' ? customDays : range

  // Fetch tenant plan once
  useEffect(() => {
    api<{ plan: string }>('/api/tenants/current').then(t => setPlan(t.plan || 'free')).catch(() => undefined)
  }, [])

  useEffect(() => {
    const q = `days=${days}&filter=${filter}`
    Promise.all([
      api<GroupHealth>(`/api/analytics/group-health?${q}`).then(setHealth),
      api<Sender[]>(`/api/analytics/top-senders?${q}`).then(setSenders),
      api<HeatmapData>(`/api/analytics/heatmap?${q}`).then(setHeatmap),
      api<SentimentPoint[]>(`/api/analytics/sentiment-trend?days=${Math.max(days, 14)}&filter=${filter}`).then(setTrend),
      api<WeekCompare>(`/api/analytics/weekly-compare?${q}`).then(setWeek),
      api<LabelDist>(`/api/analytics/label-distribution?${q}`).then(setLabels),
      api<ChannelBreak>(`/api/analytics/channel-breakdown?${q}`).then(setChannels),
      api<WordCloudData>(`/api/analytics/word-cloud?${q}`).then(setWordCloud),
      api<SlowReply>(`/api/analytics/slow-reply?${q}`).then(setSlow),
    ]).catch(() => undefined)
  }, [days, filter])

  // Derive donut data
  const labelColors: Record<string, string> = {
    OPPORTUNITY: '#34C759',
    POSITIVE: '#5AC8FA',
    NEUTRAL: '#8E8E93',
    COMPLAINT: '#FF3B30',
    RISK: '#FF9500',
  }
  const totalMessages = labels.reduce((s, l) => s + l.count, 0)
  const donutData = labels.map(l => ({
    name: LABEL_CFG[l.label as keyof typeof LABEL_CFG]?.label ?? l.label,
    value: l.count,
    color: labelColors[l.label] ?? '#8E8E93',
  }))

  // Trend data format
  const trendData = trend.map(t => ({
    x: new Date(t.day).getDate() + '/' + (new Date(t.day).getMonth() + 1),
    positive: t.positive, negative: t.negative, neutral: t.neutral,
  }))

  // Total volume trend (all labels combined)
  const volumeData = trend.map(t => ({
    x: new Date(t.day).getDate() + '/' + (new Date(t.day).getMonth() + 1),
    y: t.positive + t.negative + t.neutral,
  }))

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6 md:mb-8 flex items-start justify-between flex-wrap gap-3">
        <div className="flex items-start gap-3">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-zinc-100 tracking-tight">Phân tích</h1>
            <p className="text-gray-500 dark:text-zinc-400 mt-1 text-sm">Hiểu sâu về hoạt động các nhóm và DM</p>
          </div>
          <div className="pt-1">
            <SyncHistoryButton />
          </div>
        </div>

        <div className="flex flex-col gap-2 items-end">
          {/* Filter: tất cả / nhóm / DM */}
          <div className="bg-gray-100 dark:bg-white/10 p-1 rounded-xl flex gap-0.5">
            {([
              ['all',   'Tất cả'],
              ['group', '👥 Nhóm'],
              ['dm',    '💬 Cá nhân'],
            ] as const).map(([k, label]) => (
              <button
                key={k}
                onClick={() => setFilter(k)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  filter === k ? 'bg-white dark:bg-white/15 text-gray-900 dark:text-zinc-100 shadow-sm' : 'text-gray-600 dark:text-zinc-400'
                }`}
              >{label}</button>
            ))}
          </div>

          {/* Time range — plan-gated */}
          <div className="bg-gray-100 dark:bg-white/10 p-1 rounded-xl flex gap-0.5 flex-wrap">
            {(Object.entries(RANGE_PLAN) as Array<[string, { label: string; minPlan: string }]>).map(([k, cfg]) => {
              const r = (k === 'custom' ? 'custom' : Number(k)) as Range
              const unlocked = isUnlocked(cfg.minPlan, plan)
              const active = range === r
              return (
                <button
                  key={k}
                  onClick={() => unlocked && setRange(r)}
                  disabled={!unlocked}
                  title={unlocked ? '' : `Chỉ gói ${cfg.minPlan} trở lên`}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1 ${
                    active ? 'bg-white dark:bg-white/15 text-gray-900 dark:text-zinc-100 shadow-sm'
                    : unlocked ? 'text-gray-600 dark:text-zinc-400'
                    : 'text-gray-400 dark:text-zinc-600 cursor-not-allowed'
                  }`}
                >
                  {cfg.label}
                  {!unlocked && <span className="text-[10px]">🔒</span>}
                </button>
              )
            })}
          </div>

          {/* Custom range picker */}
          {range === 'custom' && (
            <div className="flex items-center gap-2 text-xs">
              <label className="text-gray-500 dark:text-zinc-400">Số ngày:</label>
              <input
                type="number"
                min={1} max={3650}
                value={customDays}
                onChange={e => setCustomDays(Math.max(1, Number(e.target.value) || 1))}
                className="w-20 px-2 py-1 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-white/10 rounded-md text-gray-900 dark:text-zinc-100 tabular-nums"
              />
            </div>
          )}
        </div>
      </div>

      {/* Weekly comparison hero cards */}
      {week && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <WeekCard label="Tin nhắn" value={week.thisWeek.total} delta={week.delta.total} tint="from-blue-400 to-blue-600" />
          <WeekCard label="Cơ hội" value={week.thisWeek.opportunity} delta={week.delta.opportunity} tint="from-green-400 to-emerald-600" />
          <WeekCard label="Khiếu nại" value={week.thisWeek.complaint} delta={-week.delta.complaint} tint="from-red-400 to-rose-600" invertDelta />
          <WeekCard label="Tích cực" value={week.thisWeek.positive} delta={week.delta.positive} tint="from-indigo-400 to-purple-600" />
        </div>
      )}

      {/* Row 1: Volume trend + Label distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <Card className="lg:col-span-2">
          <CardHeader title="📈 Xu hướng hoạt động" subtitle={`Tin nhắn ${days} ngày qua`} />
          <GradientAreaChart data={volumeData} color="#007AFF" label="Tin nhắn" height={240} />
        </Card>

        <Card>
          <CardHeader title="🎯 Phân loại tin" subtitle="AI phân tích" />
          <DonutChart data={donutData} centerValue={totalMessages} centerLabel="tổng tin" />
          <div className="mt-4">
            <DonutLegend data={donutData} total={totalMessages} />
          </div>
        </Card>
      </div>

      {/* Row 2: Group health matrix 2x2 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <Card accent="emerald">
          <CardHeader title="💚 Top tích cực" subtitle="% phản hồi tích cực cao nhất" badge="Good" badgeTint="bg-green-50 text-green-700" />
          <TopList
            items={(health?.topPositive ?? []).map(g => ({
              id: g.id, name: g.name,
              value: Math.round(g.positiveRatio * 100),
              subtitle: `${g.positive}/${g.totalMessages} tin · ${g.memberCount ?? '?'} thành viên`,
              color: 'linear-gradient(to right, #34C759, #5AC8FA)',
            }))}
            maxValue={100}
            suffix="%"
          />
        </Card>

        <Card accent="red">
          <CardHeader title="🔴 Top cảnh báo" subtitle="Tỷ lệ khiếu nại + rủi ro" badge="Attention" badgeTint="bg-red-50 text-red-700" />
          <TopList
            items={(health?.topNegative ?? []).map(g => ({
              id: g.id, name: g.name,
              value: Math.round(g.negativeRatio * 100),
              subtitle: `${g.complaint} khiếu nại · ${g.risk} rủi ro`,
              color: 'linear-gradient(to right, #FF3B30, #FF9500)',
            }))}
            maxValue={100}
            suffix="%"
          />
        </Card>

        <Card accent="green">
          <CardHeader title="💰 Top cơ hội" subtitle="Lead đang quan tâm" badge="Sales" badgeTint="bg-green-50 text-green-700" />
          <TopList
            items={(health?.topOpportunity ?? []).map(g => ({
              id: g.id, name: g.name,
              value: g.opportunity,
              subtitle: g.memberCount ? `${g.memberCount} thành viên` : '',
              color: 'linear-gradient(to right, #34C759, #30D158)',
            }))}
            suffix="leads"
          />
        </Card>

        <Card accent="orange">
          <CardHeader title="🚨 Top khiếu nại" subtitle="Cần xử lý ưu tiên" badge="Urgent" badgeTint="bg-orange-50 text-orange-700" />
          <TopList
            items={(health?.topComplaint ?? []).map(g => ({
              id: g.id, name: g.name,
              value: g.complaint,
              subtitle: g.memberCount ? `${g.memberCount} thành viên` : '',
              color: 'linear-gradient(to right, #FF9500, #FF3B30)',
            }))}
            suffix="complaints"
          />
        </Card>
      </div>

      {/* Row 3: Slow reply + Zombie */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <Card accent="yellow">
          <CardHeader title="⏱️ Nhóm reply chậm" subtitle="Thời gian phản hồi trung bình" badge="Lag" badgeTint="bg-yellow-50 text-yellow-700" />
          <TopList
            items={slow.map(g => ({
              id: g.id, name: g.name,
              value: g.avgLagSec ? Math.round(g.avgLagSec / 60) : 0,
              subtitle: g.openMessages > 0 ? `${g.openMessages} khách đang đợi reply` : '',
              color: 'linear-gradient(to right, #FF9500, #FF3B30)',
            }))}
            suffix="phút"
          />
        </Card>

        <Card accent="slate">
          <CardHeader title="💀 Nhóm zombie" subtitle="Lâu không có hoạt động" badge={`${health?.zombie.length ?? 0}`} badgeTint="bg-gray-100 dark:bg-white/10 text-gray-700 dark:text-zinc-300" />
          <TopList
            items={(health?.zombie ?? []).map(g => ({
              id: g.id, name: g.name,
              value: g.daysInactive,
              subtitle: g.lastMessageAt ? `tin cuối ${formatRelative(g.lastMessageAt)}` : 'chưa có tin',
              color: '#9ca3af',
            }))}
            suffix="ngày"
          />
        </Card>
      </div>

      {/* Row 4: Sentiment trend (multi-line) */}
      {trend.length > 0 && (
        <Card className="mb-6">
          <CardHeader title="❤️ Xu hướng sentiment" subtitle={`${trendData.length} ngày qua`} />
          <MultiLineChart
            data={trendData}
            series={[
              { key: 'positive', color: '#34C759', label: 'Tích cực' },
              { key: 'negative', color: '#FF3B30', label: 'Tiêu cực' },
              { key: 'neutral', color: '#8E8E93', label: 'Bình thường' },
            ]}
            height={240}
          />
        </Card>
      )}

      {/* Row 5: Heatmap */}
      {heatmap && heatmap.maxValue > 0 && (
        <Card className="mb-6">
          <CardHeader title="🕐 Khung giờ hoạt động" subtitle={`Phân bố tin nhắn theo giờ × ngày (peak: ${heatmap.maxValue} tin)`} />
          <Heatmap grid={heatmap.grid} maxValue={heatmap.maxValue} />
        </Card>
      )}

      {/* Row 6: Top senders + Channel breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <Card>
          <CardHeader title="🏆 Top active users" subtitle={`${days} ngày qua`} />
          <TopSenders items={senders.slice(0, 10)} />
        </Card>

        <Card>
          <CardHeader title="🌐 Phân bố theo kênh" subtitle={`${days} ngày gần nhất · ${filter === 'all' ? 'tất cả' : filter === 'group' ? 'chỉ nhóm' : 'chỉ DM'}`} />
          <div className="space-y-3 mt-2">
            {channels.map(c => {
              const emoji = c.channel === 'ZALO' ? 'Z' : c.channel === 'TELEGRAM' ? '✈️' : '🪶'
              const tint = c.channel === 'ZALO' ? 'bg-blue-500' : c.channel === 'TELEGRAM' ? 'bg-sky-500' : 'bg-emerald-500'
              return (
                <div key={c.channel} className="bg-gray-50 dark:bg-white/5 rounded-2xl p-3.5">
                  <div className="flex items-center gap-3 mb-2">
                    <div className={`w-9 h-9 rounded-xl ${tint} flex items-center justify-center text-white text-lg font-bold`}>{emoji}</div>
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-gray-900 dark:text-zinc-100">{c.channel}</p>
                      <p className="text-xs text-gray-500 dark:text-zinc-400">{c.total} tin nhắn</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-1.5 text-center">
                    <Mini label="Tích cực" value={c.positive} color="text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-500/10" />
                    <Mini label="Tiêu cực" value={c.negative} color="text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10" />
                    <Mini label="Cơ hội" value={c.opportunity} color="text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10" />
                  </div>
                </div>
              )
            })}
          </div>
        </Card>
      </div>

      {/* Row: Word cloud — full width */}
      <div className="mb-6">
        <Card>
          <CardHeader
            title="☁️ Từ khoá khách hàng"
            subtitle={`Top từ xuất hiện nhiều nhất trong ${days} ngày · ${wordCloud?.total ?? 0} tin được phân tích`}
          />
          <WordCloud words={wordCloud?.words ?? []} />
        </Card>
      </div>
    </div>
  )
}

// ────────────────────────────────── Components helpers ──────────────────────────────

function Card({ children, className = '', accent }: { children: React.ReactNode; className?: string; accent?: string }) {
  const accentBar = accent
    ? { emerald: 'from-emerald-400 to-green-500',
        red: 'from-red-400 to-rose-500',
        green: 'from-green-400 to-emerald-500',
        orange: 'from-orange-400 to-red-500',
        yellow: 'from-yellow-400 to-orange-500',
        slate: 'from-gray-400 to-gray-500',
      }[accent]
    : null

  return (
    <div className={`bg-white dark:bg-zinc-900 dark:ring-1 dark:ring-white/5 rounded-3xl shadow-[0_1px_2px_rgba(0,0,0,0.04)] p-5 relative overflow-hidden ${className}`}>
      {accentBar && (
        <div className={`absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r ${accentBar}`} />
      )}
      {children}
    </div>
  )
}

function CardHeader({ title, subtitle, badge, badgeTint }: { title: string; subtitle?: string; badge?: string; badgeTint?: string }) {
  return (
    <div className="flex items-start justify-between mb-4">
      <div>
        <h3 className="text-sm font-bold text-gray-900 dark:text-zinc-100">{title}</h3>
        {subtitle && <p className="text-xs text-gray-500 dark:text-zinc-400 mt-0.5">{subtitle}</p>}
      </div>
      {badge && (
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${badgeTint ?? 'bg-gray-100 dark:bg-white/10 text-gray-700 dark:text-zinc-300'}`}>
          {badge}
        </span>
      )}
    </div>
  )
}

function WeekCard({ label, value, delta, tint, invertDelta }: {
  label: string; value: number; delta: number; tint: string; invertDelta?: boolean
}) {
  const positive = invertDelta ? delta >= 0 : delta >= 0
  const deltaColor = positive ? 'text-green-600' : 'text-red-500'
  const arrow = delta === 0 ? '→' : delta > 0 ? '↑' : '↓'
  return (
    <div className="bg-white dark:bg-zinc-900 dark:ring-1 dark:ring-white/5 rounded-2xl p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)] overflow-hidden relative">
      <div className={`absolute -top-4 -right-4 w-16 h-16 rounded-full opacity-10 bg-gradient-to-br ${tint}`} />
      <p className="text-xs text-gray-500 dark:text-zinc-400 font-medium">{label}</p>
      <p className="text-2xl font-bold text-gray-900 dark:text-zinc-100 mt-1 tabular-nums">{value}</p>
      <p className={`text-xs font-semibold mt-1 ${deltaColor} flex items-center gap-1`}>
        <span>{arrow}</span>
        <span className="tabular-nums">{Math.abs(delta)}%</span>
        <span className="text-gray-400 dark:text-zinc-500 font-normal">vs tuần trước</span>
      </p>
    </div>
  )
}

function TopSenders({ items }: { items: Sender[] }) {
  if (items.length === 0) return <p className="text-center text-sm text-gray-400 dark:text-zinc-500 py-4">Chưa có dữ liệu</p>
  const max = items[0]?.messageCount ?? 1

  return (
    <div className="space-y-2.5">
      {items.map((s, i) => {
        const link = zaloChatUserLink({
          phone: s.phone,
          zaloId: s.senderId?.replace(/^feishu:/, ''),
        })
        const pct = (s.messageCount / max) * 100
        const name = s.senderName || 'Ẩn danh'
        return (
          <a
            key={s.senderId}
            href={link ?? '#'}
            target={link ? '_blank' : undefined}
            rel="noopener noreferrer"
            onClick={e => !link && e.preventDefault()}
            className="flex items-center gap-3 group"
          >
            <span className="text-[10px] font-semibold text-gray-400 dark:text-zinc-500 tabular-nums w-4">#{i + 1}</span>
            {s.avatarUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={s.avatarUrl} alt={name} className="w-8 h-8 rounded-full object-cover shrink-0" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white text-xs font-semibold shrink-0">
                {name[0]?.toUpperCase() ?? '?'}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2">
                <p className="text-sm font-semibold text-gray-900 dark:text-zinc-100 truncate group-hover:text-blue-600 transition-colors">
                  {name}
                  {link && <span className="text-[10px] ml-1 text-blue-400">↗</span>}
                </p>
                <p className="text-sm font-bold tabular-nums text-gray-900 dark:text-zinc-100 ml-auto">{s.messageCount}<span className="text-xs font-normal text-gray-500 dark:text-zinc-400 ml-0.5">tin</span></p>
              </div>
              <p className="text-[11px] text-gray-500 dark:text-zinc-400 mt-0.5">
                {s.groupCount} nhóm · 👍 {s.positive} · 👎 {s.negative}
              </p>
              <div className="h-1 bg-gray-100 dark:bg-white/10 rounded-full overflow-hidden mt-1">
                <div className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${pct}%`, background: 'linear-gradient(to right, #007AFF, #AF52DE)' }} />
              </div>
            </div>
          </a>
        )
      })}
    </div>
  )
}

function Mini({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className={`rounded-lg py-1.5 ${color}`}>
      <p className="text-sm font-bold tabular-nums">{value}</p>
      <p className="text-[10px] font-medium opacity-75">{label}</p>
    </div>
  )
}
