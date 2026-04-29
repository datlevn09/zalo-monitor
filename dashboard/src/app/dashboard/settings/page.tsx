'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { api } from '@/lib/api'

type Tenant = {
  id: string
  name: string
  slug: string
  industry: string | null
  enabledChannels: string[]
  setupDone: boolean
  monitorDMs: boolean
  allowedDMIds: string[]
  encryptMessages: boolean
}

type InstallCommand = { oneLineCommand: string; windowsCommand?: string; dockerCommand?: string }

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
  const [install, setInstall] = useState<InstallCommand | null>(null)
  const [copied, setCopied] = useState(false)
  const [privacy, setPrivacy] = useState<{ monitorDMs: boolean; allowedDMIds: string[] } | null>(null)
  const [zaloStatus, setZaloStatus] = useState<{ connected: boolean; containerRunning: boolean } | null>(null)

  useEffect(() => {
    api<Tenant>('/api/tenants/current').then(t => {
      setTenant(t)
      setEnabled(new Set(t.enabledChannels))
    })
    api<InstallCommand>('/api/auth/my-install-command').then(setInstall).catch(() => undefined)
    api<{ monitorDMs: boolean; allowedDMIds: string[] }>('/api/auth/my-privacy').then(setPrivacy).catch(() => undefined)
    api<{ connected: boolean; containerRunning: boolean }>('/api/zalo/connection-status').then(setZaloStatus).catch(() => undefined)
  }, [])

  function copy(text: string) {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

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
        description="Bật/tắt đồng bộ dữ liệu theo từng kênh. Tắt = dữ liệu sẽ không được đồng bộ vào dashboard."
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
                  className="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-md transition-transform"
                  style={{ transform: on ? 'translateX(20px)' : 'translateX(0)' }}
                />
              </button>
            </div>
          )
        })}
      </Section>

      {/* Hook install — cho Zalo cá nhân của user này */}
      {install && (
        <Section
          title={
            <span className="flex items-center gap-2">
              📲 Zalo của tôi
              {zaloStatus === null ? null
                : zaloStatus.connected
                  ? <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold bg-green-100 dark:bg-green-500/20 text-green-700 dark:text-green-400 rounded-full">● Đã kết nối</span>
                  : zaloStatus.containerRunning
                    ? <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold bg-yellow-100 dark:bg-yellow-500/20 text-yellow-700 dark:text-yellow-400 rounded-full">● Chờ quét QR</span>
                    : <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-400 rounded-full">● Chưa kết nối</span>
              }
            </span>
          }
          description="Listener chỉ ĐỌC tin Zalo của bạn — không bao giờ tự reply. Chỉ gửi khi bạn chủ động bấm Gửi từ dashboard."
        >
          <InstallCommandTabs install={install} copy={copy} copied={copied} />
        </Section>
      )}

      {/* Privacy — DM monitoring (per-user) */}
      {privacy && (
        <Section
          title="🔒 Quyền riêng tư của tôi"
          description="Mỗi người tự quyết có đồng bộ DM trên Zalo CÁ NHÂN của mình không. Cài đặt này chỉ áp dụng cho dữ liệu từ Zalo của bạn, không ảnh hưởng người khác."
        >
          <div className="flex items-center gap-3 px-4 py-3.5">
            <div className="w-10 h-10 rounded-2xl bg-amber-500 flex items-center justify-center text-white font-bold shrink-0">
              💬
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900 dark:text-zinc-100">Quản lý tin nhắn bán hàng 1-1 (DM)</p>
              <p className="text-xs text-gray-500 dark:text-zinc-400 mt-0.5">
                Đừng mất thời gian lội từng group chat. Bật để gom tất cả tin nhắn Zalo / Telegram / Lark từ khách hàng cá nhân về 1 nơi quản lý.
              </p>
            </div>
            <button
              onClick={async () => {
                setSaving(true)
                const next = !privacy.monitorDMs
                await api('/api/auth/my-privacy', {
                  method: 'PATCH',
                  body: JSON.stringify({ monitorDMs: next }),
                })
                setPrivacy({ ...privacy, monitorDMs: next })
                setSaving(false); setSaved(true)
                setTimeout(() => setSaved(false), 2000)
              }}
              disabled={saving}
              className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${privacy.monitorDMs ? 'bg-amber-500' : 'bg-gray-300 dark:bg-white/15'} ${saving ? 'opacity-50' : ''}`}
            >
              <span
                className="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-md transition-transform"
                style={{ transform: privacy.monitorDMs ? 'translateX(20px)' : 'translateX(0)' }}
              />
            </button>
          </div>
          {privacy.monitorDMs && (
            <div className="px-4 py-3 bg-amber-50 dark:bg-amber-500/10 border-t border-amber-200 dark:border-amber-500/30">
              <p className="text-xs text-amber-800 dark:text-amber-300">
                ⚠️ Đang theo dõi TẤT CẢ DM trên Zalo của bạn. Nên dùng allowlist (chỉ cho phép vài khách cụ thể) thay vì bật toàn bộ.
              </p>
            </div>
          )}
        </Section>
      )}

      {/* Mã hoá tin nhắn — toggle per-tenant */}
      {tenant && (
        <Section
          title="🔐 Bảo vệ tin nhắn"
          description="Bật để tăng mức bảo vệ cho tin nhắn lưu trữ. AI phân tích, word cloud, tìm kiếm vẫn hoạt động bình thường."
        >
          <div className="flex items-center gap-3 px-4 py-3.5">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500 flex items-center justify-center text-white font-bold shrink-0">
              🔒
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900 dark:text-zinc-100">Bảo vệ tin nhắn nâng cao</p>
              <p className="text-xs text-gray-500 dark:text-zinc-400 mt-0.5">
                Bật = áp dụng cho tin về sau. Tin cũ không bị ảnh hưởng. Có thể tắt bất kỳ lúc nào.
              </p>
            </div>
            <button
              onClick={async () => {
                setSaving(true)
                const next = !tenant.encryptMessages
                await api('/api/tenants/current', {
                  method: 'PATCH',
                  body: JSON.stringify({ encryptMessages: next }),
                })
                setTenant({ ...tenant, encryptMessages: next })
                setSaving(false); setSaved(true)
                setTimeout(() => setSaved(false), 2000)
              }}
              disabled={saving}
              className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${tenant.encryptMessages ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-white/15'} ${saving ? 'opacity-50' : ''}`}
            >
              <span
                className="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-md transition-transform"
                style={{ transform: tenant.encryptMessages ? 'translateX(20px)' : 'translateX(0)' }}
              />
            </button>
          </div>
          {tenant.encryptMessages && (
            <div className="px-4 py-3 bg-emerald-50 dark:bg-emerald-500/10 border-t border-emerald-200 dark:border-emerald-500/30">
              <p className="text-xs text-emerald-800 dark:text-emerald-300">
                ✓ Đang bảo vệ tin nhắn. AI và phân tích vẫn hoạt động bình thường.
              </p>
            </div>
          )}
        </Section>
      )}

      {/* Save indicator */}
      {saved && (
        <div className="fixed bottom-20 md:bottom-8 left-1/2 -translate-x-1/2 bg-gray-900 text-white px-4 py-2 rounded-full text-sm shadow-lg z-50 animate-in fade-in slide-in-from-bottom-2">
          ✓ Đã lưu
        </div>
      )}

      {/* AI Provider config */}
      <AiConfigSection />

      {/* Đổi mật khẩu */}
      <ChangePasswordSection />

      {/* Danger zone */}
      <Section title="Danger zone">
        <button
          onClick={() => {
            if (confirm('Đăng xuất khỏi dashboard?')) {
              localStorage.removeItem('tenantId')
              localStorage.removeItem('token')
              window.location.href = '/login'
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

function Section({ title, description, children }: { title: React.ReactNode; description?: string; children: React.ReactNode }) {
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

const PASSWORD_RULES = [
  { label: 'Ít nhất 8 ký tự',       test: (p: string) => p.length >= 8 },
  { label: 'Chứa chữ hoa (A-Z)',    test: (p: string) => /[A-Z]/.test(p) },
  { label: 'Chứa chữ thường (a-z)', test: (p: string) => /[a-z]/.test(p) },
  { label: 'Chứa số (0-9)',         test: (p: string) => /[0-9]/.test(p) },
  { label: 'Chứa ký tự đặc biệt',  test: (p: string) => /[!@#$%^&*()\-_=+\[\]{}|;':",.<>?/\\`~]/.test(p) },
]

function AiConfigSection() {
  const [provider, setProvider] = useState<string>('')
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState('')
  const [hasKey, setHasKey] = useState(false)
  const [keyPreview, setKeyPreview] = useState<string | null>(null)
  const [systemFallback, setSystemFallback] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savedOk, setSavedOk] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api<{ provider: string | null; model: string | null; hasKey: boolean; keyPreview: string | null; systemFallback: boolean }>('/api/ai/config')
      .then((d) => {
        setProvider(d.provider ?? '')
        setModel(d.model ?? '')
        setHasKey(d.hasKey)
        setKeyPreview(d.keyPreview)
        setSystemFallback(d.systemFallback)
      }).catch(() => undefined)
  }, [])

  // Model list theo provider — đồng bộ với SDK đang hỗ trợ. Phần đầu mỗi list
  // là default. Cập nhật khi provider phát hành model mới / deprecate model cũ.
  const PROVIDER_MODELS: Record<string, Array<{ id: string; label: string; note?: string }>> = {
    anthropic: [
      { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5', note: 'Mặc định · rẻ + nhanh' },
      { id: 'claude-sonnet-4-5-20250929', label: 'Claude Sonnet 4.5', note: 'Cân bằng' },
      { id: 'claude-opus-4-5-20251112', label: 'Claude Opus 4.5', note: 'Mạnh nhất · đắt' },
      { id: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet (legacy)' },
    ],
    openai: [
      { id: 'gpt-4o-mini', label: 'GPT-4o mini', note: 'Mặc định · rẻ' },
      { id: 'gpt-4o', label: 'GPT-4o', note: 'Mạnh hơn · đắt' },
      { id: 'gpt-4.1-mini', label: 'GPT-4.1 mini' },
      { id: 'gpt-4.1', label: 'GPT-4.1' },
      { id: 'o1-mini', label: 'o1-mini (reasoning)' },
    ],
    google: [
      { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite', note: 'Mặc định · rẻ nhất' },
      { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', note: 'Cân bằng' },
      { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', note: 'Mạnh nhất · đắt' },
      { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash (legacy)' },
    ],
  }
  const defaultModel: Record<string, string> = Object.fromEntries(
    Object.entries(PROVIDER_MODELS).map(([k, v]) => [k, v[0].id])
  )

  async function save() {
    setSaving(true); setError(null)
    try {
      await api('/api/ai/config', {
        method: 'PUT',
        body: JSON.stringify({
          provider: provider || null,
          // chỉ gửi apiKey nếu user nhập mới (không gửi rỗng để tránh xoá)
          ...(apiKey ? { apiKey } : {}),
          model: model || defaultModel[provider] || null,
        }),
      })
      setSavedOk(true)
      setApiKey('')
      // Reload state
      const d = await api<any>('/api/ai/config')
      setHasKey(d.hasKey); setKeyPreview(d.keyPreview)
      setTimeout(() => setSavedOk(false), 2000)
    } catch (e: any) {
      setError(e?.message || 'Lưu thất bại')
    } finally {
      setSaving(false)
    }
  }

  async function clearKey() {
    if (!confirm('Xoá API key đang lưu? AI Chat sẽ fallback về key hệ thống (nếu có).')) return
    setSaving(true)
    try {
      await api('/api/ai/config', {
        method: 'PUT',
        body: JSON.stringify({ provider: null, apiKey: null, model: null }),
      })
      setProvider(''); setApiKey(''); setModel('')
      setHasKey(false); setKeyPreview(null)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Section
      title="🤖 AI Provider — API key của bạn"
      description="Dùng API key của bạn để chạy AI Chat + phân loại tin (bạn trả tiền trực tiếp cho provider, không qua hệ thống). Không cấu hình → dùng key chung của hệ thống nếu còn quota."
    >
      <div className="px-4 py-3.5 space-y-3">
        {/* Trạng thái hiện tại */}
        {hasKey ? (
          <div className="flex items-center justify-between gap-2 px-3 py-2 bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-500/30 rounded-lg">
            <div className="text-xs text-green-800 dark:text-green-300">
              ✓ Đang dùng <strong className="capitalize">{provider}</strong>
              <span className="ml-2 font-mono text-green-600 dark:text-green-400">{keyPreview}</span>
            </div>
            <button onClick={clearKey} disabled={saving} className="text-[11px] text-red-600 dark:text-red-400 hover:underline">
              Xoá key
            </button>
          </div>
        ) : systemFallback ? (
          <div className="px-3 py-2 bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/30 rounded-lg text-xs text-blue-700 dark:text-blue-300">
            ℹ️ Bạn đang dùng key chung của hệ thống. Nhập key riêng bên dưới nếu muốn tự kiểm soát chi phí và provider.
          </div>
        ) : (
          <div className="px-3 py-2 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-lg text-xs text-amber-700 dark:text-amber-300">
            ⚠️ Chưa có API key — AI Chat và phân loại tin sẽ tạm ngưng. Nhập key bên dưới để kích hoạt.
          </div>
        )}

        {/* Provider selector */}
        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-zinc-300 mb-1.5">Nhà cung cấp</label>
          <div className="grid grid-cols-3 gap-2">
            {[
              { v: 'anthropic', label: 'Anthropic', sub: 'Claude' },
              { v: 'openai', label: 'OpenAI', sub: 'GPT-4o' },
              { v: 'google', label: 'Google', sub: 'Gemini' },
            ].map((p) => (
              <button
                key={p.v}
                onClick={() => { setProvider(p.v); if (!model) setModel(defaultModel[p.v]) }}
                className={`px-3 py-2.5 rounded-xl border text-left transition-all ${
                  provider === p.v
                    ? 'bg-blue-50 dark:bg-blue-500/15 border-blue-400 dark:border-blue-500/50 text-blue-700 dark:text-blue-300'
                    : 'bg-white dark:bg-white/5 border-gray-200 dark:border-white/10 text-gray-700 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-white/10'
                }`}
              >
                <p className="text-sm font-semibold">{p.label}</p>
                <p className="text-[10px] opacity-70">{p.sub}</p>
              </button>
            ))}
          </div>
        </div>

        {/* API Key input */}
        {provider && (
          <>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-zinc-300 mb-1.5">
                API Key {hasKey && <span className="text-gray-400 font-normal">(để trống nếu giữ key cũ)</span>}
              </label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={
                  provider === 'anthropic' ? 'sk-ant-api03-...' :
                  provider === 'openai' ? 'sk-proj-...' :
                  'AIzaSy...'
                }
                className="w-full px-3 py-2 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-white/10 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="mt-1 text-[11px] text-gray-500 dark:text-zinc-400">
                {provider === 'anthropic' && (<>Lấy key tại <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">console.anthropic.com</a></>)}
                {provider === 'openai' && (<>Lấy key tại <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">platform.openai.com</a></>)}
                {provider === 'google' && (<>Lấy key tại <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">aistudio.google.com</a></>)}
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-zinc-300 mb-1.5">Model</label>
              <select
                value={model || defaultModel[provider]}
                onChange={(e) => setModel(e.target.value)}
                className="w-full px-3 py-2 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-white/10 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {(PROVIDER_MODELS[provider] ?? []).map(m => (
                  <option key={m.id} value={m.id}>
                    {m.label}{m.note ? ` — ${m.note}` : ''}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[11px] text-gray-500 dark:text-zinc-400">
                Mặc định: <code>{defaultModel[provider]}</code>. Chọn model nào provider của bạn đang hỗ trợ.
              </p>
            </div>
          </>
        )}

        {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}

        <div className="flex items-center gap-2 pt-1">
          <button
            onClick={save}
            disabled={saving || !provider || (!hasKey && !apiKey)}
            className="px-4 py-2 text-xs font-semibold text-white bg-blue-500 hover:bg-blue-600 disabled:opacity-50 rounded-lg transition-colors"
          >
            {saving ? 'Đang lưu...' : savedOk ? '✓ Đã lưu' : 'Lưu cấu hình'}
          </button>
          <span className="text-[11px] text-gray-500 dark:text-zinc-400">
            Key được lưu mã hoá per-tenant. Chi phí AI do anh trả trực tiếp cho provider.
          </span>
        </div>
      </div>
    </Section>
  )
}

function ChangePasswordSection() {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ current: '', newPwd: '', confirm: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  const pwdValid = PASSWORD_RULES.every(r => r.test(form.newPwd))
  const confirmMatch = form.confirm.length > 0 && form.newPwd === form.confirm
  const confirmMismatch = form.confirm.length > 0 && form.newPwd !== form.confirm

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!pwdValid || !confirmMatch) return
    setLoading(true); setError('')
    try {
      await api('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword: form.current, newPassword: form.newPwd }),
      })
      setSaved(true)
      setOpen(false)
      setForm({ current: '', newPwd: '', confirm: '' })
      setTimeout(() => setSaved(false), 3000)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Section title="Bảo mật">
      <div className="px-4 py-3.5">
        {!open ? (
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600 dark:text-zinc-400">Mật khẩu</span>
            <button onClick={() => setOpen(true)} className="text-sm text-blue-500 hover:underline font-medium">
              {saved ? '✓ Đã đổi' : 'Đổi mật khẩu'}
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <p className="text-sm font-medium text-gray-900 dark:text-zinc-100">Đổi mật khẩu</p>
            <input type="password" required placeholder="Mật khẩu hiện tại"
              value={form.current} onChange={e => setForm(f => ({ ...f, current: e.target.value }))}
              className="w-full px-3 py-2 bg-gray-50 dark:bg-white/5 rounded-xl text-sm border-0 focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-zinc-100" />
            <div>
              <input type="password" required placeholder="Mật khẩu mới"
                value={form.newPwd} onChange={e => setForm(f => ({ ...f, newPwd: e.target.value }))}
                className="w-full px-3 py-2 bg-gray-50 dark:bg-white/5 rounded-xl text-sm border-0 focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-zinc-100" />
              {form.newPwd.length > 0 && (
                <div className="mt-1.5 space-y-0.5">
                  {PASSWORD_RULES.map(rule => {
                    const ok = rule.test(form.newPwd)
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
              <input type="password" required placeholder="Nhập lại mật khẩu mới"
                value={form.confirm} onChange={e => setForm(f => ({ ...f, confirm: e.target.value }))}
                className="w-full px-3 py-2 bg-gray-50 dark:bg-white/5 rounded-xl text-sm border-0 focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-zinc-100" />
              {confirmMismatch && <p className="text-xs text-red-500 mt-1">✗ Không khớp</p>}
              {confirmMatch && pwdValid && <p className="text-xs text-green-600 dark:text-green-400 mt-1">✓ Khớp</p>}
            </div>
            {error && <p className="text-xs text-red-500">{error}</p>}
            <div className="flex gap-2">
              <button type="submit" disabled={!pwdValid || !confirmMatch || loading}
                className="flex-1 py-2 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white rounded-xl text-sm font-semibold transition-colors">
                {loading ? 'Đang lưu...' : 'Lưu'}
              </button>
              <button type="button" onClick={() => { setOpen(false); setError(''); setForm({ current: '', newPwd: '', confirm: '' }) }}
                className="px-4 py-2 text-sm text-gray-500 hover:bg-gray-100 dark:hover:bg-white/5 rounded-xl transition-colors">
                Hủy
              </button>
            </div>
          </form>
        )}
      </div>
    </Section>
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

function InstallCommandTabs({ install, copy, copied }: { install: InstallCommand; copy: (s: string) => void; copied: boolean }) {
  const [tab, setTab] = useState<'windows' | 'mac' | 'linux' | 'docker'>(() => {
    if (typeof navigator === 'undefined') return 'windows'
    const ua = navigator.userAgent.toLowerCase()
    if (ua.includes('windows')) return 'windows'
    if (ua.includes('mac')) return 'mac'
    if (ua.includes('linux')) return 'linux'
    return 'windows'
  })

  // Tất cả tabs dùng cùng inject script (auto cài Node + openzca + service)
  // — KHÔNG còn 3-step manual bị quên/lỗi.
  const windowsCmd = install.windowsCommand ?? ''
  const linuxCmd = install.oneLineCommand
  const dockerCmd = install.dockerCommand ?? ''

  const current = tab === 'windows' ? windowsCmd : tab === 'docker' ? dockerCmd : linuxCmd

  const TABS: { key: typeof tab; icon: string; label: string }[] = [
    { key: 'windows', icon: '🪟', label: 'Windows' },
    { key: 'mac',     icon: '🍎', label: 'Mac' },
    { key: 'linux',   icon: '🐧', label: 'Linux/VPS' },
    { key: 'docker',  icon: '🐳', label: 'Docker' },
  ]

  return (
    <div className="px-4 py-3.5 space-y-3">
      <div className="grid grid-cols-4 gap-1 bg-gray-100 dark:bg-white/5 rounded-lg p-1">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`py-1.5 text-xs font-medium rounded-md transition-colors ${tab === t.key ? 'bg-white dark:bg-white/10 shadow-sm text-gray-900 dark:text-zinc-100' : 'text-gray-600 dark:text-zinc-400'}`}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* 3 bước siêu gọn cho mỗi platform */}
      <div className="bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/30 rounded-lg p-3 text-xs text-blue-800 dark:text-blue-300 leading-relaxed">
        {tab === 'windows' && (
          <ol className="list-decimal list-inside space-y-0.5">
            <li>Bấm <kbd className="px-1 bg-white dark:bg-white/10 rounded text-[10px]">Win</kbd> + <kbd className="px-1 bg-white dark:bg-white/10 rounded text-[10px]">X</kbd> → chọn <strong>Terminal (Admin)</strong></li>
            <li>UAC hỏi → bấm <strong>Yes</strong></li>
            <li>Click chuột phải để paste lệnh dưới → Enter → đợi ~2 phút</li>
          </ol>
        )}
        {tab === 'mac' && (
          <ol className="list-decimal list-inside space-y-0.5">
            <li>Bấm <kbd className="px-1 bg-white dark:bg-white/10 rounded text-[10px]">⌘</kbd> + <kbd className="px-1 bg-white dark:bg-white/10 rounded text-[10px]">Space</kbd> → gõ <code>Terminal</code> → Enter</li>
            <li>Paste lệnh dưới (<kbd className="px-1 bg-white dark:bg-white/10 rounded text-[10px]">⌘</kbd> + <kbd className="px-1 bg-white dark:bg-white/10 rounded text-[10px]">V</kbd>) → Enter → đợi ~2 phút</li>
          </ol>
        )}
        {tab === 'linux' && (
          <ol className="list-decimal list-inside space-y-0.5">
            <li>SSH vào VPS: <code>ssh root@&lt;ip-vps&gt;</code></li>
            <li>Paste lệnh dưới → Enter → đợi ~2 phút</li>
          </ol>
        )}
        {tab === 'docker' && (
          <ol className="list-decimal list-inside space-y-0.5">
            <li>Mở terminal có quyền docker (NAS / Mac / Windows Docker Desktop)</li>
            <li>Paste lệnh dưới → Enter → container chạy ngầm</li>
          </ol>
        )}
        <p className="mt-2 text-[11px] opacity-90">Sau khi xong → bấm "Kết nối lại" trong dashboard → quét QR.</p>
      </div>

      <div className="relative">
        <pre className="bg-gray-900 dark:bg-black/60 rounded-xl p-3 pr-20 font-mono text-[11px] text-green-400 overflow-x-auto whitespace-pre-wrap break-all select-all">{current || 'Đang tải lệnh...'}</pre>
        <button onClick={() => copy(current)} disabled={!current}
          className="absolute top-2 right-2 px-3 py-1.5 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white text-xs font-semibold rounded-md">
          {copied ? '✓ Copied' : '📋 Copy'}
        </button>
      </div>

      <Link href="/docs/install" className="block text-center py-2 text-xs text-blue-600 dark:text-blue-400 hover:underline font-medium">
        Xem hướng dẫn chi tiết step-by-step →
      </Link>

      <p className="text-[11px] text-amber-700 dark:text-amber-400 text-center">
        🔒 <strong>Chỉ ĐỌC:</strong> listener không bao giờ tự reply. Gửi tin chỉ khi bạn bấm Gửi từ dashboard.
      </p>
    </div>
  )
}
