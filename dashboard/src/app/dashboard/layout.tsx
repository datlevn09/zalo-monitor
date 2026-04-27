'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { getToken, getTenantId, connectWebSocket, api } from '@/lib/api'
import { Footer } from '@/components/Footer'
import { Header } from '@/components/Header'
import { RemoteBanner } from '@/components/RemoteBanner'
import { BoardProvider } from '@/lib/board-context'
import { BoardSwitcher } from '@/components/BoardSwitcher'

const NAV = [
  { href: '/',                    label: 'Home',       icon: IconHome,     tint: 'bg-blue-500',   exact: true },
  { href: '/dashboard',           label: 'Dashboard',  icon: IconDashboard, tint: 'bg-indigo-600', exact: true },
  { href: '/dashboard/ai',        label: 'AI Chat',    icon: IconSparkle,  tint: 'bg-indigo-500' },
  { href: '/dashboard/analytics', label: 'Phân tích',  icon: IconChart,    tint: 'bg-purple-500' },
  { href: '/dashboard/search',    label: 'Tìm kiếm',   icon: IconSearch,   tint: 'bg-amber-500' },
  { href: '/dashboard/customers', label: 'Khách hàng', icon: IconUsers,    tint: 'bg-pink-500' },
  { href: '/dashboard/pipeline',     label: 'Pipeline',   icon: IconKanban,    tint: 'bg-teal-500' },
  { href: '/dashboard/appointments', label: 'Lịch hẹn',  icon: IconCalendar,  tint: 'bg-orange-500' },
  { href: '/dashboard/groups',    label: 'Nhóm chat',  icon: IconChat,     tint: 'bg-green-500' },
  { href: '/dashboard/alerts',    label: 'Cảnh báo',   icon: IconBell,     tint: 'bg-red-500' },
  { href: '/dashboard/rules',     label: 'Cấu hình AI', icon: IconWand,     tint: 'bg-fuchsia-500' },
  { href: '/dashboard/export',    label: 'Xuất dữ liệu',icon: IconExport,   tint: 'bg-slate-500' },
  { href: '/dashboard/team',              label: 'Team',        icon: IconTeam,     tint: 'bg-cyan-500' },
  { href: '/dashboard/settings/channels', label: 'Kênh',        icon: IconChannel,  tint: 'bg-violet-500' },
  { href: '/dashboard/settings',          label: 'Cài đặt',     icon: IconSettings, tint: 'bg-gray-500' },
]


type SessionHealth = {
  status: 'healthy' | 'warning' | 'dead' | 'never'
  hoursSincePing: number | null
  syncStatus: 'never' | 'pending' | 'syncing' | 'done'
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [live, setLive] = useState(false)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [currentUserName, setCurrentUserName] = useState<string | null>(null)
  const [sessionHealth, setSessionHealth] = useState<SessionHealth | null>(null)
  const [bannerDismissed, setBannerDismissed] = useState(false)
  const [zaloConnected, setZaloConnected] = useState<boolean | null>(null)

  useEffect(() => {
    // Ưu tiên JWT — không có token → login. Không có tenant → setup wizard.
    if (!getToken()) router.replace('/login')
    else if (!getTenantId()) router.replace('/setup')
    else {
      // Fetch current user info
      api<{ user: { id: string; name: string } }>('/api/auth/me')
        .then((res) => {
          setCurrentUserId(res.user.id)
          setCurrentUserName(res.user.name)
          setReady(true)
        })
        .catch(() => {
          // Fallback if fetch fails
          setReady(true)
        })
    }
  }, [router])

  useEffect(() => {
    if (!ready) return
    const checkHealth = () =>
      api<SessionHealth>('/api/zalo/session-health').then(setSessionHealth).catch(() => undefined)
    checkHealth()
    const t = setInterval(checkHealth, 5 * 60_000)
    return () => clearInterval(t)
  }, [ready])

  useEffect(() => {
    if (!ready) return
    const checkConn = () =>
      api<{ connected: boolean }>('/api/zalo/connection-status')
        .then(r => setZaloConnected(r.connected))
        .catch(() => undefined)
    checkConn()
    const t = setInterval(checkConn, 60_000)
    return () => clearInterval(t)
  }, [ready])

  useEffect(() => {
    if (!ready) return
    const close = connectWebSocket(() => setLive(true))
    return () => close()
  }, [ready])

  if (!ready || !currentUserId || !currentUserName) return null

  return (
    <BoardProvider currentUserId={currentUserId} currentUserName={currentUserName}>
      <div className="h-[100dvh] overflow-hidden bg-[#f2f2f7] dark:bg-zinc-950 text-gray-900 dark:text-zinc-100 flex flex-col transition-colors">
        {/* Header — full width, cố định */}
        <Header
          right={
            <div className="flex items-center gap-3">
              <BoardSwitcher />
              <span
                title={live ? 'Live' : 'Offline'}
                className={`w-2 h-2 rounded-full ${live ? 'bg-green-500 animate-pulse' : 'bg-gray-300 dark:bg-white/20'}`}
              />
            </div>
          }
        />

        {/* Remote Banner — full width, below header */}
        <RemoteBanner />

        {/* Zalo disconnected banner */}
        {!bannerDismissed && (zaloConnected === false || sessionHealth?.status === 'dead') && !pathname.includes('/settings/channels') && (
          <ZaloDisconnectedBanner
            hoursSincePing={sessionHealth?.hoursSincePing ?? null}
            onDismiss={() => setBannerDismissed(true)}
          />
        )}

        {/* Sidebar (icon-only mobile, expanded desktop) + Main */}
        <div className="flex-1 min-h-0 flex flex-row">
          <aside className="flex shrink-0 w-14 md:w-56 p-1.5 md:p-3 flex-col gap-2 overflow-y-auto border-r border-gray-200 dark:border-white/10">
            <nav className="bg-white dark:bg-zinc-900 rounded-2xl p-1 md:p-1.5 dark:ring-1 dark:ring-white/5 space-y-0.5 flex-1">
              {NAV.map(item => {
                const active = item.exact
                  ? pathname === item.href
                  : pathname === item.href || pathname.startsWith(item.href + '/')
                const Icon = item.icon
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={item.label}
                    className={`flex items-center md:gap-3 px-1.5 md:px-2.5 py-2 rounded-xl text-sm transition-all justify-center md:justify-start ${
                      active
                        ? 'bg-gray-100 dark:bg-white/10 text-gray-900 dark:text-white font-medium'
                        : 'text-gray-700 dark:text-zinc-400 hover:bg-gray-50 dark:hover:bg-white/5'
                    }`}
                  >
                    <div className={`w-8 h-8 md:w-7 md:h-7 rounded-lg ${item.tint} flex items-center justify-center text-white shadow-sm shrink-0`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <span className="hidden md:inline truncate">{item.label}</span>
                    {active && <ChevRight className="w-4 h-4 text-gray-400 dark:text-zinc-500 ml-auto hidden md:block" />}
                  </Link>
                )
              })}
            </nav>
          </aside>

          {/* Main content — chỉ vùng này cuộn */}
          <main className="flex-1 min-w-0 overflow-auto">{children}</main>
        </div>

        {/* Footer — full width, cố định */}
        <Footer />
      </div>
    </BoardProvider>
  )
}

