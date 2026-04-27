'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { SetupState } from '@/app/setup/page'
import { setToken, setTenantId } from '@/lib/api'

const INDUSTRIES = [
  'Bất động sản', 'Bảo hiểm', 'Phân phối / Bán lẻ',
  'Thực phẩm & Đồ uống', 'Giáo dục', 'Y tế / Dược',
  'Tài chính', 'Khác',
]

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

const PASSWORD_RULES = [
  { label: 'Ít nhất 8 ký tự',       test: (p: string) => p.length >= 8 },
  { label: 'Chứa chữ hoa (A-Z)',    test: (p: string) => /[A-Z]/.test(p) },
  { label: 'Chứa chữ thường (a-z)', test: (p: string) => /[a-z]/.test(p) },
  { label: 'Chứa số (0-9)',         test: (p: string) => /[0-9]/.test(p) },
  { label: 'Chứa ký tự đặc biệt',  test: (p: string) => /[!@#$%^&*()\-_=+\[\]{}|;':",.<>?/\\`~]/.test(p) },
]

function validatePassword(p: string): string[] {
  return PASSWORD_RULES.filter(r => !r.test(p)).map(r => r.label)
}

export function Step1Business({ onDone }: { onDone: (s: SetupState) => void }) {
  const [form, setForm] = useState({
    businessName: '', industry: '', ownerName: '', email: '', password: '',
  })
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [agreed, setAgreed] = useState(false)

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  const pwdErrors = validatePassword(form.password)
  const pwdValid = pwdErrors.length === 0
  const confirmMatch = confirmPassword.length > 0 && form.password === confirmPassword
  const confirmMismatch = confirmPassword.length > 0 && form.password !== confirmPassword

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!pwdValid) { setError('Mật khẩu chưa đủ yêu cầu.'); return }
    if (form.password !== confirmPassword) { setError('Mật khẩu nhập lại không khớp.'); return }
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
      onDone({ tenantId: data.tenantId, slug: data.slug, webhookUrl: data.webhookUrl })
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-zinc-100">Thông tin doanh nghiệp</h2>
        <p className="text-sm text-gray-500 dark:text-zinc-400 mt-1">Dùng để cá nhân hóa dashboard và báo cáo</p>
      </div>

      <div className="space-y-1">
        <Label>Tên doanh nghiệp *</Label>
        <Input placeholder="VD: Công ty TNHH ABC" value={form.businessName} onChange={set('businessName')} required />
      </div>

      <div className="space-y-1">
        <Label>Ngành nghề</Label>
        <select
          className="w-full border border-gray-300 dark:border-white/10 rounded-md px-3 py-2 text-sm bg-white dark:bg-zinc-900 text-gray-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          value={form.industry} onChange={set('industry')}
        >
          <option value="">Chọn ngành nghề...</option>
          {INDUSTRIES.map(i => <option key={i}>{i}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label>Họ tên chủ *</Label>
          <Input placeholder="Nguyễn Văn A" value={form.ownerName} onChange={set('ownerName')} required />
        </div>
        <div className="space-y-1">
          <Label>Email *</Label>
          <Input type="email" placeholder="email@gmail.com" value={form.email} onChange={set('email')} required />
        </div>
      </div>

      {/* Password */}
      <div className="space-y-1">
        <Label>Mật khẩu đăng nhập *</Label>
        <Input
          type="password"
          placeholder="Tối thiểu 8 ký tự"
          value={form.password}
          onChange={set('password')}
          required
        />
        {/* Strength indicator */}
        {form.password.length > 0 && (
          <div className="mt-1.5 space-y-0.5">
            {PASSWORD_RULES.map(rule => {
              const ok = rule.test(form.password)
              return (
                <p key={rule.label} className={`text-xs flex items-center gap-1 ${ok ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>
                  <span>{ok ? '✓' : '✗'}</span>
                  <span>{rule.label}</span>
                </p>
              )
            })}
          </div>
        )}
      </div>

      {/* Confirm password */}
      <div className="space-y-1">
        <Label>Nhập lại mật khẩu *</Label>
        <Input
          type="password"
          placeholder="Nhập lại mật khẩu"
          value={confirmPassword}
          onChange={e => setConfirmPassword(e.target.value)}
          required
        />
        {confirmMismatch && (
          <p className="text-xs text-red-500 dark:text-red-400 mt-1">✗ Mật khẩu không khớp</p>
        )}
        {confirmMatch && (
          <p className="text-xs text-green-600 dark:text-green-400 mt-1">✓ Mật khẩu khớp</p>
        )}
      </div>

      <div className="flex items-start gap-3 py-2">
        <input
          type="checkbox"
          id="agree"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          className="mt-1 w-4 h-4 border border-gray-300 dark:border-white/20 rounded cursor-pointer"
        />
        <label htmlFor="agree" className="text-sm text-gray-700 dark:text-zinc-300 cursor-pointer">
          Tôi đồng ý với{' '}
          <a href="/terms" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline">
            Điều khoản sử dụng
          </a>
          {' '}và{' '}
          <a href="/privacy" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline">
            Chính sách bảo mật
          </a>
        </label>
      </div>

      {error && <p className="text-sm text-red-500 bg-red-50 dark:bg-red-500/10 p-3 rounded-lg">{error}</p>}

      <Button
        type="submit"
        className="w-full"
        disabled={!agreed || loading || !pwdValid || confirmMismatch || confirmPassword.length === 0}
      >
        {loading ? 'Đang tạo...' : 'Tiếp theo →'}
      </Button>
    </form>
  )
}
