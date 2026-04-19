'use client'

import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { setToken, setTenantId } from '@/lib/api'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

type LoginResponse = {
  token: string
  user: { id: string; name: string; email: string; role: string }
  tenant: { id: string; name: string; slug: string }
}

function LoginPageInner() {
  const router = useRouter()
  const search = useSearchParams()
  const queryError = search.get('error')
  const queryEmail = search.get('email')

  const [email, setEmail] = useState(queryEmail ?? '')
  const [password, setPassword] = useState('')
  const [slug, setSlug] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (queryError === 'no_account') setError(`Email ${queryEmail} chưa có tài khoản. Đăng ký trước ở /setup.`)
    if (queryError === 'suspended') setError('Tài khoản bị tạm ngưng. Liên hệ quản trị.')
  }, [queryError, queryEmail])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`${API}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, tenantSlug: slug || undefined }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Đăng nhập thất bại')
      const d = data as LoginResponse
      setToken(d.token)
      setTenantId(d.tenant.id)
      router.push('/dashboard')
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-md mx-auto px-4 py-10 md:py-16">
      <div className="text-center mb-6">
        <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white text-2xl font-bold shadow-lg shadow-blue-500/30">Z</div>
        <h1 className="text-xl font-bold text-gray-900 dark:text-zinc-100">Đăng nhập</h1>
        <p className="text-sm text-gray-500 dark:text-zinc-400 mt-0.5">Vào dashboard doanh nghiệp của bạn</p>
      </div>

      <form onSubmit={submit} className="bg-white dark:bg-zinc-900 dark:ring-1 dark:ring-white/5 rounded-3xl shadow-[0_1px_2px_rgba(0,0,0,0.04)] p-6 space-y-4">
        <GoogleButton />

        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-gray-200 dark:bg-white/10" />
          <span className="text-xs text-gray-400 dark:text-zinc-500">hoặc</span>
          <div className="flex-1 h-px bg-gray-200 dark:bg-white/10" />
        </div>

        <div>
          <label className="text-xs font-medium text-gray-500 dark:text-zinc-400 block mb-1.5">Email</label>
          <input
            type="email" required autoFocus
            value={email} onChange={e => setEmail(e.target.value)}
            className="w-full px-4 py-2.5 bg-gray-50 dark:bg-white/5 rounded-xl text-sm border-0 focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-zinc-100"
            placeholder="email@company.com"
          />
        </div>

        <div>
          <div className="flex items-baseline justify-between mb-1.5">
            <label className="text-xs font-medium text-gray-500 dark:text-zinc-400">Mật khẩu</label>
            <Link href="/forgot-password" className="text-xs text-blue-500 hover:underline">Quên?</Link>
          </div>
          <input
            type="password" required minLength={6}
            value={password} onChange={e => setPassword(e.target.value)}
            className="w-full px-4 py-2.5 bg-gray-50 dark:bg-white/5 rounded-xl text-sm border-0 focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-zinc-100"
          />
        </div>

        <details className="text-xs">
          <summary className="cursor-pointer text-gray-500 dark:text-zinc-400">Nâng cao — chỉ định slug doanh nghiệp</summary>
          <input
            value={slug} onChange={e => setSlug(e.target.value)}
            placeholder="slug-cong-ty-abc"
            className="w-full mt-2 px-3 py-2 bg-gray-50 dark:bg-white/5 rounded-lg text-sm border-0 focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-zinc-100"
          />
          <p className="mt-1 text-gray-400 dark:text-zinc-500">Chỉ cần nếu email này thuộc nhiều doanh nghiệp khác nhau.</p>
        </details>

        {error && (
          <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-xl p-3 text-sm text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        <button type="submit" disabled={loading} className="w-full py-2.5 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white rounded-xl text-sm font-semibold">
          {loading ? 'Đang đăng nhập...' : 'Đăng nhập'}
        </button>

        <p className="text-center text-xs text-gray-500 dark:text-zinc-400">
          Chưa có tài khoản?{' '}
          <Link href="/setup" className="text-blue-500 hover:underline font-medium">Đăng ký doanh nghiệp</Link>
        </p>
      </form>
    </div>
  )
}

function GoogleButton() {
  // Chỉ hiện nút nếu backend đã cấu hình Google OAuth
  const [enabled, setEnabled] = useState(false)
  useEffect(() => {
    fetch(`${API}/api/auth/google`, { method: 'HEAD', redirect: 'manual' })
      .then((r) => setEnabled(r.status !== 503 && r.status !== 404))
      .catch(() => setEnabled(false))
  }, [])

  if (!enabled) return null

  return (
    <a
      href={`${API}/api/auth/google`}
      className="flex items-center justify-center gap-2 w-full py-2.5 bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 hover:bg-gray-50 dark:hover:bg-white/10 text-gray-900 dark:text-zinc-100 rounded-xl text-sm font-medium transition-colors"
    >
      <svg className="w-4 h-4" viewBox="0 0 24 24">
        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
      </svg>
      Đăng nhập với Google
    </a>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginPageInner />
    </Suspense>
  )
}
