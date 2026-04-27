'use client'

import { useState } from 'react'
import Link from 'next/link'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`${API}/api/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error ?? 'Lỗi server')
      }
      setSent(true)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  if (sent) {
    return (
      <div className="min-h-screen bg-[#f2f2f7] dark:bg-zinc-950 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-zinc-900 dark:ring-1 dark:ring-white/5 rounded-3xl shadow-[0_1px_2px_rgba(0,0,0,0.04)] p-8 w-full max-w-md text-center space-y-4">
          <div className="w-14 h-14 mx-auto rounded-full bg-green-100 dark:bg-green-500/10 flex items-center justify-center text-3xl">📧</div>
          <h2 className="text-lg font-bold text-gray-900 dark:text-zinc-100">Kiểm tra email</h2>
          <p className="text-sm text-gray-500 dark:text-zinc-400">
            Nếu <span className="font-medium text-gray-700 dark:text-zinc-300">{email}</span> tồn tại trong hệ thống, bạn sẽ nhận được link đặt lại mật khẩu trong vài phút.
          </p>
          <p className="text-xs text-gray-400 dark:text-zinc-500">Link có hiệu lực trong 1 giờ.</p>
          <Link href="/login" className="block w-full py-2.5 bg-blue-500 hover:bg-blue-600 text-white rounded-xl text-sm font-semibold transition-colors text-center">
            Quay lại đăng nhập
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#f2f2f7] dark:bg-zinc-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white text-2xl font-bold shadow-lg shadow-blue-500/30">Z</div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-zinc-100">Quên mật khẩu</h1>
          <p className="text-sm text-gray-500 dark:text-zinc-400 mt-1">Nhập email để nhận link đặt lại</p>
        </div>
        <form onSubmit={submit} className="bg-white dark:bg-zinc-900 dark:ring-1 dark:ring-white/5 rounded-3xl shadow-[0_1px_2px_rgba(0,0,0,0.04)] p-6 space-y-4">
          <div>
            <label className="text-xs font-medium text-gray-500 dark:text-zinc-400 block mb-1.5">Email *</label>
            <input type="email" required autoFocus value={email} onChange={e => setEmail(e.target.value)}
              placeholder="email@company.com"
              className="w-full px-4 py-2.5 bg-gray-50 dark:bg-white/5 rounded-xl text-sm border-0 focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-zinc-100" />
          </div>
          {error && <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-xl p-3 text-sm text-red-700 dark:text-red-300">{error}</div>}
          <button type="submit" disabled={loading}
            className="w-full py-2.5 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white rounded-xl text-sm font-semibold transition-colors">
            {loading ? 'Đang gửi...' : 'Gửi link đặt lại mật khẩu'}
          </button>
          <p className="text-center text-xs text-gray-500 dark:text-zinc-400">
            <Link href="/login" className="text-blue-500 hover:underline">← Quay lại đăng nhập</Link>
          </p>
        </form>
      </div>
    </div>
  )
}
