'use client'

import Link from 'next/link'
import { useState } from 'react'

const AUTHOR = {
  name: 'Lê Đạt',
  handle: '@dat.thong.dong',
  telegram: 'datlevn',
  web: 'datthongdong.com',
}

export default function ContactPage() {
  const [form, setForm] = useState({ name: '', email: '', topic: 'general', message: '' })
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim() || !form.message.trim()) {
      setError('Vui lòng nhập họ tên và nội dung.')
      return
    }
    setSending(true); setError(null)
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (res.ok) {
        setSent(true)
        setForm({ name: '', email: '', topic: 'general', message: '' })
      } else {
        // Fallback: mở Telegram với nội dung pre-filled (kênh chính)
        const text = encodeURIComponent(
          `[Zalo Monitor · ${form.topic}]\nHọ tên: ${form.name}\n${form.email ? `Email: ${form.email}\n` : ''}\n${form.message}`
        )
        window.open(`https://t.me/${AUTHOR.telegram}?text=${text}`, '_blank')
        setSent(true)
      }
    } catch {
      const text = encodeURIComponent(
        `[Zalo Monitor · ${form.topic}]\nHọ tên: ${form.name}\n${form.email ? `Email: ${form.email}\n` : ''}\n${form.message}`
      )
      window.open(`https://t.me/${AUTHOR.telegram}?text=${text}`, '_blank')
      setSent(true)
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-white via-white to-blue-50 dark:from-zinc-950 dark:via-zinc-950 dark:to-zinc-900">
      <div className="mx-auto max-w-4xl px-4 py-12">
        <Link href="/" className="text-blue-600 dark:text-blue-400 hover:underline text-sm mb-6 inline-block">
          ← Quay lại
        </Link>

        <h1 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-zinc-100 mb-2">Liên hệ</h1>
        <p className="text-gray-500 dark:text-zinc-400 mb-10">
          Câu hỏi, góp ý, hợp tác? Để lại lời nhắn — tôi sẽ phản hồi sớm.
        </p>

        <div className="grid md:grid-cols-5 gap-6">
          {/* Form */}
          <form onSubmit={submit} className="md:col-span-3 bg-white dark:bg-zinc-900 dark:ring-1 dark:ring-white/5 rounded-2xl p-5 md:p-6 shadow-sm space-y-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-zinc-100">Gửi lời nhắn</h2>

            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-zinc-300 mb-1.5">Họ tên *</label>
              <input
                type="text" required
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                className="w-full px-3 py-2 bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-white/10 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Nguyễn Văn A"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-zinc-300 mb-1.5">Email (tuỳ chọn)</label>
              <input
                type="email"
                value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                className="w-full px-3 py-2 bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-white/10 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="ban@congty.vn"
              />
              <p className="mt-1 text-[11px] text-gray-500 dark:text-zinc-400">Nếu để trống tôi sẽ phản hồi qua kênh khác (Telegram/Zalo nếu có).</p>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-zinc-300 mb-1.5">Chủ đề</label>
              <select
                value={form.topic}
                onChange={e => setForm(f => ({ ...f, topic: e.target.value }))}
                className="w-full px-3 py-2 bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-white/10 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="general">Hỏi chung</option>
                <option value="support">Hỗ trợ kỹ thuật / Báo lỗi</option>
                <option value="sales">Mua gói / Nâng cấp</option>
                <option value="partnership">Hợp tác / Tích hợp</option>
                <option value="security">Bảo mật / Riêng tư</option>
                <option value="other">Khác</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-zinc-300 mb-1.5">Nội dung *</label>
              <textarea
                required rows={6}
                value={form.message}
                onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
                className="w-full px-3 py-2 bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-white/10 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y min-h-[120px]"
                placeholder="Mô tả chi tiết câu hỏi/yêu cầu của bạn..."
              />
            </div>

            {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
            {sent && <p className="text-xs text-emerald-600 dark:text-emerald-400">✓ Đã gửi — tôi sẽ phản hồi sớm.</p>}

            <button
              type="submit"
              disabled={sending}
              className="w-full px-4 py-2.5 bg-blue-500 hover:bg-blue-600 disabled:bg-blue-300 text-white text-sm font-medium rounded-lg transition-colors"
            >
              {sending ? 'Đang gửi...' : 'Gửi lời nhắn'}
            </button>
          </form>

          {/* Info */}
          <aside className="md:col-span-2 space-y-4">
            <div className="bg-white dark:bg-zinc-900 dark:ring-1 dark:ring-white/5 rounded-2xl p-5 shadow-sm">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-zinc-100 mb-3">Tác giả</h2>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold">
                  L
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900 dark:text-zinc-100">{AUTHOR.name}</p>
                  <p className="text-xs text-gray-500 dark:text-zinc-400">{AUTHOR.handle}</p>
                </div>
              </div>
              <p className="text-xs text-gray-600 dark:text-zinc-400 leading-relaxed">
                Ứng dụng này là <strong>dự án cá nhân</strong> mình tự "vibe code" để dùng và chia sẻ cho bạn bè trong cộng đồng startup.
                Công việc chính của mình vẫn là <strong>sản xuất video / ảnh</strong> — đây chỉ là thứ làm thêm vì thấy hữu ích.
              </p>
              <p className="text-xs text-gray-500 dark:text-zinc-500 leading-relaxed mt-2">
                Phản hồi vài giờ đến 1 ngày tuỳ thời điểm. Nếu cần nhanh — Telegram là kênh nhanh nhất.
              </p>
            </div>

            <div className="bg-white dark:bg-zinc-900 dark:ring-1 dark:ring-white/5 rounded-2xl p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-zinc-100 mb-3">Kênh trực tiếp</h2>
              <ul className="space-y-2.5">
                <ContactRow icon="✈️" label="Telegram" value={`@${AUTHOR.telegram}`} href={`https://t.me/${AUTHOR.telegram}`} />
                <ContactRow icon="🌐" label="Website" value={AUTHOR.web} href={`https://${AUTHOR.web}`} />
              </ul>
              <p className="mt-4 text-[11px] text-gray-500 dark:text-zinc-400 leading-relaxed">
                Khẩn cấp / bảo mật → Telegram (kênh nhanh nhất).
                Hỏi chung → dùng form bên trái.
              </p>
            </div>
          </aside>
        </div>

        {/* Cross-link giữa các trang công khai */}
        <nav className="mt-10 pt-6 border-t border-gray-200 dark:border-white/10 flex flex-wrap gap-4 text-sm">
          <Link href="/privacy" className="text-blue-600 dark:text-blue-400 hover:underline">Chính sách bảo mật</Link>
          <Link href="/terms" className="text-blue-600 dark:text-blue-400 hover:underline">Điều khoản sử dụng</Link>
          <Link href="/" className="text-gray-500 dark:text-zinc-400 hover:underline">Trang chủ</Link>
        </nav>
      </div>
    </div>
  )
}

function ContactRow({ icon, label, value, href }: { icon: string; label: string; value: string; href: string }) {
  return (
    <li>
      <a
        href={href}
        target={href.startsWith('http') ? '_blank' : undefined}
        rel={href.startsWith('http') ? 'noopener noreferrer' : undefined}
        className="flex items-center gap-3 px-3 py-2 -mx-3 rounded-lg hover:bg-gray-50 dark:hover:bg-white/5 transition-colors group"
      >
        <span className="text-lg">{icon}</span>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] text-gray-500 dark:text-zinc-400">{label}</p>
          <p className="text-sm font-medium text-gray-900 dark:text-zinc-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 truncate">
            {value}
          </p>
        </div>
        <span className="text-gray-300 dark:text-zinc-600 group-hover:text-blue-500 transition-colors">→</span>
      </a>
    </li>
  )
}
