'use client'

import { Suspense, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

function ResetInner() {
  const router = useRouter()
  const search = useSearchParams()
  const token = search.get('token') ?? ''

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (password.length < 6) return setError('Mật khẩu tối thiểu 6 ký tự')
    if (password !== confirm) return setError('Nhập lại mật khẩu không khớp')

    setLoading(true)
    try {
      const res = await fetch(`${API}/api/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Không đặt lại được')
      setDone(true)
      setTimeout(() => router.push('/login'), 2000)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  if (!token) {
    return (
      <div className="max-w-md mx-auto px-4 py-10 text-center">
        <p className="text-sm text-red-500">Link không hợp lệ — thiếu token.</p>
        <Link href="/forgot-password" className="mt-3 inline-block text-sm text-blue-500 hover:underline">← Yêu cầu link mới</Link>
      </div>
    )
  }

  if (done) {
    return (
      <div className="max-w-md mx-auto px-4 py-10 text-center">
        <div className="text-5xl mb-3">✅</div>
        <h1 className="text-xl font-bold text-gray-900 dark:text-zinc-100">Đổi mật khẩu thành công</h1>
        <p className="text-sm text-gray-500 dark:text-zinc-400 mt-2">Đang chuyển về trang đăng nhập...</p>
      </div>
    )
  }

  return (
    <div className="max-w-md mx-auto px-4 py-10 md:py-16">
      <div className="text-center mb-6">
        <div className="text-5xl mb-3">🔒</div>
        <h1 className="text-xl font-bold text-gray-900 dark:text-zinc-100">Đặt lại mật khẩu</h1>
      </div>

      <form onSubmit={submit} className="bg-white dark:bg-zinc-900 dark:ring-1 dark:ring-white/5 rounded-3xl p-6 space-y-4">
        <div>
          <label className="text-xs font-medium text-gray-500 dark:text-zinc-400 block mb-1.5">Mật khẩu mới</label>
          <input
            type="password" required minLength={6} autoFocus
            value={password} onChange={e => setPassword(e.target.value)}
            className="w-full px-4 py-2.5 bg-gray-50 dark:bg-white/5 rounded-xl text-sm border-0 focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-zinc-100"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-500 dark:text-zinc-400 block mb-1.5">Nhập lại mật khẩu</label>
          <input
            type="password" required minLength={6}
            value={confirm} onChange={e => setConfirm(e.target.value)}
            className="w-full px-4 py-2.5 bg-gray-50 dark:bg-white/5 rounded-xl text-sm border-0 focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-zinc-100"
          />
        </div>
        {error && (
          <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-xl p-3 text-sm text-red-700 dark:text-red-300">{error}</div>
        )}
        <button type="submit" disabled={loading} className="w-full py-2.5 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white rounded-xl text-sm font-semibold">
          {loading ? 'Đang đổi...' : 'Đổi mật khẩu'}
        </button>
      </form>
    </div>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetInner />
    </Suspense>
  )
}
