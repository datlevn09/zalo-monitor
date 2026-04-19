'use client'

import Link from 'next/link'
import { ThemeToggleCompact } from './ThemeToggle'

const ZALO  = 'https://zalo.me/0869999664'
const TELE  = 'https://t.me/Datlevn09'
const FB    = 'https://fb.com/dat.thong.dong'
const EMAIL = 'mailto:datle@outlook.com'
const WEB   = 'https://datthongdong.com'

export function Footer() {
  return (
    <footer className="shrink-0 px-3 md:px-4 py-2 border-t border-gray-200 dark:border-white/10 bg-white/80 dark:bg-zinc-900/70 backdrop-blur-xl">
      <div className="max-w-7xl mx-auto flex flex-col gap-2 items-center md:flex-row md:justify-between">
        {/* Contact row */}
        <div className="flex items-center gap-1.5 flex-wrap justify-center">
          <Pill href={ZALO}  tint="bg-blue-500 hover:bg-blue-600"                icon="Z"  title="Nhắn Zalo 0869999664">Zalo</Pill>
          <Pill href={TELE}  tint="bg-sky-500 hover:bg-sky-600"                  icon="✈️" title="Telegram @Datlevn09">Tele</Pill>
          <Pill href={FB}    tint="bg-[#1877F2] hover:bg-[#0f67d4]"              icon="f"  title="fb.com/dat.thong.dong">FB</Pill>
          <Pill href={EMAIL} tint="bg-gray-600 hover:bg-gray-700"                icon="✉️" title="datle@outlook.com">Email</Pill>
          <Pill href={WEB}   tint="bg-gradient-to-br from-indigo-500 to-purple-600 hover:opacity-90" icon="🌐" title="datthongdong.com">Web</Pill>
          <span className="mx-1 w-px h-4 bg-gray-200 dark:bg-white/10" />
          <ThemeToggleCompact />
        </div>

        {/* Credit */}
        <p className="text-[10px] text-gray-400 dark:text-zinc-500 text-center md:text-right">
          © {new Date().getFullYear()}{' '}
          <Link href={WEB} target="_blank" rel="noopener noreferrer" className="hover:underline font-medium text-gray-500 dark:text-zinc-400">
            @dat.thong.dong
          </Link>
          {' · '}
          <a href="tel:0869999664" className="tabular-nums hover:underline">0869.999.664</a>
        </p>
      </div>
    </footer>
  )
}

function Pill({
  href, tint, icon, title, children,
}: { href: string; tint: string; icon: string; title: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={title}
      className={`inline-flex items-center gap-1 px-2 py-1 ${tint} text-white text-[11px] font-medium rounded-full transition-all`}
    >
      <span className="leading-none text-[10px]">{icon}</span>
      <span className="leading-none">{children}</span>
    </a>
  )
}
