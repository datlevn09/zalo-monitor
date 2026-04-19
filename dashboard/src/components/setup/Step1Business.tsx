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

export function Step1Business({ onDone }: { onDone: (s: SetupState) => void }) {
  const [form, setForm] = useState({
    businessName: '', industry: '', ownerName: '', email: '', password: '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  async function submit(e: React.FormEvent) {
    e.preventDefault()
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
      // Auto-login với JWT backend vừa cấp
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

      <div className="space-y-1">
        <Label>Mật khẩu đăng nhập *</Label>
        <Input type="password" placeholder="Tối thiểu 6 ký tự" value={form.password} onChange={set('password')} required minLength={6} />
      </div>

      {error && <p className="text-sm text-red-500 bg-red-50 dark:bg-red-500/10 p-3 rounded-lg">{error}</p>}

      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? 'Đang tạo...' : 'Tiếp theo →'}
      </Button>
    </form>
  )
}
