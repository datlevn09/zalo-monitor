'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { api, clearAuth } from '@/lib/api'
import { useRouter } from 'next/navigation'

type Me = {
  user: { id: string; name: string; email: string; role: string }
  tenant: { id: string; name: string; slug: string }
}

/**
 * Header user menu — avatar + tên user + dropdown các action liên quan tài khoản.
 * Hiện ở header dashboard, bên cạnh BoardSwitcher.
 */
export function UserMenu() {
  const router = useRouter()
  const [me, setMe] = useState<Me | null>(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    api<Me>('/api/auth/me').then(setMe).catch(() => undefined)
  }, [])

  if (!me) return null

  const initials = me.user.name?.split(' ').slice(-2).map(s => s[0]).join('').toUpperCase().slice(0, 2) || '?'

  function logout() {
    clearAuth()
    router.push('/login')
  }

  const ROLE_LABEL: Record<string, string> = {
    OWNER: 'Chủ doanh nghiệp',
    MANAGER: 'Quản lý',
    STAFF: 'Nhân viên',
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        title={`${me.user.name} · ${me.user.email}`}
        className="flex items-center gap-2 px-2 py-1 bg-gray-100 dark:bg-white/10 hover:bg-gray-200 dark:hover:bg-white/15 rounded-full transition-colors"
      >
        <span className="w-7 h-7 rounded-full bg-gradient-to-br from-emerald-400 to-blue-500 flex items-center justify-center text-white text-xs font-bold shrink-0">
          {initials}
        </span>
        <span className="hidden md:inline text-xs font-medium text-gray-800 dark:text-zinc-200 max-w-[120px] truncate">
          {me.user.name}
        </span>
        <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1.5 z-50 bg-white dark:bg-zinc-900 ring-1 ring-gray-200 dark:ring-white/10 rounded-2xl shadow-lg overflow-hidden min-w-[260px]">
            {/* Profile info */}
            <div className="px-4 py-3 bg-gradient-to-br from-emerald-50 to-blue-50 dark:from-emerald-500/10 dark:to-blue-500/10 border-b border-gray-100 dark:border-white/5">
              <div className="flex items-center gap-3">
                <span className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-400 to-blue-500 flex items-center justify-center text-white text-sm font-bold shrink-0">
                  {initials}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 dark:text-zinc-100 truncate">{me.user.name}</p>
                  <p className="text-[11px] text-gray-600 dark:text-zinc-400 truncate">{me.user.email}</p>
                </div>
              </div>
              <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] px-1.5 py-0.5 bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400 rounded font-semibold">
                  {ROLE_LABEL[me.user.role] ?? me.user.role}
                </span>
                <span className="text-[10px] text-gray-500 dark:text-zinc-400">·</span>
                <span className="text-[10px] text-gray-600 dark:text-zinc-400 truncate">{me.tenant.name}</span>
              </div>
            </div>

            {/* Actions */}
            <Link href="/dashboard/settings" onClick={() => setOpen(false)}
              className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors">
              <span>⚙️</span>
              <span>Cài đặt tài khoản</span>
            </Link>
            <Link href="/dashboard/settings/channels" onClick={() => setOpen(false)}
              className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors">
              <span>🔌</span>
              <span>Kết nối Zalo</span>
            </Link>
            <Link href="/dashboard/team" onClick={() => setOpen(false)}
              className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors">
              <span>👥</span>
              <span>Đội nhóm & quyền</span>
            </Link>
            <Link href="/dashboard/docs/install" onClick={() => setOpen(false)}
              className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors">
              <span>📖</span>
              <span>Hướng dẫn cài đặt</span>
            </Link>
            <Link href="/contact" onClick={() => setOpen(false)}
              className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors">
              <span>💬</span>
              <span>Hỗ trợ / Liên hệ</span>
            </Link>

            <div className="border-t border-gray-100 dark:border-white/5">
              <button onClick={logout}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors">
                <span>🚪</span>
                <span>Đăng xuất</span>
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
