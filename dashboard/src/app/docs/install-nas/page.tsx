'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { GuideShell, Card, Step, Note, Faq, CopyableCmd } from '@/components/InstallGuide'

export default function InstallNasPage() {
  const [cmd, setCmd] = useState<string>('')
  useEffect(() => { api<{ dockerCommand?: string }>('/api/auth/my-install-command').then(d => setCmd(d.dockerCommand ?? '')).catch(() => undefined) }, [])

  return (
    <GuideShell icon="📦" title="Cài qua Docker / NAS Synology" subtitle="1 container, mount volume bảo lưu session — không phụ thuộc OS.">
      <Card>
        <h2 className="text-lg font-bold mb-2">📋 Yêu cầu</h2>
        <ul className="text-sm text-gray-600 dark:text-zinc-400 space-y-1 list-disc list-inside">
          <li>Có Docker (NAS Synology với Container Manager / Docker Engine trên Linux/Mac/Windows)</li>
          <li>Quyền chạy Docker (sudo hoặc user trong docker group)</li>
        </ul>
      </Card>

      <Step n={1} title="Mở terminal có quyền docker">
        <p className="text-sm text-gray-600 dark:text-zinc-400 mb-2">Tuỳ thiết bị:</p>
        <ul className="text-sm text-gray-700 dark:text-zinc-300 space-y-1 list-disc list-inside">
          <li><strong>NAS Synology:</strong> SSH vào NAS với user có quyền docker (admin). Hoặc Container Manager UI → "Project" → import compose.</li>
          <li><strong>Linux/Mac:</strong> mở Terminal</li>
          <li><strong>Windows:</strong> mở PowerShell trong Docker Desktop đang chạy</li>
        </ul>
      </Step>

      <Step n={2} title="Copy lệnh + paste + Enter">
        <CopyableCmd cmd={cmd} hint="Container có sẵn Node + openzca, tự cài listener khi khởi động" />
        <Note tint="blue">
          Container <strong>tự khởi động</strong> khi máy/NAS reboot (<code>--restart unless-stopped</code>). Volume <code>zalo-monitor-data</code> bảo lưu session Zalo — không cần đăng nhập lại sau restart.
        </Note>
      </Step>

      <Step n={3} title="Đăng nhập Zalo qua dashboard">
        <ol className="text-sm text-gray-700 dark:text-zinc-300 space-y-1.5 list-decimal list-inside">
          <li>Vào <Link href="/dashboard/settings/channels" className="text-blue-600 dark:text-blue-400 hover:underline font-medium">Cài đặt → Kênh</Link></li>
          <li>Bấm <strong>"Kết nối lại"</strong> → QR hiện sau ~5 giây</li>
          <li>Quét bằng Zalo điện thoại → Thêm thiết bị</li>
        </ol>
      </Step>

      <Card>
        <h2 className="text-lg font-bold mb-3">🔧 Quản lý container</h2>
        <Faq q="Xem container đang chạy?">
          <pre className="bg-gray-900 dark:bg-black text-green-400 text-xs font-mono p-2 rounded select-all">docker ps | grep zalo-monitor-listener</pre>
        </Faq>
        <Faq q="Xem log real-time?">
          <pre className="bg-gray-900 dark:bg-black text-green-400 text-xs font-mono p-2 rounded select-all">docker logs -f zalo-monitor-listener</pre>
        </Faq>
        <Faq q="Restart container?">
          <pre className="bg-gray-900 dark:bg-black text-green-400 text-xs font-mono p-2 rounded select-all">docker restart zalo-monitor-listener</pre>
        </Faq>
        <Faq q="Cập nhật listener?">
          <pre className="bg-gray-900 dark:bg-black text-green-400 text-xs font-mono p-2 rounded select-all whitespace-pre-wrap">{`docker stop zalo-monitor-listener
docker rm zalo-monitor-listener
# Chạy lại lệnh ở Bước 2`}</pre>
          <p className="text-sm text-gray-600 dark:text-zinc-400 mt-1">Volume <code>zalo-monitor-data</code> giữ nguyên — không cần login lại Zalo.</p>
        </Faq>
        <Faq q="Gỡ hoàn toàn?">
          <pre className="bg-gray-900 dark:bg-black text-green-400 text-xs font-mono p-2 rounded select-all whitespace-pre-wrap">{`docker stop zalo-monitor-listener
docker rm zalo-monitor-listener
docker volume rm zalo-monitor-data`}</pre>
        </Faq>
        <Faq q="NAS Synology UI cài kiểu khác được không?">
          <p className="text-sm text-gray-600 dark:text-zinc-400">Mở Container Manager → Project → Create. Paste docker-compose tương ứng (yêu cầu em sẽ generate). Hoặc dễ nhất: SSH + paste lệnh ở Bước 2.</p>
        </Faq>
      </Card>
    </GuideShell>
  )
}
