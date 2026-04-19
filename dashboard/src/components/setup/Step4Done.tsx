'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { useRouter } from 'next/navigation'
import type { SetupState } from '@/app/setup/page'
import { setTenantId } from '@/lib/api'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

export function Step4Done({ setup }: { setup: SetupState }) {
  const router = useRouter()
  const [done, setDone] = useState(false)

  useEffect(() => {
    setTenantId(setup.tenantId)
    fetch(`${API}/api/setup/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenantId: setup.tenantId }),
    }).then(() => setDone(true))
  }, [setup.tenantId])

  return (
    <div className="text-center space-y-6 py-4">
      <div className="text-6xl">🎉</div>

      <div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-zinc-100">Thiết lập hoàn tất!</h2>
        <p className="text-gray-500 dark:text-zinc-400 mt-2 text-sm">
          Hệ thống đã sẵn sàng theo dõi các nhóm chat của bạn
        </p>
      </div>

      <div className="bg-gray-50 dark:bg-white/5 rounded-xl p-4 text-left space-y-2">
        <p className="text-sm font-medium text-gray-700 dark:text-zinc-300">Bước tiếp theo:</p>
        <ul className="text-sm text-gray-600 dark:text-zinc-400 space-y-1.5">
          <li>✅ Nhóm Zalo sẽ tự xuất hiện khi có tin nhắn mới</li>
          <li>✅ AI phân tích mỗi tin nhắn tự động</li>
          <li>✅ Cảnh báo được gửi theo kênh đã cài đặt</li>
          <li className="text-blue-600">→ Vào <strong>Nhóm chat</strong> để phân loại các nhóm của bạn</li>
        </ul>
      </div>

      <div className="space-y-2">
        <Button className="w-full" onClick={() => router.push('/dashboard')} disabled={!done}>
          Vào Dashboard →
        </Button>
        <p className="text-xs text-gray-400 dark:text-zinc-500">
          Địa chỉ đăng nhập: <code className="bg-gray-100 dark:bg-white/10 px-1 rounded">/{setup.slug}</code>
        </p>
      </div>
    </div>
  )
}
