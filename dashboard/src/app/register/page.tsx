'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { setToken, setTenantId } from '@/lib/api'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

const INDUSTRIES = [
  'Cá nhân / Freelancer',
  'Bất động sản', 'Bảo hiểm', 'Phân phối / Bán lẻ',
  'Thực phẩm & Đồ uống', 'Giáo dục', 'Y tế / Dược',
  'Tài chính', 'Khác',
]

const PASSWORD_RULES = [
  { label: 'Ít nhất 8 ký tự',       test: (p: string) => p.length >= 8 },
  { label: 'Chứa chữ hoa (A-Z)',    test: (p: string) => /[A-Z]/.test(p) },
  { label: 'Chứa chữ thường (a-z)', test: (p: string) => /[a-z]/.test(p) },
  { label: 'Chứa số (0-9)',         test: (p: string) => /[0-9]/.test(p) },
  { label: 'Chứa ký tự đặc biệt',  test: (p: string) => /[!@#$%^&*()\-_=+\[\]{}|;':",.<>?/\\`~]/.test(p) },
]

export default function RegisterPage() {
  const router = useRouter()
  const [form, setForm] = useState({ businessName: '', industry: '', ownerName: '', email: '', password: '' })
  const [confirmPassword, setConfirmPassword] = useState('')
  const [agreed, setAgreed] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  const pwdErrors = PASSWORD_RULES.filter(r => !r.test(form.password))
  const pwdValid = pwdErrors.length === 0
  const confirmMatch = confirmPassword.length > 0 && form.password === confirmPassword
  const confirmMismatch = confirmPassword.length > 0 && form.password !== confirmPassword

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!pwdValid || !confirmMatch) return
    setError('')
    setLoading(true)
    try {
      const res = await fetch(`${API}/api/setup/tenant`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Lỗi server')
      if (data.token) setToken(data.token)
      setTenantId(data.tenantId)
      router.push('/setup?step=2')
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
          <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-2xl font-bold shadow-lg shadow-blue-500/30">Z</div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-zinc-100">Đăng ký dùng thử</h1>
          <p className="text-sm text-gray-500 dark:text-zinc-400 mt-1">14 ngày miễn phí · Cá nhân & doanh nghiệp</p>
        </div>

        <form onSubmit={submit} className="bg-white dark:bg-zinc-900 dark:ring-1 dark:ring-white/5 rounded-3xl shadow-[0_1px_2px_rgba(0,0,0,0.04)] p-6 space-y-4">
          {error && (
            <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-xl p-3 text-sm text-red-700 dark:text-red-300">{error}</div>
          )}

          <div>
            <label className="text-xs font-medium text-gray-500 dark:text-zinc-400 block mb-1.5">Tên / Doanh nghiệp *</label>
            <input required value={form.businessName} onChange={set('businessName')}
              className="w-full px-4 py-2.5 bg-gray-50 dark:bg-white/5 rounded-xl text-sm border-0 focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-zinc-100"
              placeholder="Cá nhân hoặc Công ty ABC" />
          </div>

          <div>
            <label className="text-xs font-medium text-gray-500 dark:text-zinc-400 block mb-1.5">Ngành nghề</label>
            <select value={form.industry} onChange={set('industry')}
              className="w-full px-4 py-2.5 bg-gray-50 dark:bg-white/5 rounded-xl text-sm border-0 focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-zinc-100">
              <option value="">Chọn ngành nghề...</option>
              {INDUSTRIES.map(i => <option key={i}>{i}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-500 dark:text-zinc-400 block mb-1.5">Họ tên *</label>
              <input required value={form.ownerName} onChange={set('ownerName')}
                className="w-full px-4 py-2.5 bg-gray-50 dark:bg-white/5 rounded-xl text-sm border-0 focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-zinc-100"
                placeholder="Nguyễn Văn A" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 dark:text-zinc-400 block mb-1.5">Email *</label>
              <input required type="email" value={form.email} onChange={set('email')}
                className="w-full px-4 py-2.5 bg-gray-50 dark:bg-white/5 rounded-xl text-sm border-0 focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-zinc-100"
                placeholder="email@company.com" />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-500 dark:text-zinc-400 block mb-1.5">Mật khẩu *</label>
            <input required type="password" value={form.password} onChange={set('password')}
              className="w-full px-4 py-2.5 bg-gray-50 dark:bg-white/5 rounded-xl text-sm border-0 focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-zinc-100"
              placeholder="••••••••" />
            {form.password.length > 0 && (
              <div className="mt-1.5 space-y-0.5">
                {PASSWORD_RULES.map(rule => {
                  const ok = rule.test(form.password)
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
            <input required type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
              className="w-full px-4 py-2.5 bg-gray-50 dark:bg-white/5 rounded-xl text-sm border-0 focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-zinc-100"
              placeholder="••••••••" />
            {confirmMismatch && <p className="text-xs text-red-500 mt-1">✗ Mật khẩu không khớp</p>}
            {confirmMatch && <p className="text-xs text-green-600 dark:text-green-400 mt-1">✓ Mật khẩu khớp</p>}
          </div>

          <div className="flex items-start gap-2.5 pt-1">
            <input type="checkbox" id="agree" checked={agreed} onChange={e => setAgreed(e.target.checked)}
              className="mt-0.5 w-4 h-4 rounded cursor-pointer accent-blue-500" />
            <label htmlFor="agree" className="text-xs text-gray-600 dark:text-zinc-400 cursor-pointer leading-relaxed">
              Tôi đồng ý với{' '}
              <a href="/terms" target="_blank" className="text-blue-500 hover:underline">Điều khoản sử dụng</a>
              {' '}và{' '}
              <a href="/privacy" target="_blank" className="text-blue-500 hover:underline">Chính sách bảo mật</a>
            </label>
          </div>

          <button type="submit"
            disabled={!agreed || loading || !pwdValid || confirmMismatch || confirmPassword.length === 0}
            className="w-full py-2.5 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white rounded-xl text-sm font-semibold">
            {loading ? 'Đang tạo tài khoản...' : 'Bắt đầu dùng thử →'}
          </button>

          <p className="text-center text-xs text-gray-500 dark:text-zinc-400">
            Đã có tài khoản?{' '}
            <Link href="/login" className="text-blue-500 hover:underline font-medium">Đăng nhập</Link>
          </p>
        </form>
      </div>
    </div>
  )
}
