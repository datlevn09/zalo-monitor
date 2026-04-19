'use client'

import { useEffect, useState } from 'react'
import {
  getSuperAdminToken,
  setSuperAdminToken,
  clearSuperAdminToken,
  saApi,
} from '@/lib/super-admin'

type TenantStatus = 'active' | 'trial' | 'expired' | 'suspended'

type Tenant = {
  id: string
  name: string
  slug: string
  industry: string | null
  plan: string
  active: boolean
  suspendedReason: string | null
  licenseKey: string | null
  licenseExpiresAt: string | null
  contactName: string | null
  contactPhone: string | null
  contactEmail: string | null
  notes: string | null
  createdAt: string
  maxGroups: number
  maxMessagesPerMonth: number
  messagesThisMonth: number
  usageResetAt: string
  setupDone: boolean
  stats: { groups: number; users: number; customers: number }
  status: TenantStatus
}

type Metrics = {
  totals: {
    tenants: number
    active: number
    suspended: number
    expired: number
    groups: number
    messages: number
    customers: number
  }
  byPlan: { plan: string; count: number }[]
  expiringSoon: { id: string; name: string; licenseExpiresAt: string; contactName: string | null }[]
}

const STATUS_CFG: Record<TenantStatus, { label: string; color: string; dot: string }> = {
  active:    { label: 'Hoạt động',  color: 'bg-green-100 dark:bg-green-500/15 text-green-700 dark:text-green-300', dot: 'bg-green-500' },
  trial:     { label: 'Dùng thử',   color: 'bg-blue-100 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300',     dot: 'bg-blue-500' },
  expired:   { label: 'Hết hạn',    color: 'bg-orange-100 dark:bg-orange-500/15 text-orange-700 dark:text-orange-300', dot: 'bg-orange-500' },
  suspended: { label: 'Tạm ngưng',  color: 'bg-red-100 dark:bg-red-500/15 text-red-700 dark:text-red-300',         dot: 'bg-red-500' },
}

