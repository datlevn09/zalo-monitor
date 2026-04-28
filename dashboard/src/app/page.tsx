'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { getToken } from '@/lib/api'
import { ThemeToggle } from '@/components/ThemeToggle'
import { RemoteBanner } from '@/components/RemoteBanner'
import { useRemoteContent } from '@/lib/remote-content'

export default function LandingPage() {
  const [loggedIn, setLoggedIn] = useState(false)
  const { content: remoteContent } = useRemoteContent()

  // Default values
  const defaultBadge = 'Zalo · Telegram · Lark — gom về 1 nơi'
  const defaultHeadline = 'Quản lý tin nhắn'
  const defaultHeadlineAccent = 'bán hàng'
  const defaultSubheadline = 'Đừng mất thời gian lội từng group chat. Giờ đây tất cả tin nhắn Zalo, Telegram, Lark đổ về 1 nơi — AI tự phân loại cơ hội, khiếu nại, rủi ro để anh xử lý đúng người, đúng lúc.'
  const defaultFeatures = [
    {
      icon: '💬',
      title: 'Gom tin từ mọi nhóm',
      desc: 'Hàng chục nhóm Zalo / Telegram / Lark vào một bảng điều khiển — không sót tin khách.',
    },
    {
      icon: '🤖',
      title: 'AI phân tích hội thoại',
      desc: 'Tóm tắt, phân loại khách hàng và gợi ý hành động tự động.',
    },
    {
      icon: '🔔',
      title: 'Cảnh báo tức thời',
      desc: 'Nhận thông báo ngay khi có từ khoá quan trọng hoặc khách hàng cần hỗ trợ.',
    },
  ]

  // Apply remote overrides if available
  const badgeText = remoteContent?.landing?.badge || defaultBadge
  const headlineText = remoteContent?.landing?.headline || defaultHeadline
  const headlineAccentText = remoteContent?.landing?.headlineAccent || defaultHeadlineAccent
  const subheadlineText = remoteContent?.landing?.subheadline || defaultSubheadline
  const featuresData = remoteContent?.landing?.features || defaultFeatures

  useEffect(() => {
    setLoggedIn(!!getToken())
  }, [])

  return (
    <div className="min-h-[100dvh] bg-[#f2f2f7] dark:bg-zinc-950 text-gray-900 dark:text-zinc-100 flex flex-col">

      {/* ── Navbar ─────────────────────────────────────── */}
      <nav className="sticky top-0 z-50 bg-white/80 dark:bg-zinc-900/70 backdrop-blur-xl border-b border-gray-200/80 dark:border-white/10">
        <div className="max-w-5xl mx-auto px-4 md:px-6 h-14 flex items-center justify-between gap-4">
          {/* Logo */}
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white text-[10px] font-bold shadow-sm shadow-blue-500/30">
              ZM
            </div>
            <span className="font-semibold text-gray-900 dark:text-zinc-100 text-sm md:text-base">
              Zalo Monitor
            </span>
          </div>

          {/* Nav Links */}
          <div className="flex items-center gap-1">
            <Link
              href="/pricing"
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-white/10 rounded-xl transition-colors"
            >
              Bảng giá
            </Link>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Link
              href={loggedIn ? '/dashboard' : '/login'}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-white/10 rounded-xl transition-colors"
            >
              {loggedIn ? 'Dashboard →' : 'Đăng nhập'}
            </Link>
          </div>
        </div>
      </nav>

      {/* ── Remote Banner ──────────────────────────────── */}
      <RemoteBanner />

      {/* ── Hero ───────────────────────────────────────── */}
      <section className="flex-1 flex flex-col items-center justify-center text-center px-5 py-16 md:py-24">
        {/* Badge */}
        <div className="inline-flex items-center gap-2 px-3 py-1.5 mb-6 bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 text-xs font-semibold rounded-full border border-blue-200 dark:border-blue-500/30">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
          {badgeText}
        </div>

        {/* Headline */}
        <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold tracking-tight leading-[1.1] mb-5 max-w-3xl">
          {headlineText}{' '}
          <span className="bg-gradient-to-r from-blue-500 to-indigo-600 bg-clip-text text-transparent">
            {headlineAccentText}
          </span>
        </h1>

        {/* Subheadline */}
        <p className="text-lg md:text-xl text-gray-500 dark:text-zinc-400 max-w-xl mb-10 leading-relaxed">
          {subheadlineText}
        </p>

        {/* CTA Buttons */}
        <div className="flex flex-col sm:flex-row items-center gap-3">
          {loggedIn ? (
            <Link
              href="/dashboard"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-7 py-3.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold text-base rounded-2xl shadow-lg shadow-blue-500/25 transition-all hover:shadow-blue-500/40 hover:-translate-y-0.5"
            >
              Vào Dashboard
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
              </svg>
            </Link>
          ) : (
            <>
              <Link
                href="/register"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-7 py-3.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold text-base rounded-2xl shadow-lg shadow-blue-500/25 transition-all hover:shadow-blue-500/40 hover:-translate-y-0.5"
              >
                Đăng ký dùng thử
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                </svg>
              </Link>
              <Link
                href="/login"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-7 py-3.5 bg-white dark:bg-white/10 hover:bg-gray-50 dark:hover:bg-white/15 text-blue-600 dark:text-blue-400 font-semibold text-base border border-gray-200 dark:border-white/10 rounded-2xl transition-all"
              >
                Đăng nhập
              </Link>
            </>
          )}
        </div>
      </section>

      {/* ── Feature highlights ─────────────────────────── */}
      <section className="max-w-5xl mx-auto w-full px-4 md:px-6 pb-12 md:pb-16">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4">
          {featuresData.map(f => (
            <div
              key={f.title}
              className="bg-white dark:bg-zinc-900 dark:ring-1 dark:ring-white/5 rounded-2xl border border-gray-200 dark:border-white/10 p-5 shadow-sm"
            >
              <div className="text-3xl mb-3">{f.icon}</div>
              <h3 className="font-semibold text-gray-900 dark:text-zinc-100 mb-1.5">{f.title}</h3>
              <p className="text-sm text-gray-500 dark:text-zinc-400 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Showcases — minh hoạ từng tính năng ────────────── */}
      <section className="max-w-5xl mx-auto w-full px-4 md:px-6 pb-12 md:pb-16 space-y-12">
        {/* Showcase 1: Inbox gom nhiều kênh */}
        <ShowcaseUnifiedInbox />

        {/* Showcase 2: AI phân loại tin nhắn */}
        <ShowcaseAIClassify />

        {/* Showcase 3: Pipeline khách hàng + cảnh báo */}
        <ShowcasePipelineAlert />
      </section>

      {/* ── Ad placeholder ─────────────────────────────── */}
      {/* TODO: Replace with actual ad component when ready */}
      {/* <section className="max-w-5xl mx-auto w-full px-4 pb-8">
        <div className="h-24 bg-gray-100 dark:bg-zinc-900 rounded-2xl border border-dashed border-gray-300 dark:border-white/10 flex items-center justify-center text-gray-400 text-sm">
          Advertisement
        </div>
      </section> */}

      {/* ── Footer ─────────────────────────────────────── */}
      <footer className="border-t border-gray-200 dark:border-white/10 bg-white/60 dark:bg-zinc-900/40">
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-gray-400 dark:text-zinc-500">
          <span>© 2025 Zalo Monitor by <a href="https://datthongdong.com" className="hover:text-gray-600 dark:hover:text-zinc-300 transition-colors font-medium">dat.thong.dong</a></span>
          <div className="flex items-center gap-4">
            <Link href="/privacy" className="hover:text-gray-600 dark:hover:text-zinc-300 transition-colors">Chính sách</Link>
            <Link href="/terms" className="hover:text-gray-600 dark:hover:text-zinc-300 transition-colors">Điều khoản</Link>
            <Link href="/login" className="hover:text-gray-600 dark:hover:text-zinc-300 transition-colors">Đăng nhập</Link>
          </div>
        </div>
      </footer>

    </div>
  )
}

/* ──────────────────────────────────────────────────────────────────────
   SHOWCASE COMPONENTS — minh hoạ tính năng bằng CSS thuần (không dùng ảnh)
   ────────────────────────────────────────────────────────────────────── */

function ShowcaseUnifiedInbox() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
      <div className="order-2 md:order-1">
        <span className="inline-flex px-2.5 py-1 text-[11px] font-semibold text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-500/20 rounded-full mb-3">
          📥 Inbox đa kênh
        </span>
        <h2 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-zinc-100 tracking-tight mb-3">
          Tất cả tin nhắn về <span className="text-blue-600 dark:text-blue-400">1 nơi</span>
        </h2>
        <p className="text-gray-600 dark:text-zinc-400 leading-relaxed">
          Đừng nhảy giữa Zalo, Telegram, Lark cả ngày. Mỗi tin nhắn từ khách — dù ở đâu — đều xuất hiện trên dashboard với label rõ ràng. Không bỏ sót, không trễ.
        </p>
      </div>
      <div className="order-1 md:order-2 bg-white dark:bg-zinc-900 dark:ring-1 dark:ring-white/5 rounded-3xl shadow-xl p-4 border border-gray-200 dark:border-white/10">
        <div className="space-y-2">
          {[
            { ch: 'Z', tint: 'from-blue-400 to-blue-600', name: 'Nguyễn Văn An', msg: 'Em hỏi giá căn 2PN view sông', time: '2 phút', tag: '💰 Cơ hội', tagColor: 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-300' },
            { ch: 'T', tint: 'from-sky-400 to-cyan-500', name: 'Lê Hồng', msg: 'Sao lâu vậy chưa được phản hồi 😡', time: '5 phút', tag: '🚨 Khiếu nại', tagColor: 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300' },
            { ch: 'L', tint: 'from-purple-400 to-pink-500', name: 'Sales Team #5', msg: 'Đã chuyển báo giá cho khách', time: '12 phút', tag: '👍 Tích cực', tagColor: 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300' },
            { ch: 'Z', tint: 'from-blue-400 to-blue-600', name: 'Trần Mai', msg: 'Gửi link xem nhà 5h chiều nha', time: '20 phút', tag: '💬 Bình thường', tagColor: 'bg-gray-100 text-gray-700 dark:bg-white/10 dark:text-zinc-300' },
          ].map((m, i) => (
            <div key={i} className="flex items-start gap-3 p-2.5 rounded-xl hover:bg-gray-50 dark:hover:bg-white/5 transition-colors">
              <div className={`w-9 h-9 rounded-full bg-gradient-to-br ${m.tint} flex items-center justify-center text-white text-xs font-bold shrink-0`}>{m.ch}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-sm font-semibold text-gray-900 dark:text-zinc-100 truncate">{m.name}</p>
                  <p className="text-[10px] text-gray-400 dark:text-zinc-500 shrink-0">{m.time}</p>
                </div>
                <p className="text-xs text-gray-600 dark:text-zinc-400 truncate">{m.msg}</p>
                <span className={`inline-block mt-1 px-1.5 py-0.5 text-[10px] font-medium rounded ${m.tagColor}`}>{m.tag}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function ShowcaseAIClassify() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
      <div className="bg-white dark:bg-zinc-900 dark:ring-1 dark:ring-white/5 rounded-3xl shadow-xl p-6 border border-gray-200 dark:border-white/10">
        {/* Donut chart minh hoạ */}
        <div className="flex items-center gap-6">
          <div className="relative w-32 h-32 shrink-0">
            <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
              <circle cx="18" cy="18" r="15.915" fill="none" stroke="#e5e7eb" strokeWidth="3.5" className="dark:stroke-white/10" />
              <circle cx="18" cy="18" r="15.915" fill="none" stroke="#34c759" strokeWidth="3.5" strokeDasharray="38 100" strokeLinecap="round" />
              <circle cx="18" cy="18" r="15.915" fill="none" stroke="#5ac8fa" strokeWidth="3.5" strokeDasharray="22 100" strokeDashoffset="-38" strokeLinecap="round" />
              <circle cx="18" cy="18" r="15.915" fill="none" stroke="#ff3b30" strokeWidth="3.5" strokeDasharray="12 100" strokeDashoffset="-60" strokeLinecap="round" />
              <circle cx="18" cy="18" r="15.915" fill="none" stroke="#ff9500" strokeWidth="3.5" strokeDasharray="8 100" strokeDashoffset="-72" strokeLinecap="round" />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-bold text-gray-900 dark:text-zinc-100">847</span>
              <span className="text-[10px] text-gray-500 dark:text-zinc-400">tin / tuần</span>
            </div>
          </div>
          <div className="flex-1 space-y-1.5 text-xs">
            {[
              ['💰 Cơ hội', 38, '#34c759'],
              ['👍 Tích cực', 22, '#5ac8fa'],
              ['🚨 Khiếu nại', 12, '#ff3b30'],
              ['⚠️ Rủi ro', 8, '#ff9500'],
              ['💬 Bình thường', 20, '#9ca3af'],
            ].map(([label, pct, color]) => (
              <div key={label as string} className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color as string }} />
                <span className="flex-1 text-gray-700 dark:text-zinc-300">{label}</span>
                <span className="tabular-nums font-semibold text-gray-900 dark:text-zinc-100">{pct}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div>
        <span className="inline-flex px-2.5 py-1 text-[11px] font-semibold text-purple-700 dark:text-purple-300 bg-purple-100 dark:bg-purple-500/20 rounded-full mb-3">
          🤖 AI tự phân loại
        </span>
        <h2 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-zinc-100 tracking-tight mb-3">
          Biết ngay <span className="text-purple-600 dark:text-purple-400">cơ hội</span> & <span className="text-red-500">khiếu nại</span>
        </h2>
        <p className="text-gray-600 dark:text-zinc-400 leading-relaxed">
          AI đọc từng tin và gán nhãn tự động: <strong>cơ hội bán hàng</strong>, <strong>khiếu nại</strong>, <strong>rủi ro</strong>, <strong>tích cực</strong>. Anh xem báo cáo theo tuần / tháng / quý để biết xu hướng — không cần lội từng group.
        </p>
      </div>
    </div>
  )
}

function ShowcasePipelineAlert() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
      <div className="order-2 md:order-1">
        <span className="inline-flex px-2.5 py-1 text-[11px] font-semibold text-orange-700 dark:text-orange-300 bg-orange-100 dark:bg-orange-500/20 rounded-full mb-3">
          🔔 Cảnh báo + Pipeline
        </span>
        <h2 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-zinc-100 tracking-tight mb-3">
          Không bỏ sót <span className="text-orange-600 dark:text-orange-400">khách quan trọng</span>
        </h2>
        <p className="text-gray-600 dark:text-zinc-400 leading-relaxed">
          Khi có tin khẩn (khiếu nại, hỏi giá, doạ huỷ deal) — anh nhận thông báo ngay qua Zalo / Telegram / Email. Pipeline Kanban cho thấy mỗi khách đang ở giai đoạn nào để chốt sớm.
        </p>
      </div>
      <div className="order-1 md:order-2 bg-white dark:bg-zinc-900 dark:ring-1 dark:ring-white/5 rounded-3xl shadow-xl p-4 border border-gray-200 dark:border-white/10">
        {/* Pipeline kanban minh hoạ */}
        <div className="grid grid-cols-3 gap-2">
          {[
            { col: 'Mới', color: 'bg-gray-100 dark:bg-white/10', count: 12, items: ['Anh Nam — căn 2PN', 'Chị Hà — góp 30%'] },
            { col: 'Đàm phán', color: 'bg-blue-100 dark:bg-blue-500/20', count: 5, items: ['Đỗ Khang — view sông', 'L. Trang — gửi BG'] },
            { col: 'Đã chốt', color: 'bg-green-100 dark:bg-green-500/20', count: 3, items: ['M. Hoa — 1.8 tỷ ✓', 'T. An — đặt cọc'] },
          ].map((c) => (
            <div key={c.col} className={`${c.color} rounded-xl p-2.5`}>
              <div className="flex items-center justify-between mb-2">
                <p className="text-[11px] font-semibold text-gray-700 dark:text-zinc-200">{c.col}</p>
                <span className="text-[10px] text-gray-500 dark:text-zinc-400 tabular-nums bg-white dark:bg-zinc-900 px-1.5 rounded-full">{c.count}</span>
              </div>
              <div className="space-y-1.5">
                {c.items.map((it, i) => (
                  <div key={i} className="bg-white dark:bg-zinc-900 rounded-md px-2 py-1.5 text-[11px] text-gray-700 dark:text-zinc-300 shadow-sm">{it}</div>
                ))}
              </div>
            </div>
          ))}
        </div>
        {/* Toast cảnh báo */}
        <div className="mt-3 flex items-start gap-2 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-lg p-2.5">
          <span className="text-base shrink-0">🚨</span>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-red-700 dark:text-red-300">Khiếu nại — VIP customer</p>
            <p className="text-[11px] text-red-600 dark:text-red-400 truncate">"Sao lâu vậy chưa được phản hồi" — 2 phút trước</p>
          </div>
        </div>
      </div>
    </div>
  )
}
