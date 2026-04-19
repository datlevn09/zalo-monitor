'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { SetupState } from '@/app/setup/page'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

type Channel = {
  channelType: 'ZALO' | 'TELEGRAM' | 'LARK' | 'EMAIL'
  purpose: 'ALERT' | 'DIGEST' | 'BOTH'
  label: string
  target: string
  minPriority: 'MEDIUM' | 'HIGH' | 'CRITICAL'
  schedule?: string
}

const CHANNEL_INFO = {
  ZALO:     { icon: '💬', name: 'Zalo',     placeholder: 'Zalo ID của bạn', purpose: 'ALERT' as const,  hint: 'Nhận cảnh báo ngay lập tức' },
  TELEGRAM: { icon: '✈️', name: 'Telegram', placeholder: 'Chat ID hoặc @username', purpose: 'ALERT' as const,  hint: 'Nhận cảnh báo ngay lập tức' },
  LARK:     { icon: '🪶', name: 'Lark',     placeholder: 'Webhook URL của Lark group', purpose: 'DIGEST' as const, hint: 'Nhận tổng hợp hàng ngày cho cả team' },
  EMAIL:    { icon: '📧', name: 'Email',    placeholder: 'email@company.com', purpose: 'ALERT' as const,  hint: 'Nhận cảnh báo qua email' },
}

export function Step3Notify({ setup, onDone }: { setup: SetupState; onDone: () => void }) {
  const [enabled, setEnabled] = useState({ ZALO: false, TELEGRAM: false, LARK: false, EMAIL: false } as Record<string, boolean>)
  const [targets, setTargets] = useState({ ZALO: '', TELEGRAM: '', LARK: '', EMAIL: '' } as Record<string, string>)
  const [testing, setTesting] = useState('')
  const [loading, setLoading] = useState(false)

  function toggle(ch: string) {
    setEnabled(e => ({ ...e, [ch]: !e[ch] }))
  }

  async function testChannel(ch: string) {
    setTesting(ch)
    await fetch(`${API}/api/setup/test-notification`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channelType: ch, target: targets[ch] }),
    })
    setTimeout(() => setTesting(''), 2000)
  }

  async function save() {
    setLoading(true)
    const channels: Channel[] = Object.entries(enabled)
      .filter(([ch, on]) => on && targets[ch])
      .map(([ch]) => ({
        channelType: ch as Channel['channelType'],
        purpose: CHANNEL_INFO[ch as keyof typeof CHANNEL_INFO].purpose,
        label: CHANNEL_INFO[ch as keyof typeof CHANNEL_INFO].name,
        target: targets[ch],
        minPriority: 'HIGH',
        schedule: ch === 'LARK' ? '0 8 * * *' : undefined,
      }))

    if (channels.length > 0) {
      await fetch(`${API}/api/setup/notifications`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId: setup.tenantId, channels }),
      })
    }
    setLoading(false)
    onDone()
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-zinc-100">Cài đặt thông báo</h2>
        <p className="text-sm text-gray-500 dark:text-zinc-400 mt-1">Chọn kênh nhận cảnh báo khi có vấn đề quan trọng</p>
      </div>

      <div className="space-y-3">
        {(Object.keys(CHANNEL_INFO) as Array<keyof typeof CHANNEL_INFO>).map((ch) => {
          const info = CHANNEL_INFO[ch]
          const on = enabled[ch]
          return (
            <div key={ch} className={`border rounded-xl p-4 transition-all ${on ? 'border-blue-300 dark:border-blue-500/40 bg-blue-50 dark:bg-blue-500/10' : 'border-gray-200 dark:border-white/10'}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xl">{info.icon}</span>
                  <div>
                    <p className="font-medium text-sm text-gray-900 dark:text-zinc-100">{info.name}</p>
                    <p className="text-xs text-gray-500 dark:text-zinc-400">{info.hint}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => toggle(ch)}
                  className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${on ? 'bg-blue-500' : 'bg-gray-300 dark:bg-white/15'}`}
                >
                  <span
                    className="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-md transition-transform"
                    style={{ transform: on ? 'translateX(20px)' : 'translateX(0)' }}
                  />
                </button>
              </div>

              {on && (
                <div className="mt-3 flex gap-2">
                  <Input
                    placeholder={info.placeholder}
                    value={targets[ch]}
                    onChange={e => setTargets(t => ({ ...t, [ch]: e.target.value }))}
                    className="flex-1"
                  />
                  <Button
                    variant="outline" size="sm"
                    onClick={() => testChannel(ch)}
                    disabled={!targets[ch] || testing === ch}
                  >
                    {testing === ch ? '✓' : 'Test'}
                  </Button>
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="flex gap-3">
        <Button variant="outline" className="flex-1" onClick={onDone}>
          Bỏ qua
        </Button>
        <Button className="flex-1" onClick={save} disabled={loading}>
          {loading ? 'Đang lưu...' : 'Lưu & tiếp theo →'}
        </Button>
      </div>
    </div>
  )
}