function ZaloDisconnectedBanner({ hoursSincePing, onDismiss }: { hoursSincePing: number | null; onDismiss: () => void }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div className="bg-red-500 text-white shrink-0">
      <div className="px-4 py-2 flex items-center gap-2">
        <span className="text-sm font-medium flex-1 min-w-0">
          🔴 Zalo bị đăng xuất{hoursSincePing ? ` (${hoursSincePing} tiếng trước)` : ''} — tin nhắn không được thu thập
        </span>
        <button
          onClick={() => setExpanded(e => !e)}
          className="shrink-0 text-xs font-semibold bg-white/20 hover:bg-white/30 px-3 py-1 rounded-full transition-colors"
        >
          {expanded ? 'Ẩn' : 'Cách xử lý'}
        </button>
        <Link href="/dashboard/settings/channels" className="shrink-0 text-xs font-semibold bg-white/20 hover:bg-white/30 px-3 py-1 rounded-full transition-colors">
          Cài đặt →
        </Link>
        <button onClick={onDismiss} className="shrink-0 text-white/70 hover:text-white text-lg leading-none">×</button>
      </div>
      {expanded && (
        <div className="px-4 pb-3 text-xs space-y-1.5 bg-red-600/40">
          <p className="font-semibold pt-2">Cách đăng nhập lại Zalo:</p>
          <p>1. SSH vào máy chủ đang chạy OpenClaw</p>
          <p>2. Mở trình duyệt trên máy đó → vào <code className="bg-white/20 px-1 rounded">http://localhost:18789/__openclaw__/canvas/</code></p>
          <p>3. Scan QR bằng app Zalo trên điện thoại</p>
          <p className="text-white/70 pt-1">Hoặc dùng SSH tunnel: <code className="bg-white/20 px-1 rounded">ssh -L 18789:localhost:18789 user@server</code> → mở localhost:18789 trên máy tính của bạn</p>
        </div>
      )}
    </div>
  )
}

function IconHome(p: React.SVGProps<SVGSVGElement>)    { return <svg {...p} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/></svg> }
function IconDashboard(p: React.SVGProps<SVGSVGElement>) { return <svg {...p} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 5a1 1 0 011-1h4a1 1 0 011 1v5a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm10 0a1 1 0 011-1h4a1 1 0 011 1v2a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zm10-3a1 1 0 011-1h4a1 1 0 011 1v7a1 1 0 01-1 1h-4a1 1 0 01-1-1v-7z"/></svg> }
function IconChat(p: React.SVGProps<SVGSVGElement>)    { return <svg {...p} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg> }
function IconChart(p: React.SVGProps<SVGSVGElement>)   { return <svg {...p} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg> }
function IconSparkle(p: React.SVGProps<SVGSVGElement>) { return <svg {...p} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"/></svg> }
function IconSearch(p: React.SVGProps<SVGSVGElement>)  { return <svg {...p} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg> }
function IconUsers(p: React.SVGProps<SVGSVGElement>)   { return <svg {...p} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"/></svg> }
function IconKanban(p: React.SVGProps<SVGSVGElement>)  { return <svg {...p} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h7"/></svg> }
function IconWand(p: React.SVGProps<SVGSVGElement>)    { return <svg {...p} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 4V2m0 14v-2M8 9h2M20 9h2M17.8 11.8L19 13M15 9h0M17.8 6.2L19 5M3 21l9-9M12.2 6.2L11 5"/></svg> }
function IconTeam(p: React.SVGProps<SVGSVGElement>)    { return <svg {...p} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"/></svg> }
function IconExport(p: React.SVGProps<SVGSVGElement>)   { return <svg {...p} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg> }
function IconCalendar(p: React.SVGProps<SVGSVGElement>) { return <svg {...p} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg> }
function IconBell(p: React.SVGProps<SVGSVGElement>)    { return <svg {...p} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/></svg> }
function IconSettings(p: React.SVGProps<SVGSVGElement>){ return <svg {...p} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg> }
function IconChannel(p: React.SVGProps<SVGSVGElement>) { return <svg {...p} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/></svg> }
function ChevRight(p: React.SVGProps<SVGSVGElement>)   { return <svg {...p} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/></svg> }
