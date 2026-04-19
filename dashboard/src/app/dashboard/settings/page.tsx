'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'

type Tenant = {
  id: string
  name: string
  slug: string
  industry: string | null
  enabledChannels: string[]
  setupDone: boolean
}

const CHANNELS = [
  { key: 'TELEGRAM', label: 'Telegram', icon: '✈️', tint: 'bg-sky-500',   desc: 'Theo dõi nhóm Telegram' },
  { key: 'ZALO',     label: 'Zalo',     icon: 'Z',  tint: 'bg-blue-500',  desc: 'Theo dõi nhóm Zalo cá nhân' },
  { key: 'LARK',     label: 'Lark',     icon: '🪶', tint: 'bg-emerald-500', desc: 'Theo dõi nhóm Lark/Feishu' },
]

export default function SettingsPage() {
  const [tenant, setTenant] = useState<Tenant | null>(null)
  const [enabled, setEnabled] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    api<Tenant>('/api/tenants/current').then(t => {
      setTenant(t)
      setEnabled(new Set(t.enabledChannels))
    })
  }, [])

  async function toggle(key: string) {
    const next = new Set(enabled)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    setEnabled(next)

    setSaving(true)
    await api('/api/tenants/current', {
      method: 'PATCH',
      body: JSON.stringify({ enabledChannels: Array.from(next) }),
    })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  if (!tenant) return <div className="p-8 text-gray-400 dark:text-zinc-500">Đang tải...</div>

  return (
    <div className="p-4 md:p-8 max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-zinc-100 tracking-tight">Cài đặt</h1>
        <p className="text-gray-500 dark:text-zinc-400 mt-1">Quản lý doanh nghiệp và kênh theo dõi</p>
      </div>

      {/* Business info */}
      <Section title="Doanh nghiệp">
        <Row label="Tên" value={tenant.name} />
        <Row label="Ngành" value={tenant.industry ?? '—'} />
        <Row label="Slug" value={tenant.slug} mono />
        <Row label="Tenant ID" value={tenant.id} mono small />
      </Section>

      {/* Channels */}
      <Section
        title="Kênh theo dõi"
        description="Bật/tắt đọc tin nhắn theo từng kênh. Tắt = tin nhắn sẽ không được lưu vào dashboard."
      >
        {CHANNELS.map(ch => {
          const on = enabled.has(ch.key)
          return (
            <div key={ch.key} className="flex items-center gap-3 px-4 py-3.5">
              <div className={`w-10 h-10 rounded-2xl ${ch.tint} flex items-center justify-center text-white font-bold shrink-0`}>
                {ch.icon}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900 dark:text-zinc-100">{ch.label}</p>
                <p className="text-xs text-gray-500 dark:text-zinc-400 mt-0.5">{ch.desc}</p>
              </div>
              <button
                onClick={() => toggle(ch.key)}
                disabled={saving}
                className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${on ? 'bg-green-500' : 'bg-gray-300'} ${saving ? 'opacity-50' : ''}`}
              >
                <span
                  className="absolute top-0.5 left-0.5 w-5 h-5 bg-white dark:bg-white/10 rounded-full shadow-md transition-transform"
                  style={{ transform: on ? 'translateX(20px)' : 'translateX(0)' }}
                />
              </button>
            </div>
          )
        })}
      </Section>

      {/* Save indicator */}
      {saved && (
        <div className="fixed bottom-20 md:bottom-8 left-1/2 -translate-x-1/2 bg-gray-900 text-white px-4 py-2 rounded-full text-sm shadow-lg z-50 animate-in fade-in slide-in-from-bottom-2">
          ✓ Đã lưu
        </div>
      )}

      {/* Danger zone */}
      <Section title="Danger zone">
        <button
          onClick={() => {
            if (confirm('Đăng xuất khỏi dashboard?')) {
              localStorage.removeItem('tenantId')
              window.location.href = '/setup'
            }
          }}
          className="w-full text-left px-4 py-3.5 text-sm text-red-500 dark:text-red-400 font-medium hover:bg-red-50 dark:hover:bg-red-500/10"
        >
          Đăng xuất
        </button>
      </Section>
    </div>
  )
}

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <div className="px-1 mb-2">
        <h2 className="text-xs font-semibold text-gray-500 dark:text-zinc-400 uppercase tracking-wider">{title}</h2>
        {description && <p className="text-xs text-gray-500 dark:text-zinc-400 mt-1">{description}</p>}
      </div>
      <div className="bg-white dark:bg-zinc-900 dark:ring-1 dark:ring-white/5 rounded-2xl shadow-[0_1px_2px_rgba(0,0,0,0.04)] overflow-hidden divide-y divide-gray-100 dark:divide-white/5">
        {children}
      </div>
    </div>
  )
}

function Row({ label, value, mono, small }: { label: string; value: string; mono?: boolean; small?: boolean }) {
  return (
    <div className="flex items-center justify-between px-4 py-3.5 gap-3">
      <span className="text-sm text-gray-600 dark:text-zinc-400 shrink-0">{label}</span>
      <span className={`text-sm text-gray-900 dark:text-zinc-100 font-medium truncate text-right ${mono ? 'font-mono' : ''} ${small ? 'text-xs' : ''}`}>
        {value}
      </span>
    </div>
  )
}
