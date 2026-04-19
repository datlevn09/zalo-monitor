'use client'

import { useState } from 'react'
import Link from 'next/link'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      await fetch(`${API}/api/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      setSent(true)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-md mx-auto px-4 py-10 md:py-16">
      <div className="text-center mb-6">
        <div className="text-5xl mb-3">🔑</div>
        <h1 className="text-xl font-bold text-gray-900 dark:text-zinc-100">Quên mật khẩu</h1>
        <p className="text-sm text-gray-500 dark:text-zinc-400 mt-0.5">
          {sent ? 'Đã gửi email, kiểm tra hộp thư' : 'Nhập email để nhận link đặt lại mật khẩu'}
        </p>
      </div>

      {sent ? (
        <div className="bg-white dark:bg-zinc-900 dark:ring-1 dark:ring-white/5 rounded-3xl p-6 text-center space-y-3">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-green-500/15 text-green-500 flex items-center justify-center text-2xl">✉️</div>
          <p className="text-sm text-gray-700 dark:text-zinc-300">
            Nếu email <b>{email}</b> có trong hệ thống, link đặt lại mật khẩu đã được gửi.
          </p>
          <p className="text-xs text-gray-500 dark:text-zinc-400">
            Không thấy email? Check hộp Spam hoặc thử lại sau 5 phút.
          </p>
          <Link href="/login" className="inline-block mt-2 text-sm text-blue-500 hover:underline font-medium">
            ← Về trang đăng nhập
          </Link>
        </div>
      ) : (
        <form onSubmit={submit} className="bg-white dark:bg-zinc-900 dark:ring-1 dark:ring-white/5 rounded-3xl p-6 space-y-4">
          <div>
            <label className="text-xs font-medium text-gray-500 dark:text-zinc-400 block mb-1.5">Email</label>
            <input
              type="email" required autoFocus
              value={email} onChange={e => setEmail(e.target.value)}
              placeholder="email@company.com"
              className="w-full px-4 py-2.5 bg-gray-50 dark:bg-white/5 rounded-xl text-sm border-0 focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-zinc-100"
            />
          </div>
          <button type="submit" disabled={loading} className="w-full py-2.5 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white rounded-xl text-sm font-semibold">
            {loading ? 'Đang gửi...' : 'Gửi link đặt lại'}
          </button>
          <Link href="/login" className="block text-center text-xs text-gray-500 dark:text-zinc-400 hover:text-gray-700 dark:hover:text-zinc-300">
            ← Quay lại đăng nhập
          </Link>
        </form>
      )}
    </div>
  )
}
