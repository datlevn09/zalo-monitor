'use client'

import { useState } from 'react'
import { api } from '@/lib/api'

/**
 * Nút sync lịch sử dùng chung — đặt trên header của các tab có chart
 * (Tổng quan, Phân tích, Khách, Hẹn). Queue action sync_history lên listener
 * khách máy → fetch tin cũ về DB → chart cập nhật sau 1-2 phút.
 */
export function SyncHistoryButton({ size = 'sm' }: { size?: 'sm' | 'md' }) {
  const [syncing, setSyncing] = useState(false)
  const [done, setDone] = useState(false)

  async function trigger() {
    setSyncing(true)
    try {
      await api('/api/zalo/sync-history-server', { method: 'POST', body: '{}' })
      setDone(true)
      setTimeout(() => setDone(false), 5000)
    } catch (e: any) {
      alert('Không gửi được lệnh sync: ' + (e?.message || 'unknown'))
    } finally {
      setSyncing(false)
    }
  }

  const sizeCls = size === 'md' ? 'text-sm px-3.5 py-2' : 'text-xs px-3 py-1.5'

  return (
    <button
      onClick={trigger}
      disabled={syncing}
      className={`inline-flex items-center gap-1.5 ${sizeCls} bg-blue-50 dark:bg-blue-500/10 hover:bg-blue-100 dark:hover:bg-blue-500/20 text-blue-600 dark:text-blue-400 rounded-lg font-medium transition-colors disabled:opacity-50`}
      title="Đồng bộ tin nhắn cũ từ máy khách"
    >
      {done ? (
        <>
          <CheckIcon /><span>Đã sync</span>
        </>
      ) : (
        <>
          <RefreshIcon spinning={syncing} />
          <span>{syncing ? 'Đang sync...' : 'Sync lịch sử'}</span>
        </>
      )}
    </button>
  )
}

function RefreshIcon({ spinning = false }: { spinning?: boolean }) {
  return (
    <svg
      width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      className={spinning ? 'animate-spin' : ''}
    >
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}
