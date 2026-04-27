'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { saApi, clearSuperAdminToken, setSuperAdminToken } from '@/lib/super-admin'
import Link from 'next/link'

export default function ChangePasswordPage() {
  const router = useRouter()
  const [form, setForm] = useState({ newPassword: '', confirm: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  const mismatch = form.confirm.length > 0 && form.newPassword !== form.confirm
  const valid = form.newPassword.length >= 6 && form.newPassword === form.confirm

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!valid) return
    setLoading(true)
    setError('')
    try {
      await saApi('/api/super-admin/change-password', {
        method: 'POST',
        body: JSON.stringify({ newPassword: form.newPassword }),
      })
      // Cập nhật token mới vào localStorage
      setSuperAdminToken(form.newPassword)
      setDone(true)
    } catch (err: any) {
      setError(err.message || 'Lỗi không xác định')
    } finally {
      setLoading(false)
    }
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-[#f2f2f7] dark:bg-zinc-950">
        <div className="bg-white dark:bg-zinc-900 dark:ring-1 dark:ring-white/5 rounded-3xl shadow-lg p-8 w-full max-w-md text-center space-y-4">
          <div className="w-12 h-12 mx-auto rounded-full bg-green-100 dark:bg-green-500/10 flex items-center justify-center text-2xl">✓</div>
          <h2 className="text-lg font-bold text-gray-900 dark:text-zinc-100">Đổi mật khẩu thành công</h2>
          <p className="text-sm text-gray-500 dark:text-zinc-400">Lần sau đăng nhập dùng mật khẩu mới.</p>
          <Link href="/super-admin/tenants" className="block w-full py-2.5 bg-blue-500 hover:bg-blue-600 text-white rounded-xl text-sm font-semibold transition-colors text-center">
            Quay lại
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-[#f2f2f7] dark:bg-zinc-950">
      <form onSubmit={submit} className="bg-white dark:bg-zinc-900 dark:ring-1 dark:ring-white/5 rounded-3xl shadow-lg p-8 w-full max-w-md space-y-5">
        <div className="flex items-center gap-3 mb-2">
          <Link href="/super-admin/tenants" className="text-gray-400 hover:text-gray-600 dark:hover:text-zinc-300 text-sm">← Quay lại</Link>
          <h1 className="text-lg font-bold text-gray-900 dark:text-zinc-100">Đổi mật khẩu</h1>
        </div>

        <div className="bg-blue-50 dark:bg-blue-500/10 rounded-xl p-3 text-xs text-blue-700 dark:text-blue-300">
          Sau khi đổi, mật khẩu mới sẽ được lưu trong database. <br />
          Nếu quên mật khẩu: dùng <code className="bg-blue-100 dark:bg-white/10 px-1 rounded">SUPER_ADMIN_TOKEN</code> trong file <code className="bg-blue-100 dark:bg-white/10 px-1 rounded">.env</code> để đăng nhập lại.
        </div>

        <div>
          <label className="text-xs font-medium text-gray-500 dark:text-zinc-400 block mb-1.5">Mật khẩu mới *</label>
          <input
            type="password"
            value={form.newPassword}
            onChange={e => setForm(f => ({ ...f, newPassword: e.target.value }))}
            placeholder="Tối thiểu 6 ký tự"
            className="w-full px-4 py-2.5 bg-gray-50 dark:bg-white/5 rounded-xl text-sm border-0 focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-zinc-100"
          />
          {form.newPassword.length > 0 && form.newPassword.length < 6 && (
            <p className="text-xs text-red-500 mt-1">✗ Cần ít nhất 6 ký tự</p>
          )}
        </div>

        <div>
          <label className="text-xs font-medium text-gray-500 dark:text-zinc-400 block mb-1.5">Nhập lại mật khẩu *</label>
          <input
            type="password"
            value={form.confirm}
            onChange={e => setForm(f => ({ ...f, confirm: e.target.value }))}
            placeholder="••••••"
            className="w-full px-4 py-2.5 bg-gray-50 dark:bg-white/5 rounded-xl text-sm border-0 focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-zinc-100"
          />
          {mismatch && <p className="text-xs text-red-500 mt-1">✗ Không khớp</p>}
          {form.confirm.length > 0 && !mismatch && form.newPassword.length >= 6 && (
            <p className="text-xs text-green-600 dark:text-green-400 mt-1">✓ Khớp</p>
          )}
        </div>

        {error && (
          <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-xl p-3 text-sm text-red-700 dark:text-red-300">{error}</div>
        )}

        <button
          type="submit"
          disabled={!valid || loading}
          className="w-full py-2.5 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white rounded-xl text-sm font-semibold transition-colors"
        >
          {loading ? 'Đang lưu...' : 'Đổi mật khẩu'}
        </button>
      </form>
    </div>
  )
}
