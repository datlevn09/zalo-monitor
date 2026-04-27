'use client'

import Link from 'next/link'
import { useState } from 'react'
import { ThemeToggle } from '@/components/ThemeToggle'

interface Plan {
  key: string
  name: string
  emoji: string
  tagline: string
  monthlyPrice: number | null
  highlight: boolean
  available: boolean
  color: string
  badge: string | null
  features: string[]
  missing: string[]
}

const PLANS: Plan[] = [
  {
    key: 'free',
    name: 'Free',
    emoji: '🆓',
    tagline: 'Thử nghiệm không giới hạn thời gian',
    monthlyPrice: 0,
    highlight: false,
    available: true,
    color: 'border-gray-200 dark:border-white/10',
    badge: null,
    features: [
      '10 nhóm Zalo theo dõi',
      '5.000 tin nhắn/tháng',
      '1 người xem board',
      'Sync 50 tin lịch sử/nhóm',
      'AI phân loại cơ bản',
      'Dashboard realtime',
    ],
    missing: [
      'CRM khách hàng',
      'Pipeline bán hàng',
      'Lịch hẹn',
      'Xuất báo cáo',
    ],
  },
  {
    key: 'starter',
    name: 'Starter',
    emoji: '🌱',
    tagline: 'Cho team nhỏ bắt đầu',
    monthlyPrice: null,
    highlight: false,
    available: false,
    color: 'border-green-300 dark:border-green-500/30',
    badge: null,
    features: [
      '20 nhóm Zalo theo dõi',
      '15.000 tin nhắn/tháng',
      '3 người xem board',
      'Sync 100 tin lịch sử/nhóm',
      'AI phân tích đầy đủ',
      'CRM khách hàng',
      'Pipeline bán hàng',
    ],
    missing: [
      'Lịch hẹn',
      'Xuất báo cáo',
    ],
  },
  {
    key: 'basic',
    name: 'Basic',
    emoji: '📦',
    tagline: 'Cho sales team chuyên nghiệp',
    monthlyPrice: null,
    highlight: true,
    available: false,
    color: 'border-blue-400 dark:border-blue-500/50',
    badge: 'Phổ biến',
    features: [
      '50 nhóm Zalo theo dõi',
      '50.000 tin nhắn/tháng',
      '10 người xem board',
      'Sync 500 tin lịch sử/nhóm',
      'AI phân tích đầy đủ',
      'CRM + Pipeline + Lịch hẹn',
      'Xuất báo cáo CSV',
      'Alert rules tự động',
    ],
    missing: [],
  },
  {
    key: 'pro',
    name: 'Pro',
    emoji: '🚀',
    tagline: 'Cho doanh nghiệp phát triển',
    monthlyPrice: null,
    highlight: false,
    available: false,
    color: 'border-purple-400 dark:border-purple-500/50',
    badge: null,
    features: [
      '150 nhóm Zalo theo dõi',
      '200.000 tin nhắn/tháng',
      '30 người xem board',
      'Sync 1.000 tin lịch sử/nhóm',
      'Tất cả tính năng Basic',
      'Phân tích nâng cao',
      'Multi-kênh (Zalo + Telegram + Lark)',
      'Ưu tiên hỗ trợ',
    ],
    missing: [],
  },
  {
    key: 'business',
    name: 'Business',
    emoji: '🏢',
    tagline: 'Cho công ty lớn',
    monthlyPrice: null,
    highlight: false,
    available: false,
    color: 'border-orange-400 dark:border-orange-500/50',
    badge: null,
    features: [
      '500 nhóm Zalo theo dõi',
      '500.000 tin nhắn/tháng',
      '50 người xem board',
      'Sync 5.000 tin lịch sử/nhóm',
      'Tất cả tính năng Pro',
      'Dedicated support',
      'SLA cam kết uptime',
    ],
    missing: [],
  },
  {
    key: 'enterprise',
    name: 'Enterprise',
    emoji: '♾️',
    tagline: 'Tuỳ chỉnh theo nhu cầu',
    monthlyPrice: null,
    highlight: false,
    available: false,
    color: 'border-yellow-400 dark:border-yellow-500/50',
    badge: 'Custom',
    features: [
      'Không giới hạn nhóm',
      'Không giới hạn tin nhắn',
      'Không giới hạn board viewers',
      'Sync toàn bộ lịch sử',
      'Tất cả tính năng Business',
      'On-premise / self-hosted',
      'Tích hợp API riêng',
      'Hỗ trợ 24/7',
    ],
    missing: [],
  },
]

