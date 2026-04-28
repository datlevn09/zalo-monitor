'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'

export function GuideShell({ icon, title, subtitle, children }: { icon: string; title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="min-h-[100dvh] bg-[#f2f2f7] dark:bg-zinc-950 text-gray-900 dark:text-zinc-100 flex flex-col">
      <div className="bg-white dark:bg-zinc-900 border-b border-gray-200 dark:border-white/10">
        <div className="max-w-3xl mx-auto px-4 md:px-6 py-4">
          <Link href="/docs/install" className="inline-flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400 hover:underline mb-4">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Đổi platform khác
          </Link>
          <div className="flex items-center gap-3">
            <span className="text-3xl">{icon}</span>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight">{title}</h1>
              <p className="text-sm text-gray-500 dark:text-zinc-400 mt-1">{subtitle}</p>
            </div>
          </div>
        </div>
      </div>
      <div className="flex-1 max-w-3xl mx-auto w-full px-4 md:px-6 py-8 space-y-6">{children}</div>
    </div>
  )
}

export function Card({ children }: { children: ReactNode }) {
  return <div className="bg-white dark:bg-zinc-900 dark:ring-1 dark:ring-white/5 rounded-xl p-5 md:p-6">{children}</div>
}

export function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <div className="bg-white dark:bg-zinc-900 dark:ring-1 dark:ring-white/5 rounded-xl p-5 md:p-6">
      <div className="flex items-start gap-3 mb-3">
        <div className="flex-shrink-0 w-9 h-9 rounded-full bg-blue-500 text-white font-bold flex items-center justify-center">{n}</div>
        <h2 className="text-lg font-bold text-gray-900 dark:text-zinc-100 mt-1">{title}</h2>
      </div>
      <div className="ml-0 md:ml-12 space-y-2">{children}</div>
    </div>
  )
}

export function Note({ tint, children }: { tint: 'blue' | 'green' | 'amber' | 'red'; children: ReactNode }) {
  const map = {
    blue: 'bg-blue-50 dark:bg-blue-500/10 border-blue-200 dark:border-blue-500/30 text-blue-800 dark:text-blue-300',
    green: 'bg-green-50 dark:bg-green-500/10 border-green-200 dark:border-green-500/30 text-green-800 dark:text-green-300',
    amber: 'bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/30 text-amber-800 dark:text-amber-300',
    red: 'bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/30 text-red-800 dark:text-red-300',
  }
  return <div className={`mt-3 px-3 py-2.5 border rounded-lg text-sm leading-relaxed ${map[tint]}`}>{children}</div>
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="inline-flex items-center px-1.5 py-0.5 text-[11px] font-mono font-semibold bg-gray-100 dark:bg-white/10 border border-gray-300 dark:border-white/20 rounded shadow-sm">{children}</kbd>
}

export function Code({ children }: { children: string }) {
  return <pre className="bg-gray-900 dark:bg-black text-green-400 text-[11px] md:text-xs font-mono rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-all select-all">{children}</pre>
}

export function Faq({ q, children }: { q: string; children: ReactNode }) {
  return (
    <details className="border-t border-gray-100 dark:border-white/5 pt-3 mt-3 first:border-t-0 first:pt-0 first:mt-0">
      <summary className="cursor-pointer text-sm font-medium text-gray-800 dark:text-zinc-200 hover:text-gray-900 dark:hover:text-zinc-100">{q}</summary>
      <div className="mt-2 ml-4">{children}</div>
    </details>
  )
}

export function CopyableCmd({ cmd, hint }: { cmd: string; hint?: string }) {
  return (
    <div>
      <div className="relative">
        <pre className="bg-gray-900 dark:bg-black text-green-400 text-[11px] md:text-xs font-mono rounded-lg p-3 pr-20 overflow-x-auto whitespace-pre-wrap break-all select-all">{cmd || 'Đang tải lệnh — đợi 1 giây...'}</pre>
        <button
          onClick={() => { navigator.clipboard.writeText(cmd) }}
          disabled={!cmd}
          className="absolute top-2 right-2 px-3 py-1.5 text-xs font-semibold text-white bg-blue-500 hover:bg-blue-600 disabled:opacity-50 rounded-md"
        >📋 Copy</button>
      </div>
      {hint && <p className="text-[11px] text-gray-500 dark:text-zinc-400 mt-1.5">{hint}</p>}
    </div>
  )
}
