'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { setSuperAdminToken } from '@/lib/super-admin'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

export default function SuperAdminLoginPage() {
  const router = useRouter()
  const [token, setToken] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const res = await fetch(`${API}/api/super-admin/tenants`, {
        method: 'GET',
        headers: { 'x-super-admin-token': token.trim() },
      })

      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          throw new Error('Token không hợp lệ')
        }
        throw new Error('Lỗi server')
      }

      setSuperAdminToken(token.trim())
      router.push('/super-admin/tenants')
    } catch (err: any) {
      setError(err.message || 'Token không hợp lệ')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-[#f2f2f7] dark:bg-zinc-950">
      <form onSubmit={handleSubmit} className="bg-white dark:bg-zinc-900 dark:ring-1 dark:ring-white/5 rounded-3xl shadow-lg p-8 w-full max-w-md space-y-6">
        <div className="text-center">
          <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white text-2xl font-bold shadow-lg shadow-blue-500/30">
            Z
          </div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-zinc-100">Super Admin</h1>
          <p className="text-sm text-gray-500 dark:text-zinc-400 mt-1">Quản lý toàn bộ khách hàng</p>
        </div>

        <div>
          <label className="text-xs font-medium text-gray-500 dark:text-zinc-400 block mb-1.5">
            Super admin token
          </label>
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Nhập token"
            autoFocus
            className="w-full px-4 py-2.5 bg-gray-50 dark:bg-white/5 rounded-xl text-sm border-0 focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-zinc-100"
          />
        </div>

        {error && (
          <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-xl p-3 text-sm text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full py-2.5 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white rounded-xl text-sm font-semibold transition-colors"
        >
          {loading ? 'Đang kiểm tra...' : 'Đăng nhập'}
        </button>

        <p className="text-[11px] text-gray-400 dark:text-zinc-500 text-center">
          Token được cấu hình qua biến <code className="bg-gray-100 dark:bg-white/10 px-1 rounded">SUPER_ADMIN_TOKEN</code>
        </p>
      </form>
    </div>
  )
}
