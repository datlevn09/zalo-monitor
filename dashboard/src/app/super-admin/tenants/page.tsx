'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { getSuperAdminToken, clearSuperAdminToken, saApi } from '@/lib/super-admin'

type Tenant = {
  id: string
  name: string
  slug: string
  industry: string | null
  plan: string
  status: 'active' | 'suspended' | 'trial'
  licenseExpiresAt: string | null
  _count: { groups: number }
  owner: { name: string; email: string } | null
  messageCount: number
}

const STATUS_COLORS: Record<string, { label: string; color: string; dot: string }> = {
  active: { label: 'Hoạt động', color: 'bg-green-100 dark:bg-green-500/15 text-green-700 dark:text-green-300', dot: 'bg-green-500' },
  trial: { label: 'Dùng thử', color: 'bg-blue-100 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300', dot: 'bg-blue-500' },
  suspended: { label: 'Tạm ngưng', color: 'bg-red-100 dark:bg-red-500/15 text-red-700 dark:text-red-300', dot: 'bg-red-500' },
}

export default function TenantsPage() {
  const router = useRouter()
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    const token = getSuperAdminToken()
    if (!token) {
      router.push('/super-admin')
      return
    }
    fetchTenants()
  }, [router])

  async function fetchTenants() {
    setLoading(true)
    setError('')
    try {
      const data = await saApi<Tenant[]>('/api/super-admin/tenants')
      setTenants(data)
    } catch (err: any) {
      if (err.message === 'UNAUTHORIZED') {
        clearSuperAdminToken()
        router.push('/super-admin')
      } else {
        setError('Không thể tải danh sách khách hàng')
      }
    } finally {
      setLoading(false)
    }
  }

  function handleLogout() {
    clearSuperAdminToken()
    router.push('/super-admin')
  }

  const filtered = tenants.filter((t) => {
    const q = searchQuery.toLowerCase()
    return (
      t.name.toLowerCase().includes(q) ||
      t.slug.toLowerCase().includes(q) ||
      (t.owner?.email ?? '').toLowerCase().includes(q)
    )
  })

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-zinc-100 tracking-tight">
            Danh sách khách hàng
          </h1>
          <p className="text-sm text-gray-500 dark:text-zinc-400 mt-0.5">
            Quản lý {tenants.length} doanh nghiệp
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/super-admin/change-password"
            className="px-4 py-2 text-gray-600 dark:text-zinc-400 text-sm font-medium rounded-full hover:bg-gray-100 dark:hover:bg-white/5 transition-colors"
          >
            Đổi mật khẩu
          </Link>
          <button
            onClick={handleLogout}
            className="px-4 py-2 text-red-600 dark:text-red-400 text-sm font-medium rounded-full hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
          >
            Đăng xuất
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="mb-4">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Tìm theo tên, slug, hoặc email..."
          className="w-full px-4 py-2.5 bg-white dark:bg-zinc-900 dark:ring-1 dark:ring-white/5 rounded-xl text-sm border-0 focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-zinc-100"
        />
      </div>

      {/* Error message */}
      {error && (
        <div className="mb-4 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-xl p-4 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-16 bg-white dark:bg-zinc-900 dark:ring-1 dark:ring-white/5 rounded-2xl animate-pulse" />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && filtered.length === 0 && (
        <div className="text-center py-12">
          <div className="text-4xl mb-2">🏢</div>
          <p className="text-gray-500 dark:text-zinc-400">
            {searchQuery ? 'Không tìm thấy khách hàng nào' : 'Chưa có khách hàng nào'}
          </p>
        </div>
      )}

      {/* Tenants table */}
      {!loading && filtered.length > 0 && (
        <div className="bg-white dark:bg-zinc-900 dark:ring-1 dark:ring-white/5 rounded-2xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 dark:border-white/5">
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 dark:text-zinc-400 uppercase tracking-wide">
                    Tên
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 dark:text-zinc-400 uppercase tracking-wide">
                    Email owner
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 dark:text-zinc-400 uppercase tracking-wide">
                    Ngành
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 dark:text-zinc-400 uppercase tracking-wide">
                    Plan
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 dark:text-zinc-400 uppercase tracking-wide">
                    Hạn dùng
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 dark:text-zinc-400 uppercase tracking-wide">
                    Trạng thái
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 dark:text-zinc-400 uppercase tracking-wide">
                    Số nhóm
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 dark:text-zinc-400 uppercase tracking-wide">
                    Hành động
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-white/5">
                {filtered.map((tenant) => {
                  const statusCfg = STATUS_COLORS[tenant.status] || STATUS_COLORS.active
                  return (
                    <tr key={tenant.id} className="hover:bg-gray-50 dark:hover:bg-white/5 transition-colors">
                      <td className="px-6 py-4">
                        <p className="text-sm font-medium text-gray-900 dark:text-zinc-100">
                          {tenant.name}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-zinc-400 mt-0.5">
                          {tenant.slug}
                        </p>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-700 dark:text-zinc-300">
                        {tenant.owner?.email ?? '—'}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-700 dark:text-zinc-300">
                        {tenant.industry ?? '—'}
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-block px-2.5 py-1 bg-gray-100 dark:bg-white/10 text-gray-700 dark:text-zinc-300 text-xs font-medium rounded-lg uppercase">
                          {tenant.plan}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-700 dark:text-zinc-300">
                        {tenant.licenseExpiresAt
                          ? new Date(tenant.licenseExpiresAt).toLocaleDateString('vi-VN')
                          : '—'}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-block px-2.5 py-1 rounded-lg text-xs font-medium ${statusCfg.color}`}>
                          {statusCfg.label}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-700 dark:text-zinc-300 tabular-nums">
                        {tenant._count.groups}
                      </td>
                      <td className="px-6 py-4">
                        <Link
                          href={`/super-admin/tenants/${tenant.id}`}
                          className="inline-flex px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white text-xs font-medium rounded-lg transition-colors"
                        >
                          Chi tiết
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