export default function SuperAdminPage() {
  const [authed, setAuthed] = useState(false)
  const [tokenInput, setTokenInput] = useState('')
  const [tokenError, setTokenError] = useState('')
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<Tenant | null>(null)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<'' | TenantStatus>('')

  useEffect(() => {
    if (getSuperAdminToken()) {
      setAuthed(true)
      load()
    }
  }, [])

  async function load() {
    setLoading(true)
    try {
      const [t, m] = await Promise.all([
        saApi<Tenant[]>('/api/super-admin/tenants'),
        saApi<Metrics>('/api/super-admin/metrics'),
      ])
      setTenants(t)
      setMetrics(m)
    } catch (e: any) {
      if (e.message === 'UNAUTHORIZED') {
        setAuthed(false)
        setTokenError('Token không hợp lệ')
      }
    } finally {
      setLoading(false)
    }
  }

  async function login(e: React.FormEvent) {
    e.preventDefault()
    setTokenError('')
    setSuperAdminToken(tokenInput.trim())
    try {
      await saApi('/api/super-admin/metrics')
      setAuthed(true)
      load()
    } catch {
      clearSuperAdminToken()
      setTokenError('Token không hợp lệ')
    }
  }

  function logout() {
    clearSuperAdminToken()
    setAuthed(false)
    setTenants([])
    setMetrics(null)
  }

  // Login screen
  if (!authed) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <form onSubmit={login} className="bg-white dark:bg-zinc-900 dark:ring-1 dark:ring-white/10 rounded-3xl shadow-xl p-8 w-full max-w-md space-y-5">
          <div className="text-center">
            <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center text-2xl">🛡️</div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-zinc-100">Super Admin</h1>
            <p className="text-sm text-gray-500 dark:text-zinc-400 mt-1">Quản lý toàn hệ thống</p>
          </div>
          <div>
            <label className="text-xs text-gray-500 dark:text-zinc-400 mb-1.5 block font-medium">Token</label>
            <input
              type="password"
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              placeholder="SUPER_ADMIN_TOKEN"
              className="w-full px-4 py-2.5 bg-gray-50 dark:bg-white/5 rounded-xl text-sm border-0 focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus
            />
            {tokenError && <p className="text-xs text-red-500 mt-1.5">{tokenError}</p>}
          </div>
          <button type="submit" className="w-full py-2.5 bg-blue-500 hover:bg-blue-600 text-white rounded-xl text-sm font-medium">
            Đăng nhập
          </button>
          <p className="text-[11px] text-gray-400 dark:text-zinc-500 text-center">
            Token được cấu hình qua <code className="bg-gray-100 dark:bg-white/10 px-1 rounded">SUPER_ADMIN_TOKEN</code> trong .env server
          </p>
        </form>
      </div>
    )
  }

  const filtered = tenants.filter((t) => {
    if (filter && t.status !== filter) return false
    if (query) {
      const q = query.toLowerCase()
      if (
        !t.name.toLowerCase().includes(q) &&
        !t.slug.toLowerCase().includes(q) &&
        !(t.contactName ?? '').toLowerCase().includes(q) &&
        !(t.contactPhone ?? '').toLowerCase().includes(q)
      ) return false
    }
    return true
  })

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-zinc-100 tracking-tight">🛡️ Super Admin</h1>
          <p className="text-sm text-gray-500 dark:text-zinc-400 mt-0.5">Quản lý toàn bộ khách hàng (tenants)</p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="px-4 py-2 bg-white dark:bg-white/10 border border-gray-200 dark:border-white/10 text-gray-700 dark:text-zinc-300 text-sm font-medium rounded-full hover:bg-gray-50 dark:hover:bg-white/15">
            ↻ Refresh
          </button>
          <button onClick={logout} className="px-4 py-2 text-red-500 dark:text-red-400 text-sm font-medium rounded-full hover:bg-red-50 dark:hover:bg-red-500/10">
            Đăng xuất
          </button>
        </div>
      </div>

      {/* Metrics */}
      {metrics && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
          <Stat emoji="🏢" label="Tenants"       value={metrics.totals.tenants} />
          <Stat emoji="✅" label="Đang chạy"      value={metrics.totals.active} tint="bg-green-50 dark:bg-green-500/10" />
          <Stat emoji="⚠️" label="Hết hạn"        value={metrics.totals.expired} tint="bg-orange-50 dark:bg-orange-500/10" />
          <Stat emoji="📨" label="Total msg"      value={metrics.totals.messages} tint="bg-blue-50 dark:bg-blue-500/10" />
        </div>
      )}

      {/* Expiring soon */}
      {metrics && metrics.expiringSoon.length > 0 && (
        <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-2xl p-4 mb-5">
          <p className="text-sm font-semibold text-amber-900 dark:text-amber-200 mb-2">⏰ Sắp hết hạn (7 ngày)</p>
          <div className="space-y-1">
            {metrics.expiringSoon.map((t) => (
              <p key={t.id} className="text-xs text-amber-800 dark:text-amber-300">
                • {t.name} {t.contactName ? `(${t.contactName})` : ''} — hạn{' '}
                <strong>{new Date(t.licenseExpiresAt).toLocaleDateString('vi-VN')}</strong>
              </p>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-2 mb-3 flex-wrap">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Tìm tên DN / slug / người liên hệ..."
          className="flex-1 min-w-60 px-4 py-2 bg-white dark:bg-zinc-900 dark:ring-1 dark:ring-white/5 rounded-full text-sm border-0 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        {(['', 'active', 'trial', 'expired', 'suspended'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium ${
              filter === s
                ? 'bg-gray-900 dark:bg-white/15 text-white'
                : 'bg-white dark:bg-white/10 text-gray-700 dark:text-zinc-300'
            }`}
          >
            {s === '' ? `Tất cả (${tenants.length})` : STATUS_CFG[s].label}
          </button>
        ))}
      </div>

      {/* Tenants table */}
      <div className="bg-white dark:bg-zinc-900 dark:ring-1 dark:ring-white/5 rounded-2xl overflow-hidden">
        {loading && <div className="p-8 text-center text-gray-400 dark:text-zinc-500 text-sm">Đang tải...</div>}
        {!loading && filtered.length === 0 && (
          <div className="p-10 text-center text-gray-400 dark:text-zinc-500 text-sm">Không có tenant nào</div>
        )}
        <div className="divide-y divide-gray-100 dark:divide-white/5">
          {filtered.map((t) => {
            const cfg = STATUS_CFG[t.status]
            const usagePct = t.maxMessagesPerMonth > 0
              ? Math.min(100, (t.messagesThisMonth / t.maxMessagesPerMonth) * 100)
              : 0
            return (
              <button
                key={t.id}
                onClick={() => setSelected(t)}
                className="w-full text-left px-4 py-3.5 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full ${cfg.dot}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-gray-900 dark:text-zinc-100 truncate">{t.name}</p>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${cfg.color}`}>{cfg.label}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-white/10 text-gray-600 dark:text-zinc-400 font-medium uppercase">{t.plan}</span>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-zinc-400 mt-0.5 truncate">
                      {t.contactName ? `${t.contactName} · ` : ''}
                      {t.contactPhone ?? ''}
                      {t.licenseExpiresAt ? ` · hạn ${new Date(t.licenseExpiresAt).toLocaleDateString('vi-VN')}` : ' · chưa có license'}
                    </p>
                  </div>
                  <div className="text-right text-xs text-gray-500 dark:text-zinc-400 tabular-nums hidden sm:block">
                    <div>{t.stats.groups} nhóm · {t.stats.customers} KH</div>
                    <div className="mt-0.5">
                      {t.messagesThisMonth.toLocaleString('vi-VN')}/{t.maxMessagesPerMonth.toLocaleString('vi-VN')} msg
                    </div>
                    <div className="w-24 h-1 bg-gray-100 dark:bg-white/10 rounded-full overflow-hidden mt-1 ml-auto">
                      <div className={`h-full ${usagePct > 90 ? 'bg-red-500' : usagePct > 70 ? 'bg-amber-500' : 'bg-blue-500'}`} style={{ width: `${usagePct}%` }} />
                    </div>
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Detail drawer */}
      {selected && (
        <TenantDrawer
          tenant={selected}
          onClose={() => setSelected(null)}
          onChanged={(t) => {
            setSelected(t)
            load()
          }}
        />
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════

function Stat({ emoji, label, value, tint }: { emoji: string; label: string; value: number; tint?: string }) {
  return (
    <div className={`${tint ?? 'bg-white dark:bg-zinc-900 dark:ring-1 dark:ring-white/5'} rounded-2xl p-3.5`}>
      <div className="text-lg">{emoji}</div>
      <p className="text-xs text-gray-500 dark:text-zinc-400 mt-0.5">{label}</p>
      <p className="text-xl font-bold text-gray-900 dark:text-zinc-100 tabular-nums">{value.toLocaleString('vi-VN')}</p>
    </div>
  )
}

function TenantDrawer({
  tenant,
  onClose,
  onChanged,
}: {
  tenant: Tenant
  onClose: () => void
  onChanged: (t: Tenant) => void
}) {
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({
    plan: tenant.plan,
    maxGroups: tenant.maxGroups,
    maxMessagesPerMonth: tenant.maxMessagesPerMonth,
    contactName: tenant.contactName ?? '',
    contactPhone: tenant.contactPhone ?? '',
    contactEmail: tenant.contactEmail ?? '',
    notes: tenant.notes ?? '',
  })
  const [renewMonths, setRenewMonths] = useState(1)

  async function saveInfo() {
    setBusy(true)
    try {
      const updated = await saApi<Tenant>(`/api/super-admin/tenants/${tenant.id}`, {
        method: 'PATCH',
        body: JSON.stringify(form),
      })
      onChanged({ ...tenant, ...updated } as Tenant)
    } finally {
      setBusy(false)
    }
  }

  async function renew() {
    setBusy(true)
    try {
      const updated = await saApi<Tenant>(`/api/super-admin/tenants/${tenant.id}/license`, {
        method: 'POST',
        body: JSON.stringify({ months: renewMonths }),
      })
      onChanged({ ...tenant, ...updated } as Tenant)
    } finally {
      setBusy(false)
    }
  }

  async function regenerateKey() {
    if (!confirm('Tạo license key mới? Key cũ sẽ mất hiệu lực.')) return
    setBusy(true)
    try {
      const updated = await saApi<Tenant>(`/api/super-admin/tenants/${tenant.id}/license`, {
        method: 'POST',
        body: JSON.stringify({ regenerate: true }),
      })
      onChanged({ ...tenant, ...updated } as Tenant)
    } finally {
      setBusy(false)
    }
  }

  async function suspend() {
    const reason = prompt('Lý do tạm ngưng?', 'Hết hạn / chưa thanh toán')
    if (reason === null) return
    setBusy(true)
    try {
      const updated = await saApi<Tenant>(`/api/super-admin/tenants/${tenant.id}/suspend`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      })
      onChanged({ ...tenant, ...updated } as Tenant)
    } finally {
      setBusy(false)
    }
  }

  async function activate() {
    setBusy(true)
    try {
      const updated = await saApi<Tenant>(`/api/super-admin/tenants/${tenant.id}/activate`, {
        method: 'POST',
      })
      onChanged({ ...tenant, ...updated } as Tenant)
    } finally {
      setBusy(false)
    }
  }

  async function resetUsage() {
    if (!confirm('Reset counter tin nhắn tháng về 0?')) return
    setBusy(true)
    try {
      const updated = await saApi<Tenant>(`/api/super-admin/tenants/${tenant.id}/reset-usage`, {
        method: 'POST',
      })
      onChanged({ ...tenant, ...updated } as Tenant)
    } finally {
      setBusy(false)
    }
  }

  async function del() {
    const ok = prompt(`XOÁ VĨNH VIỄN "${tenant.name}"? Gõ DELETE để xác nhận:`)
    if (ok !== 'DELETE') return
    setBusy(true)
    try {
      await saApi(`/api/super-admin/tenants/${tenant.id}`, {
        method: 'DELETE',
        body: JSON.stringify({ confirm: 'DELETE' }),
      })
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-end md:items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white dark:bg-zinc-900 dark:ring-1 dark:ring-white/10 rounded-3xl w-full max-w-2xl max-h-[90vh] overflow-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-gray-300 dark:bg-white/20 rounded-full" />
        </div>
        <div className="p-6 space-y-5">
          {/* Title */}
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-zinc-100">{tenant.name}</h2>
              <p className="text-xs text-gray-500 dark:text-zinc-400 mt-0.5 font-mono">{tenant.id}</p>
            </div>
            <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 dark:bg-white/10 text-gray-500 dark:text-zinc-400 hover:bg-gray-200 dark:hover:bg-white/15">×</button>
          </div>

          {/* License */}
          <Section title="🔑 Giấy phép">
            <div className="space-y-2.5">
              <Row label="License key">
                <code className="text-xs bg-gray-100 dark:bg-white/10 text-gray-900 dark:text-zinc-100 px-2 py-0.5 rounded font-mono">
                  {tenant.licenseKey ?? '— chưa cấp —'}
                </code>
              </Row>
              <Row label="Hạn sử dụng">
                <span className="text-sm text-gray-900 dark:text-zinc-100">
                  {tenant.licenseExpiresAt
                    ? new Date(tenant.licenseExpiresAt).toLocaleDateString('vi-VN')
                    : 'Vĩnh viễn / chưa cấp'}
                </span>
              </Row>
              <div className="flex gap-2 pt-1">
                <select
                  value={renewMonths}
                  onChange={(e) => setRenewMonths(Number(e.target.value))}
                  className="text-xs bg-gray-50 dark:bg-white/10 rounded-lg px-2 py-1.5 text-gray-700 dark:text-zinc-300"
                >
                  <option value={1}>+1 tháng</option>
                  <option value={3}>+3 tháng</option>
                  <option value={6}>+6 tháng</option>
                  <option value={12}>+12 tháng</option>
                </select>
                <button onClick={renew} disabled={busy} className="px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white text-xs font-medium rounded-lg disabled:opacity-50">
                  Gia hạn
                </button>
                <button onClick={regenerateKey} disabled={busy} className="px-3 py-1.5 bg-gray-100 dark:bg-white/10 hover:bg-gray-200 dark:hover:bg-white/15 text-gray-700 dark:text-zinc-300 text-xs font-medium rounded-lg">
                  Cấp key mới
                </button>
              </div>
            </div>
          </Section>

          {/* Status */}
          <Section title="⚙️ Trạng thái">
            <div className="flex gap-2">
              {tenant.active ? (
                <button onClick={suspend} disabled={busy} className="flex-1 py-2 bg-red-500 hover:bg-red-600 text-white text-sm font-medium rounded-xl disabled:opacity-50">
                  Tạm ngưng
                </button>
              ) : (
                <button onClick={activate} disabled={busy} className="flex-1 py-2 bg-green-500 hover:bg-green-600 text-white text-sm font-medium rounded-xl disabled:opacity-50">
                  Kích hoạt lại
                </button>
              )}
              <button onClick={resetUsage} disabled={busy} className="flex-1 py-2 bg-gray-100 dark:bg-white/10 hover:bg-gray-200 dark:hover:bg-white/15 text-gray-700 dark:text-zinc-300 text-sm font-medium rounded-xl">
                Reset usage
              </button>
            </div>
            {tenant.suspendedReason && (
              <p className="text-xs text-red-600 dark:text-red-400 mt-2">Lý do: {tenant.suspendedReason}</p>
            )}
          </Section>

          {/* Plan / limits */}
          <Section title="📊 Plan & Giới hạn">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Plan">
                <select
                  value={form.plan}
                  onChange={(e) => setForm({ ...form, plan: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-50 dark:bg-white/5 rounded-lg text-sm text-gray-900 dark:text-zinc-100"
                >
                  <option value="free">Free</option>
                  <option value="basic">Basic</option>
                  <option value="pro">Pro</option>
                  <option value="enterprise">Enterprise</option>
                </select>
              </Field>
              <Field label="Nhóm tối đa">
                <input
                  type="number"
                  value={form.maxGroups}
                  onChange={(e) => setForm({ ...form, maxGroups: Number(e.target.value) })}
                  className="w-full px-3 py-2 bg-gray-50 dark:bg-white/5 rounded-lg text-sm text-gray-900 dark:text-zinc-100"
                />
              </Field>
              <Field label="Msg/tháng">
                <input
                  type="number"
                  value={form.maxMessagesPerMonth}
                  onChange={(e) => setForm({ ...form, maxMessagesPerMonth: Number(e.target.value) })}
                  className="w-full px-3 py-2 bg-gray-50 dark:bg-white/5 rounded-lg text-sm text-gray-900 dark:text-zinc-100"
                />
              </Field>
              <Field label="Đã dùng tháng này">
                <p className="px-3 py-2 text-sm text-gray-700 dark:text-zinc-300 tabular-nums">
                  {tenant.messagesThisMonth.toLocaleString('vi-VN')}
                </p>
              </Field>
            </div>
          </Section>

          {/* Contact */}
          <Section title="📞 Liên hệ">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Tên người liên hệ">
                <input
                  value={form.contactName}
                  onChange={(e) => setForm({ ...form, contactName: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-50 dark:bg-white/5 rounded-lg text-sm text-gray-900 dark:text-zinc-100"
                />
              </Field>
              <Field label="Số điện thoại">
                <input
                  value={form.contactPhone}
                  onChange={(e) => setForm({ ...form, contactPhone: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-50 dark:bg-white/5 rounded-lg text-sm text-gray-900 dark:text-zinc-100"
                />
              </Field>
              <Field label="Email" full>
                <input
                  value={form.contactEmail}
                  onChange={(e) => setForm({ ...form, contactEmail: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-50 dark:bg-white/5 rounded-lg text-sm text-gray-900 dark:text-zinc-100"
                />
              </Field>
              <Field label="Ghi chú nội bộ" full>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  rows={2}
                  className="w-full px-3 py-2 bg-gray-50 dark:bg-white/5 rounded-lg text-sm text-gray-900 dark:text-zinc-100"
                />
              </Field>
            </div>
          </Section>

          <div className="flex gap-2 pt-2 border-t border-gray-100 dark:border-white/5">
            <button onClick={saveInfo} disabled={busy} className="flex-1 py-2.5 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded-xl disabled:opacity-50">
              {busy ? 'Đang lưu...' : 'Lưu thay đổi'}
            </button>
            <button onClick={del} disabled={busy} className="px-4 py-2.5 text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 text-sm font-medium rounded-xl">
              Xoá
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold text-gray-500 dark:text-zinc-400 uppercase tracking-wider mb-2">{title}</p>
      <div className="bg-gray-50 dark:bg-white/5 rounded-2xl p-4">{children}</div>
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs text-gray-500 dark:text-zinc-400 shrink-0">{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  )
}

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <div className={full ? 'col-span-2' : ''}>
      <label className="text-xs text-gray-500 dark:text-zinc-400 block mb-1">{label}</label>
      {children}
    </div>
  )
}
