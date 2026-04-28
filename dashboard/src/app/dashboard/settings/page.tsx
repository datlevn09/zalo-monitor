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
  monitorDMs: boolean
  allowedDMIds: string[]
}

type InstallCommand = { oneLineCommand: string; dockerCommand: string }

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
                  ? <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold bg-green-100 dark:bg-green-500/20 text-green-700 dark:text-green-400 rounded-full">● Đang kết nối</span>
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
          description="Mỗi người tự quyết có theo dõi DM trên Zalo CÁ NHÂN của mình không. Cài đặt này chỉ áp dụng cho tin nhắn từ Zalo của bạn, không ảnh hưởng người khác."
        >
          <div className="flex items-center gap-3 px-4 py-3.5">
            <div className="w-10 h-10 rounded-2xl bg-amber-500 flex items-center justify-center text-white font-bold shrink-0">
              💬
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900 dark:text-zinc-100">Theo dõi tin nhắn 1-1 (DM) của tôi</p>
              <p className="text-xs text-gray-500 dark:text-zinc-400 mt-0.5">
                Chỉ bật nếu bạn bán hàng qua Zalo cá nhân. Chat với vợ/bạn/gia đình cũng sẽ bị lưu.
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

      {/* Save indicator */}
      {saved && (
        <div className="fixed bottom-20 md:bottom-8 left-1/2 -translate-x-1/2 bg-gray-900 text-white px-4 py-2 rounded-full text-sm shadow-lg z-50 animate-in fade-in slide-in-from-bottom-2">
          ✓ Đã lưu
        </div>
      )}

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
  const [tab, setTab] = useState<'linux' | 'docker' | 'mac'>('linux')

  // Build Docker command từ oneLineCommand (extract URL, parse query)
  const dockerCmd = (() => {
    const m = install.oneLineCommand.match(/inject\.sh\?([^"' ]+)/)
    if (!m) return install.dockerCommand || ''
    const params = new URLSearchParams(m[1])
    const tenantId = params.get('tenantId') || ''
    const userId = params.get('userId')
    const apiUrl = install.oneLineCommand.match(/https:\/\/[^\/]+/)?.[0] || 'https://api.datthongdong.com'
    return `docker run -d --name zalo-listener \\
  -v zalo-data:/home/node/.openzca \\
  -e BACKEND_URL=${apiUrl} \\
  -e WEBHOOK_SECRET=<secret-từ-team> \\
  -e TENANT_ID=${tenantId} \\
  --restart unless-stopped \\
  datlevn09/zalo-monitor-listener:latest

# Login Zalo (lần đầu, scan QR):
docker exec -it zalo-listener openzca --profile zalo-monitor auth login`
  })()

  const apiUrl = install.oneLineCommand.match(/https:\/\/[^\/]+/)?.[0] || 'https://api.datthongdong.com'
  const tenantId = install.oneLineCommand.match(/tenantId=([^&"' ]+)/)?.[1] || '<tenant-id>'
  const macCmd = `# 1. Cài Node + openzca
brew install node
npm install -g openzca

# 2. Login Zalo (scan QR)
openzca --profile zalo-monitor auth login

# 3. Tải listener + chạy
curl -O ${apiUrl}/api/setup/hook-files/zalo-listener.mjs
BACKEND_URL=${apiUrl} \\
WEBHOOK_SECRET=<secret-từ-team> \\
TENANT_ID=${tenantId} \\
node zalo-listener.mjs`

  const current = tab === 'linux' ? install.oneLineCommand : tab === 'docker' ? dockerCmd : macCmd

  return (
    <div className="px-4 py-3.5 space-y-3">
      <div className="flex gap-1 bg-gray-100 dark:bg-white/5 rounded-lg p-1">
        <button onClick={() => setTab('linux')}
          className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${tab === 'linux' ? 'bg-white dark:bg-white/10 shadow-sm text-gray-900 dark:text-zinc-100' : 'text-gray-600 dark:text-zinc-400'}`}>
          🐧 Linux VPS
        </button>
        <button onClick={() => setTab('docker')}
          className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${tab === 'docker' ? 'bg-white dark:bg-white/10 shadow-sm text-gray-900 dark:text-zinc-100' : 'text-gray-600 dark:text-zinc-400'}`}>
          🐳 Docker / NAS
        </button>
        <button onClick={() => setTab('mac')}
          className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${tab === 'mac' ? 'bg-white dark:bg-white/10 shadow-sm text-gray-900 dark:text-zinc-100' : 'text-gray-600 dark:text-zinc-400'}`}>
          🍎 Mac/Desktop
        </button>
      </div>

      <pre className="bg-gray-900 dark:bg-black/60 rounded-xl p-3 font-mono text-[11px] text-green-400 overflow-x-auto whitespace-pre-wrap break-all select-all">{current}</pre>

      <button onClick={() => copy(current)}
        className="w-full py-2 bg-blue-500 hover:bg-blue-600 text-white text-xs font-medium rounded-lg">
        {copied ? '✓ Đã copy' : '📋 Copy lệnh'}
      </button>

      <p className="text-[11px] text-gray-500 dark:text-zinc-400">
        {tab === 'linux' && '→ SSH vào VPS Linux → paste 1 lệnh → tự cài Node + openzca + systemd service.'}
        {tab === 'docker' && '→ Chạy trên NAS Synology / Windows / mọi nơi có Docker. Sau đó docker exec để login Zalo.'}
        {tab === 'mac' && '→ Cài Node bằng Homebrew, chạy node trong terminal. Để chạy ngầm dùng pm2 hoặc launchd.'}
      </p>
      <p className="text-[11px] text-amber-700 dark:text-amber-400">
        🔒 <strong>Chỉ ĐỌC:</strong> listener không bao giờ tự reply. Gửi tin chỉ khi bạn bấm Gửi từ dashboard.
      </p>
    </div>
  )
}
