'use client'

import Link from 'next/link'
import { ThemeToggleCompact } from './ThemeToggle'

const WEB = 'https://datthongdong.com'

export function Footer() {
  return (
    <footer className="shrink-0 px-3 md:px-4 py-2 border-t border-gray-200 dark:border-white/10 bg-white/80 dark:bg-zinc-900/70 backdrop-blur-xl">
      <div className="max-w-7xl mx-auto flex flex-col gap-2 items-center md:flex-row md:justify-between">
        {/* Credit */}
        <p className="text-[10px] text-gray-400 dark:text-zinc-500 text-center md:text-left">
          © {new Date().getFullYear()}{' '}
          <Link href={WEB} target="_blank" rel="noopener noreferrer" className="hover:underline font-medium text-gray-500 dark:text-zinc-400">
            @dat.thong.dong
          </Link>
        </p>

        {/* Links + theme */}
        <div className="flex items-center gap-3 flex-wrap justify-center text-[10px] text-gray-400 dark:text-zinc-500">
          <Link href="/contact" className="hover:underline font-medium text-gray-500 dark:text-zinc-400">
            Liên hệ
          </Link>
          <span className="text-gray-300 dark:text-zinc-600">·</span>
          <Link href="/privacy" className="hover:underline font-medium text-gray-500 dark:text-zinc-400">
            Bảo mật
          </Link>
          <span className="text-gray-300 dark:text-zinc-600">·</span>
          <Link href="/terms" className="hover:underline font-medium text-gray-500 dark:text-zinc-400">
            Điều khoản
          </Link>
          <span className="mx-1 w-px h-4 bg-gray-200 dark:bg-white/10" />
          <ThemeToggleCompact />
        </div>
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
