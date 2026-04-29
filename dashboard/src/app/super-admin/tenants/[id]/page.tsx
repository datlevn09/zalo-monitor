'use client'

import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { saApi } from '@/lib/super-admin'

type TenantDetail = {
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
  setupDone: boolean
  createdAt: string
  maxGroups: number
  maxMessagesPerMonth: number
  maxBoardViewers: number
  maxHistorySyncDepth: number
  messagesThisMonth: number
  usageResetAt: string | null
  enabledChannels: string[]
  hostingMode: 'self-hosted' | 'saas'
  owner: { id: string; name: string; email: string; role: string; createdAt: string } | null
  users: Array<{ id: string; name: string; email: string; role: string; createdAt: string }>
  stats: { groups: number; users: number; customers: number; alerts: number }
  groupsByChannel: Array<{ channel: string; count: number }>
  status: string
}

export default function TenantDetailPage() {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const id = params?.id as string
  const [data, setData] = useState<TenantDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [acting, setActing] = useState<string | null>(null)

  async function reload() {
    try {
      const d = await saApi<TenantDetail>(`/api/super-admin/tenants/${id}`)
      setData(d)
      setError(null)
    } catch (e: any) {
      if (e.message === 'UNAUTHORIZED' || e.message === 'NO_TOKEN') {
        router.push('/super-admin')
        return
      }
      setError(e?.message ?? 'Lỗi tải dữ liệu')
    }
  }

  useEffect(() => {
    if (!id) return
    reload()
  }, [id])

  async function suspend() {
    const reason = prompt('Lý do tạm ngưng?')
    if (!reason) return
    setActing('suspend')
    try { await saApi(`/api/super-admin/tenants/${id}/suspend`, { method: 'POST', body: JSON.stringify({ reason }) }); await reload() }
    catch (e: any) { alert(e?.message ?? 'Lỗi') }
    finally { setActing(null) }
  }
  async function activate() {
    setActing('activate')
    try { await saApi(`/api/super-admin/tenants/${id}/activate`, { method: 'POST' }); await reload() }
    catch (e: any) { alert(e?.message ?? 'Lỗi') }
    finally { setActing(null) }
  }
  async function resetUsage() {
    if (!confirm('Reset counter messagesThisMonth về 0?')) return
    setActing('reset')
    try { await saApi(`/api/super-admin/tenants/${id}/reset-usage`, { method: 'POST' }); await reload() }
    catch (e: any) { alert(e?.message ?? 'Lỗi') }
    finally { setActing(null) }
  }
  async function deleteTenant() {
    if (!confirm(`XOÁ VĨNH VIỄN tenant "${data?.name}"? Hành động không thể khôi phục.`)) return
    if (!confirm(`Xác nhận lần 2: gõ "XOÁ" → OK để xác nhận`)) return
    setActing('delete')
    try {
      await saApi(`/api/super-admin/tenants/${id}`, { method: 'DELETE' })
      router.push('/super-admin/tenants')
    }
    catch (e: any) { alert(e?.message ?? 'Lỗi'); setActing(null) }
  }

  if (error) return (
    <div className="min-h-screen bg-gray-50 dark:bg-zinc-950 p-8">
      <div className="max-w-3xl mx-auto bg-white dark:bg-zinc-900 rounded-2xl p-6 ring-1 ring-red-200 dark:ring-red-500/30">
        <p className="text-red-600 dark:text-red-400 font-semibold mb-2">Lỗi</p>
        <p className="text-sm text-gray-700 dark:text-zinc-300">{error}</p>
        <Link href="/super-admin/tenants" className="inline-block mt-4 text-blue-600 dark:text-blue-400 hover:underline text-sm">← Quay lại danh sách</Link>
      </div>
    </div>
  )

  if (!data) return (
    <div className="min-h-screen bg-gray-50 dark:bg-zinc-950 flex items-center justify-center">
      <p className="text-gray-400 text-sm">Đang tải...</p>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-zinc-950 py-8">
      <div className="max-w-5xl mx-auto px-4">
        <Link href="/super-admin/tenants" className="text-blue-600 dark:text-blue-400 hover:underline text-sm mb-4 inline-block">← Quay lại danh sách</Link>

        {/* Header */}
        <div className="bg-white dark:bg-zinc-900 ring-1 ring-gray-200 dark:ring-white/5 rounded-2xl p-6 mb-4">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-zinc-100 mb-1">{data.name}</h1>
              <p className="text-xs font-mono text-gray-500 dark:text-zinc-400 mb-2">{data.slug} · {data.id}</p>
              <div className="flex items-center gap-2 flex-wrap">
                <Badge color={data.active ? 'green' : 'red'}>{data.active ? 'Hoạt động' : 'Tạm ngưng'}</Badge>
                <Badge color="blue">{data.plan.toUpperCase()}</Badge>
                <Badge color="gray">{data.hostingMode}</Badge>
                <Badge color={data.setupDone ? 'green' : 'amber'}>{data.setupDone ? 'Setup OK' : 'Chưa setup'}</Badge>
                {data.industry && <Badge color="violet">{data.industry}</Badge>}
              </div>
              {data.suspendedReason && (
                <p className="text-xs text-red-600 dark:text-red-400 mt-2">⚠️ Lý do ngưng: {data.suspendedReason}</p>
              )}
            </div>

            {/* Actions */}
            <div className="flex flex-wrap gap-2">
              {data.active ? (
                <button onClick={suspend} disabled={!!acting}
                  className="px-3 py-1.5 text-xs font-medium bg-red-50 dark:bg-red-500/10 hover:bg-red-100 dark:hover:bg-red-500/20 text-red-700 dark:text-red-400 rounded-lg disabled:opacity-50">
                  {acting === 'suspend' ? '...' : 'Tạm ngưng'}
                </button>
              ) : (
                <button onClick={activate} disabled={!!acting}
                  className="px-3 py-1.5 text-xs font-medium bg-green-50 dark:bg-green-500/10 hover:bg-green-100 dark:hover:bg-green-500/20 text-green-700 dark:text-green-400 rounded-lg disabled:opacity-50">
                  {acting === 'activate' ? '...' : 'Kích hoạt'}
                </button>
              )}
              <button onClick={resetUsage} disabled={!!acting}
                className="px-3 py-1.5 text-xs font-medium bg-blue-50 dark:bg-blue-500/10 hover:bg-blue-100 dark:hover:bg-blue-500/20 text-blue-600 dark:text-blue-400 rounded-lg disabled:opacity-50">
                {acting === 'reset' ? '...' : 'Reset usage'}
              </button>
              <button onClick={deleteTenant} disabled={!!acting}
                className="px-3 py-1.5 text-xs font-medium bg-red-500 hover:bg-red-600 text-white rounded-lg disabled:opacity-50">
                {acting === 'delete' ? '...' : '🗑 Xoá tenant'}
              </button>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <Stat label="Nhóm" value={data.stats.groups} />
          <Stat label="Users" value={data.stats.users} />
          <Stat label="Khách hàng" value={data.stats.customers} />
          <Stat label="Alerts" value={data.stats.alerts} />
        </div>

        {/* Owner + Liên hệ */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <Card title="Owner">
            {data.owner ? (
              <div className="space-y-1">
                <Row label="Tên" value={data.owner.name} />
                <Row label="Email" value={data.owner.email} mono />
                <Row label="Role" value={data.owner.role} />
                <Row label="Tạo" value={new Date(data.owner.createdAt).toLocaleString('vi-VN')} small />
              </div>
            ) : <p className="text-sm text-gray-400">Không có owner</p>}
          </Card>

          <Card title="Liên hệ">
            <div className="space-y-1">
              <Row label="Tên" value={data.contactName ?? '—'} />
              <Row label="Phone" value={data.contactPhone ?? '—'} />
              <Row label="Email" value={data.contactEmail ?? '—'} mono />
              {data.notes && <Row label="Ghi chú" value={data.notes} />}
            </div>
          </Card>
        </div>

        {/* Limits + Usage */}
        <Card title="Hạn mức (theo plan)" className="mb-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Row label="Tin/tháng" value={`${data.messagesThisMonth.toLocaleString('vi-VN')} / ${data.maxMessagesPerMonth.toLocaleString('vi-VN')}`} />
            <Row label="Tối đa nhóm" value={data.maxGroups.toString()} />
            <Row label="Board viewers" value={data.maxBoardViewers.toString()} />
            <Row label="History sync (ngày)" value={data.maxHistorySyncDepth.toString()} />
          </div>
        </Card>

        {/* License */}
        <Card title="License" className="mb-4">
          <div className="space-y-1">
            <Row label="Hosting" value={data.hostingMode} />
            <Row label="License key" value={data.licenseKey ?? '— (SaaS, không cần)'} mono small />
            <Row label="Hết hạn" value={data.licenseExpiresAt ? new Date(data.licenseExpiresAt).toLocaleString('vi-VN') : '— (vĩnh viễn)'} />
            <Row label="Status" value={data.status} />
          </div>
        </Card>

        {/* Channels + groups */}
        <Card title="Kênh & nhóm" className="mb-4">
          <p className="text-xs text-gray-500 dark:text-zinc-400 mb-2">Kênh đang bật: {data.enabledChannels.join(', ') || '—'}</p>
          <div className="space-y-1">
            {data.groupsByChannel.length === 0 && <p className="text-xs text-gray-400">Chưa có nhóm</p>}
            {data.groupsByChannel.map(g => (
              <Row key={g.channel} label={g.channel} value={`${g.count} nhóm`} />
            ))}
          </div>
        </Card>

        {/* Users */}
        <Card title={`Users (${data.users.length})`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] text-gray-500 dark:text-zinc-400 border-b border-gray-100 dark:border-white/5">
                  <th className="py-2">Email</th>
                  <th>Tên</th>
                  <th>Role</th>
                  <th>Tạo</th>
                </tr>
              </thead>
              <tbody>
                {data.users.map(u => (
                  <tr key={u.id} className="border-b border-gray-50 dark:border-white/5 last:border-0">
                    <td className="py-2 font-mono text-[12px]">{u.email}</td>
                    <td>{u.name}</td>
                    <td><Badge color={u.role === 'OWNER' ? 'blue' : 'gray'}>{u.role}</Badge></td>
                    <td className="text-[11px] text-gray-500">{new Date(u.createdAt).toLocaleDateString('vi-VN')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  )
}

function Badge({ children, color }: { children: React.ReactNode; color: 'green' | 'red' | 'blue' | 'gray' | 'amber' | 'violet' }) {
  const c: Record<string, string> = {
    green: 'bg-green-100 dark:bg-green-500/20 text-green-700 dark:text-green-400',
    red: 'bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-400',
    blue: 'bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400',
    gray: 'bg-gray-100 dark:bg-white/10 text-gray-600 dark:text-zinc-300',
    amber: 'bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400',
    violet: 'bg-violet-100 dark:bg-violet-500/20 text-violet-700 dark:text-violet-400',
  }
  return <span className={`inline-flex px-2 py-0.5 text-[10px] font-semibold rounded ${c[color]}`}>{children}</span>
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-white dark:bg-zinc-900 ring-1 ring-gray-200 dark:ring-white/5 rounded-xl px-4 py-3">
      <p className="text-[11px] text-gray-500 dark:text-zinc-400">{label}</p>
      <p className="text-2xl font-bold text-gray-900 dark:text-zinc-100 tabular-nums">{value.toLocaleString('vi-VN')}</p>
    </div>
  )
}

function Card({ title, children, className = '' }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white dark:bg-zinc-900 ring-1 ring-gray-200 dark:ring-white/5 rounded-2xl p-5 ${className}`}>
      <h2 className="text-sm font-semibold text-gray-900 dark:text-zinc-100 mb-3">{title}</h2>
      {children}
    </div>
  )
}

function Row({ label, value, mono = false, small = false }: { label: string; value: string; mono?: boolean; small?: boolean }) {
  return (
    <div className="flex items-baseline gap-3">
      <p className="text-xs text-gray-500 dark:text-zinc-400 shrink-0 w-28">{label}</p>
      <p className={`flex-1 text-gray-900 dark:text-zinc-100 ${mono ? 'font-mono' : ''} ${small ? 'text-xs' : 'text-sm'} break-all`}>{value}</p>
    </div>
  )
}
