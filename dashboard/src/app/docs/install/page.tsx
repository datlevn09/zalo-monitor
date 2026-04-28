'use client'

import Link from 'next/link'

export default function InstallIndexPage() {
  return (
    <div className="min-h-[100dvh] bg-[#f2f2f7] dark:bg-zinc-950 text-gray-900 dark:text-zinc-100 flex flex-col">
      <div className="bg-white dark:bg-zinc-900 border-b border-gray-200 dark:border-white/10">
        <div className="max-w-3xl mx-auto px-4 md:px-6 py-4">
          <Link href="/dashboard/settings/channels" className="inline-flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400 hover:underline mb-4">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Quay lại Cài đặt
          </Link>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Hướng dẫn cài đặt</h1>
          <p className="text-sm text-gray-500 dark:text-zinc-400 mt-1">
            Chọn loại máy anh đang có để xem hướng dẫn step-by-step.
          </p>
        </div>
      </div>

      <div className="flex-1 max-w-3xl mx-auto w-full px-4 md:px-6 py-8 space-y-3">
        <Option
          href="/docs/install-windows"
          icon="🪟"
          title="Windows (PC, mini PC, Server)"
          desc="Phổ biến nhất — máy bàn / mini PC ở văn phòng. Ưu tiên cách này nếu anh không rành kỹ thuật."
          tag="Cho non-tech"
          tagColor="bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-300"
        />
        <Option
          href="/docs/install-mac"
          icon="🍎"
          title="macOS"
          desc="MacBook / Mac mini. Cài qua Homebrew + Terminal."
          tag="Có Terminal"
          tagColor="bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300"
        />
        <Option
          href="/docs/install-vps"
          icon="☁️"
          title="VPS / Cloud Server (Linux)"
          desc="Ubuntu / CentOS / Debian. Chạy 24/7 trên cloud — ổn định nhất, ko phụ thuộc máy nhà."
          tag="Đề xuất production"
          tagColor="bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-300"
        />
        <Option
          href="/docs/install-nas"
          icon="📦"
          title="NAS Synology / Docker"
          desc="NAS Synology hoặc bất kỳ máy có Docker. 1 container, mount volume bảo lưu session."
          tag="Self-host"
          tagColor="bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300"
        />

        <div className="mt-6 bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/30 rounded-xl p-4 text-sm text-blue-800 dark:text-blue-300 leading-relaxed">
          <p className="font-semibold mb-1">💡 Anh nên chọn loại nào?</p>
          <ul className="space-y-0.5 list-disc list-inside text-[13px]">
            <li>Có máy Windows ở nhà/văn phòng bật 24/7 → <strong>Windows</strong></li>
            <li>Có MacBook/Mac mini bật 24/7 → <strong>macOS</strong></li>
            <li>Muốn ổn định nhất, không phụ thuộc máy nhà → thuê <strong>VPS</strong> 100k/tháng</li>
            <li>Có sẵn NAS/Docker → <strong>Docker</strong></li>
          </ul>
        </div>
      </div>
    </div>
  )
}

function Option({
  href,
  icon,
  title,
  desc,
  tag,
  tagColor,
}: { href: string; icon: string; title: string; desc: string; tag: string; tagColor: string }) {
  return (
    <Link
      href={href}
      className="block bg-white dark:bg-zinc-900 dark:ring-1 dark:ring-white/5 rounded-xl p-5 hover:shadow-md transition-all border border-gray-200 dark:border-white/10 group"
    >
      <div className="flex items-start gap-4">
        <div className="text-3xl shrink-0">{icon}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <h3 className="font-bold text-gray-900 dark:text-zinc-100">{title}</h3>
            <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold ${tagColor}`}>{tag}</span>
          </div>
          <p className="text-sm text-gray-600 dark:text-zinc-400 leading-relaxed">{desc}</p>
        </div>
        <svg className="w-5 h-5 text-gray-300 dark:text-zinc-600 group-hover:text-blue-500 transition-colors mt-2" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/>
        </svg>
      </div>
    </Link>
  )
}