function PricingCard({ plan, isYearly }: { plan: Plan; isYearly: boolean }) {
  const yearlyPrice = plan.monthlyPrice ? Math.floor(plan.monthlyPrice * 12 * 0.8) : null
  const monthlyEquivalent = yearlyPrice ? Math.ceil(yearlyPrice / 12) : null

  return (
    <div
      className={`relative group rounded-3xl border-2 transition-all duration-300 overflow-hidden ${plan.highlight ? 'scale-105 shadow-2xl ring-2 ring-blue-500/20 border-blue-500 dark:border-blue-400' : 'shadow-lg hover:shadow-xl hover:scale-102'} ${plan.color} bg-white dark:bg-zinc-900/60`}
    >
      {/* Highlight glow effect */}
      {plan.highlight && (
        <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-transparent pointer-events-none" />
      )}

      {/* Badge */}
      {plan.badge && (
        <div className="absolute top-0 right-0 -translate-y-1/2 translate-x-1/2 z-10">
          <div className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-gradient-to-r from-blue-500 to-blue-600 text-white text-xs font-bold rounded-full shadow-lg">
            {plan.badge}
          </div>
        </div>
      )}

      <div className="p-6 md:p-8 h-full flex flex-col">
        {/* Header */}
        <div className="mb-6">
          <div className="text-4xl mb-3">{plan.emoji}</div>
          <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">{plan.name}</h3>
          <p className="text-sm text-gray-500 dark:text-zinc-400">{plan.tagline}</p>
        </div>

        {/* Price */}
        <div className="mb-6 pb-6 border-b border-gray-200 dark:border-white/10">
          {plan.key === 'enterprise' ? (
            <div className="text-center">
              <p className="text-lg font-semibold text-gray-900 dark:text-white">Liên hệ để báo giá</p>
            </div>
          ) : plan.monthlyPrice === 0 ? (
            <div className="text-center">
              <p className="text-3xl font-bold text-green-600 dark:text-green-400">Miễn phí</p>
              <p className="text-xs text-gray-500 dark:text-zinc-400 mt-1">Mãi mãi</p>
            </div>
          ) : (
            <div className="text-center">
              <p className="text-xs text-gray-500 dark:text-zinc-400 mb-2">
                {isYearly ? 'Giá theo năm' : 'Giá theo tháng'}
              </p>
              <p className="text-4xl font-bold text-gray-900 dark:text-white">
                Sắp ra mắt
              </p>
              {isYearly && (
                <p className="text-xs text-gray-500 dark:text-zinc-400 mt-2">
                  Tiết kiệm 20% so với giá hàng tháng
                </p>
              )}
            </div>
          )}
        </div>

        {/* CTA Button */}
        <div className="mb-6">
          {plan.key === 'free' ? (
            <Link
              href="/register"
              className="w-full inline-flex items-center justify-center px-4 py-3 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold text-sm rounded-xl transition-all shadow-sm hover:shadow-md"
            >
              Đăng ký miễn phí
            </Link>
          ) : plan.key === 'enterprise' ? (
            <a
              href="mailto:hello@datthongdong.com"
              className="w-full inline-flex items-center justify-center px-4 py-3 bg-yellow-500 hover:bg-yellow-600 active:bg-yellow-700 text-gray-900 font-semibold text-sm rounded-xl transition-all shadow-sm hover:shadow-md"
            >
              Liên hệ ngay
            </a>
          ) : (
            <button
              disabled
              className="w-full inline-flex items-center justify-center px-4 py-3 border-2 border-gray-300 dark:border-white/20 text-gray-600 dark:text-zinc-400 font-semibold text-sm rounded-xl transition-all cursor-not-allowed opacity-60"
            >
              Sắp ra mắt
            </button>
          )}
        </div>

        {/* Features */}
        <div className="flex-1 space-y-3">
          {/* Included features */}
          {plan.features.length > 0 && (
            <div className="space-y-2">
              {plan.features.map((feature, idx) => (
                <div key={idx} className="flex items-start gap-3">
                  <span className="text-green-500 dark:text-green-400 font-bold text-lg leading-none mt-0.5 flex-shrink-0">
                    ✓
                  </span>
                  <span className="text-sm text-gray-700 dark:text-zinc-300">{feature}</span>
                </div>
              ))}
            </div>
          )}

          {/* Missing features */}
          {plan.missing.length > 0 && (
            <div className="space-y-2 pt-2">
              {plan.missing.map((feature, idx) => (
                <div key={idx} className="flex items-start gap-3 opacity-50">
                  <span className="text-gray-300 dark:text-zinc-600 font-bold text-lg leading-none mt-0.5 flex-shrink-0">
                    ×
                  </span>
                  <span className="text-sm text-gray-500 dark:text-zinc-400">{feature}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function PricingPage() {
  const [isYearly, setIsYearly] = useState(false)

  return (
    <div className="min-h-[100dvh] bg-[#f2f2f7] dark:bg-zinc-950 text-gray-900 dark:text-zinc-100 flex flex-col">
      {/* ── Navbar ─────────────────────────────────────── */}
      <nav className="sticky top-0 z-50 bg-white/80 dark:bg-zinc-900/70 backdrop-blur-xl border-b border-gray-200/80 dark:border-white/10">
        <div className="max-w-7xl mx-auto px-4 md:px-6 h-14 flex items-center justify-between gap-4">
          {/* Logo & Links */}
          <div className="flex items-center gap-6">
            <Link href="/" className="flex items-center gap-2.5 group">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white text-sm font-bold shadow-sm shadow-blue-500/30 group-hover:shadow-blue-500/50 transition-all">
                Z
              </div>
              <span className="font-semibold text-gray-900 dark:text-zinc-100 text-sm md:text-base hidden sm:inline">
                Zalo Monitor
              </span>
            </Link>
            <span className="text-lg font-semibold text-gray-400 dark:text-zinc-600">Bảng giá</span>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Link
              href="/login"
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-white/10 rounded-xl transition-colors"
            >
              Đăng nhập
            </Link>
          </div>
        </div>
      </nav>

      {/* ── Hero Section ──────────────────────────────── */}
      <section className="max-w-7xl mx-auto w-full px-4 md:px-6 py-12 md:py-16 text-center">
        {/* Badge */}
        <div className="inline-flex items-center gap-2 px-3 py-1.5 mb-6 bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 text-xs font-semibold rounded-full border border-blue-200 dark:border-blue-500/30">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
          Bảng giá dành cho bạn
        </div>

        {/* Headline */}
        <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.1] mb-4 max-w-3xl mx-auto">
          Chọn gói phù hợp
        </h1>

        {/* Subheadline */}
        <p className="text-lg md:text-xl text-gray-500 dark:text-zinc-400 max-w-2xl mx-auto mb-8 leading-relaxed">
          Hiện đang thử nghiệm — tất cả tính năng miễn phí. Giá chính thức sẽ được công bố sớm.
        </p>

        {/* Toggle */}
        <div className="flex items-center justify-center gap-3 mb-12">
          <button
            onClick={() => setIsYearly(false)}
            className={`px-5 py-2.5 font-semibold text-sm rounded-lg transition-all ${
              !isYearly
                ? 'bg-white dark:bg-white/10 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-600 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            Theo tháng
          </button>
          <button
            onClick={() => setIsYearly(true)}
            className={`relative px-5 py-2.5 font-semibold text-sm rounded-lg transition-all ${
              isYearly
                ? 'bg-white dark:bg-white/10 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-600 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            Theo năm
            {isYearly && (
              <span className="absolute -top-2 -right-2 inline-flex items-center gap-1 px-2 py-0.5 bg-gradient-to-r from-orange-500 to-orange-600 text-white text-xs font-bold rounded-full whitespace-nowrap">
                🏷️ -20%
              </span>
            )}
          </button>
        </div>
      </section>

      {/* ── Pricing Cards Grid ────────────────────────── */}
      <section className="flex-1 max-w-7xl mx-auto w-full px-4 md:px-6 pb-12">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
          {PLANS.map((plan) => (
            <PricingCard key={plan.key} plan={plan} isYearly={isYearly} />
          ))}
        </div>
      </section>

      {/* ── Footer Note ────────────────────────────────── */}
      <section className="max-w-7xl mx-auto w-full px-4 md:px-6 py-8 border-t border-gray-200 dark:border-white/10">
        <div className="text-center text-sm text-gray-600 dark:text-zinc-400">
          <p className="mb-2">
            <strong className="text-gray-900 dark:text-white">Giá chính thức sẽ được công bố sớm.</strong>
          </p>
          <p>
            Người đăng ký sớm sẽ được ưu đãi giảm giá đặc biệt.{' '}
            <Link
              href="/register"
              className="text-blue-600 dark:text-blue-400 hover:underline font-medium"
            >
              Đăng ký ngay →
            </Link>
          </p>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────── */}
      <footer className="border-t border-gray-200 dark:border-white/10 bg-white/60 dark:bg-zinc-900/40">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-gray-400 dark:text-zinc-500">
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
