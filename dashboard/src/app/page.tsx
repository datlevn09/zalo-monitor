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
