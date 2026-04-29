'use client'

import { useEffect, useState } from 'react'
import { api, setToken, setTenantId } from '@/lib/api'

type TenantItem = {
  userId: string
  role: string
  tenantId: string
  tenantName: string
  slug: string
  plan: string
  isCurrent: boolean
}

/**
 * Tenant switcher — hiện trên header dashboard khi user có >1 doanh nghiệp.
 * Multi-tenant v2: 1 email có thể own nhiều tenant (nhiều Zalo / nhiều DN).
 *
 * Click 1 tenant → /auth/switch-tenant → re-issue JWT → reload dashboard với
 * data của tenant đó.
 *
 * "+ Thêm doanh nghiệp / Zalo mới" → modal nhập tên DN → /auth/add-tenant.
 *
 * Phase 2 (sau): chuyển sang multi-active aggregation (chips toggle xem
 * nhiều tenant cùng lúc) — cần refactor query backend.
 */
export function TenantSwitcher() {
  const [tenants, setTenants] = useState<TenantItem[]>([])
  const [open, setOpen] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [companyName, setCompanyName] = useState('')
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)

  useEffect(() => {
    api<TenantItem[]>('/api/auth/my-tenants').then(setTenants).catch(() => undefined)
  }, [])

  const current = tenants.find(t => t.isCurrent)
  const others = tenants.filter(t => !t.isCurrent)

  // Chỉ ẩn nếu user chưa có nhiều tenant VÀ chưa muốn add — mặc định luôn hiện nút "Thêm DN"
  if (tenants.length === 0) return null

  async function switchTo(tenantId: string) {
    try {
      const res = await api<{ token: string; user: any; tenant: { id: string; name: string; slug: string } }>(
        '/api/auth/switch-tenant',
        { method: 'POST', body: JSON.stringify({ tenantId }) }
      )
      setToken(res.token)
      setTenantId(res.tenant.id)
      // Xoá board context cũ (nếu có) → tránh stale localStorage
      if (typeof window !== 'undefined') localStorage.removeItem('zm:boardUserId')
      window.location.reload()
    } catch (e: any) {
      alert('Không chuyển được: ' + (e?.message ?? 'lỗi'))
    }
  }

  async function addTenant() {
    if (!companyName.trim()) return
    setAdding(true); setAddError(null)
    try {
      const res = await api<{ tenantId: string }>('/api/auth/add-tenant', {
        method: 'POST',
        body: JSON.stringify({ companyName: companyName.trim() }),
      })
      // Tenant mới active=false (chờ admin) → nhắc user
      alert(`✓ Đã tạo "${companyName}". Tenant đang chờ admin kích hoạt — sau khi active, bạn có thể switch sang.`)
      setCompanyName('')
      setShowAdd(false)
      // Reload list
      const list = await api<TenantItem[]>('/api/auth/my-tenants')
      setTenants(list)
    } catch (e: any) {
      setAddError(e?.message ?? 'Lỗi khi tạo tenant')
    } finally {
      setAdding(false)
    }
  }

  return (
    <>
      <div className="relative">
        <button
          onClick={() => setOpen(o => !o)}
          className="flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-white/10 hover:bg-gray-50 dark:hover:bg-white/15 border border-gray-200 dark:border-white/10 rounded-full text-xs font-medium text-gray-800 dark:text-zinc-200 transition-colors"
          title="Đổi doanh nghiệp"
        >
          <span className="w-5 h-5 rounded-md bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-[10px] font-bold shrink-0">
            {current?.tenantName?.[0]?.toUpperCase() ?? '?'}
          </span>
          <span className="max-w-[140px] truncate">{current?.tenantName ?? '...'}</span>
          {tenants.length > 1 && (
            <span className="text-[10px] px-1.5 py-0.5 bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300 rounded-full font-semibold">
              {tenants.length}
            </span>
          )}
          <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <div className="absolute right-0 top-full mt-1.5 z-50 bg-white dark:bg-zinc-900 ring-1 ring-gray-200 dark:ring-white/10 rounded-2xl shadow-lg overflow-hidden min-w-[260px]">
              {/* Current tenant */}
              {current && (
                <div className="px-3 py-2.5 bg-blue-50 dark:bg-blue-500/10 border-b border-gray-100 dark:border-white/5">
                  <p className="text-[10px] font-semibold uppercase text-blue-700 dark:text-blue-300 mb-0.5">Đang dùng</p>
                  <p className="text-sm font-semibold text-gray-900 dark:text-zinc-100 truncate">{current.tenantName}</p>
                  <p className="text-[10px] text-gray-500 dark:text-zinc-400">{current.role} · {current.plan}</p>
                </div>
              )}

              {/* Others */}
              {others.length > 0 && (
                <div className="max-h-64 overflow-y-auto">
                  {others.map(t => (
                    <button
                      key={t.tenantId}
                      onClick={() => switchTo(t.tenantId)}
                      className="w-full text-left px-3 py-2.5 hover:bg-gray-50 dark:hover:bg-white/5 border-b border-gray-100 dark:border-white/5 last:border-0 transition-colors"
                    >
                      <p className="text-sm font-medium text-gray-900 dark:text-zinc-100 truncate">{t.tenantName}</p>
                      <p className="text-[10px] text-gray-500 dark:text-zinc-400">{t.role} · {t.plan}</p>
                    </button>
                  ))}
                </div>
              )}

              {/* Add new tenant */}
              <button
                onClick={() => { setOpen(false); setShowAdd(true) }}
                className="w-full text-left px-3 py-2.5 bg-emerald-50 dark:bg-emerald-500/10 hover:bg-emerald-100 dark:hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 text-sm font-medium transition-colors flex items-center gap-2"
              >
                <span className="text-base leading-none">+</span>
                <span>Thêm doanh nghiệp / Zalo mới</span>
              </button>
            </div>
          </>
        )}
      </div>

      {/* Modal add tenant */}
      {showAdd && (
        <div className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center px-4" onClick={() => !adding && setShowAdd(false)}>
          <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl max-w-md w-full p-5" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-gray-900 dark:text-zinc-100 mb-2">Thêm doanh nghiệp / Zalo mới</h3>
            <p className="text-xs text-gray-600 dark:text-zinc-400 mb-3">
              Email và mật khẩu giữ nguyên — bạn có thể switch giữa các DN bất kỳ lúc nào.
            </p>

            {/* Cảnh báo Zalo PC 1-account/lúc */}
            <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-lg">
              <p className="text-xs font-semibold text-amber-800 dark:text-amber-300 mb-1">⚠️ Lưu ý quan trọng</p>
              <p className="text-[11px] text-amber-700 dark:text-amber-300 leading-relaxed">
                Zalo PC chỉ login được <strong>1 account / 1 thời điểm</strong>. Nếu bạn muốn theo dõi 2 Zalo trên cùng 1 máy, phải <strong>tắt Zalo PC chính</strong> khi quét QR cho profile khác.
                <br /><br />
                <strong>Khuyến nghị</strong>: mỗi Zalo cài listener trên 1 máy riêng (PC khác / VPS / NAS) — đơn giản, không đụng nhau.
              </p>
            </div>

            <label className="block text-xs font-medium text-gray-700 dark:text-zinc-300 mb-1.5">Tên doanh nghiệp / Zalo</label>
            <input
              type="text"
              value={companyName}
              onChange={e => setCompanyName(e.target.value)}
              placeholder="Cty ABC / Zalo Sales"
              className="w-full px-3 py-2 bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-white/10 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mb-3"
              disabled={adding}
              autoFocus
            />
            {addError && <p className="text-xs text-red-600 dark:text-red-400 mb-3">{addError}</p>}

            <div className="flex gap-2 justify-end">
              <button
                onClick={() => { if (!adding) setShowAdd(false) }}
                disabled={adding}
                className="px-4 py-2 text-sm text-gray-700 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-white/5 rounded-lg disabled:opacity-50"
              >Huỷ</button>
              <button
                onClick={addTenant}
                disabled={adding || !companyName.trim()}
                className="px-4 py-2 text-sm bg-blue-500 hover:bg-blue-600 disabled:bg-blue-300 text-white font-medium rounded-lg"
              >{adding ? 'Đang tạo...' : 'Tạo'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
