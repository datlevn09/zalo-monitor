import Link from 'next/link'

export function Header({ right }: { right?: React.ReactNode }) {
  return (
    <header className="shrink-0 z-40 bg-white/80 dark:bg-zinc-900/70 backdrop-blur-xl border-b border-gray-200 dark:border-white/10">
      <div className="max-w-7xl mx-auto px-3 md:px-4 py-2 flex items-center gap-2.5">
        <Link href="/dashboard" className="w-8 h-8 rounded-xl shadow-sm shadow-blue-500/30 shrink-0 overflow-hidden">
          <img src="/logo.png" alt="Zalo Monitor" className="w-full h-full object-cover" />
        </Link>
        <div className="min-w-0 flex-1 leading-tight">
          <p className="text-sm font-semibold text-gray-900 dark:text-zinc-100 truncate">
            Zalo Monitor <sup className="text-[8px] font-semibold text-blue-500 ml-0.5 align-top">beta</sup>
          </p>
          <p className="text-[10px] text-gray-500 dark:text-zinc-400 truncate">
            by{' '}
            <Link
              href="https://datthongdong.com"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:underline font-medium"
            >
              @dat.thong.dong
            </Link>
          </p>
        </div>
        {right && <div className="flex items-center gap-1.5 shrink-0">{right}</div>}
      </div>
    </header>
  )
}
