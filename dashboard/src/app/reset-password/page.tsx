'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

const PASSWORD_RULES = [
  { label: 'Ít nhất 8 ký tự',        test: (p: string) => p.length >= 8 },
  { label: 'Chứa chữ hoa (A-Z)',     test: (p: string) => /[A-Z]/.test(p) },
  { label: 'Chứa chữ thường (a-z)',  test: (p: string) => /[a-z]/.test(p) },
  { label: 'Chứa số (0-9)',          test: (p: string) => /[0-9]/.test(p) },
  { label: 'Chứa ký tự đặc biệt',   test: (p: string) => /[!@#$%^&*()\-_=+\[\]{}|;':",.<>?/\\`~]/.test(p) },
]

function ResetPasswordInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token') ?? ''

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  const pwdErrors = PASSWORD_RULES.filter(r => !r.test(password))
  const pwdValid = pwdErrors.length === 0
  const confirmMatch = confirm.length > 0 && password === confirm
  const confirmMismatch = confirm.length > 0 && password !== confirm

  if (!token) {
    return (
      <div className="min-h-screen bg-[#f2f2f7] dark:bg-zinc-950 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-zinc-900 dark:ring-1 dark:ring-white/5 rounded-3xl p-8 w-full max-w-md text-center space-y-4">
          <div className="text-4xl">⚠️</div>
          <h2 className="text-lg font-bold text-gray-900 dark:text-zinc-100">Link không hợp lệ</h2>
          <p className="text-sm text-gray-500 dark:text-zinc-400">Link đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.</p>
          <Link href="/forgot-password" className="block w-full py-2.5 bg-blue-500 hover:bg-blue-600 text-white rounded-xl text-sm font-semibold text-center">
            Yêu cầu link mới
          </Link>
        </div>
      </div>
    )
  }

  if (done) {
    return (
      <div className="min-h-screen bg-[#f2f2f7] dark:bg-zinc-950 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-zinc-900 dark:ring-1 dark:ring-white/5 rounded-3xl p-8 w-full max-w-md text-center space-y-4">
          <div className="w-14 h-14 mx-auto rounded-full bg-green-100 dark:bg-green-500/10 flex items-center justify-center text-3xl">✅</div>
          <h2 className="text-lg font-bold text-gray-900 dark:text-zinc-100">Đặt mật khẩu thành công</h2>
          <p className="text-sm text-gray-500 dark:text-zinc-400">Mật khẩu đã được cập nhật. Đăng nhập lại để tiếp tục.</p>
          <Link href="/login" className="block w-full py-2.5 bg-blue-500 hover:bg-blue-600 text-white rounded-xl text-sm font-semibold text-center">
            Đăng nhập
          </Link>
        </div>
      </div>
    )
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!pwdValid || !confirmMatch) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`${API}/api/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error ?? 'Lỗi server')
      setDone(true)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#f2f2f7] dark:bg-zinc-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white text-2xl font-bold shadow-lg shadow-blue-500/30">Z</div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-zinc-100">Đặt mật khẩu mới</h1>
          <p className="text-sm text-gray-500 dark:text-zinc-400 mt-1">Chọn mật khẩu mạnh để bảo vệ tài khoản</p>
        </div>

        <form onSubmit={submit} className="bg-white dark:bg-zinc-900 dark:ring-1 dark:ring-white/5 rounded-3xl shadow-[0_1px_2px_rgba(0,0,0,0.04)] p-6 space-y-4">
          <div>
            <label className="text-xs font-medium text-gray-500 dark:text-zinc-400 block mb-1.5">Mật khẩu mới *</label>
            <input type="password" required value={password} onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-4 py-2.5 bg-gray-50 dark:bg-white/5 rounded-xl text-sm border-0 focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-zinc-100" />
            {password.length > 0 && (
              <div className="mt-1.5 space-y-0.5">
                {PASSWORD_RULES.map(rule => {
                  const ok = rule.test(password)
                  return (
                    <p key={rule.label} className={`text-xs flex items-center gap-1 ${ok ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>
                      <span>{ok ? '✓' : '✗'}</span><span>{rule.label}</span>
                    </p>
                  )
                })}
              </div>
            )}
          </div>

          <div>
            <label className="text-xs font-medium text-gray-500 dark:text-zinc-400 block mb-1.5">Nhập lại mật khẩu *</label>
            <input type="password" required value={confirm} onChange={e => setConfirm(e.target.value)}
              placeholder="••••••••"
              className="w-full px-4 py-2.5 bg-gray-50 dark:bg-white/5 rounded-xl text-sm border-0 focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-zinc-100" />
            {confirmMismatch && <p className="text-xs text-red-500 mt-1">✗ Mật khẩu không khớp</p>}
            {confirmMatch && <p className="text-xs text-green-600 dark:text-green-400 mt-1">✓ Mật khẩu khớp</p>}
          </div>

          {error && (
            <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-xl p-3 text-sm text-red-700 dark:text-red-300">
              {error === 'Link hết hạn hoặc không hợp lệ'
                ? <span>{error} — <Link href="/forgot-password" className="underline">Yêu cầu link mới</Link></span>
                : error}
            </div>
          )}

          <button type="submit" disabled={!pwdValid || !confirmMatch || loading}
            className="w-full py-2.5 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white rounded-xl text-sm font-semibold transition-colors">
            {loading ? 'Đang lưu...' : 'Đặt mật khẩu mới'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordInner />
    </Suspense>
  )
}
