'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { GuideShell, Card, Step, Note, Kbd, Faq, CopyableCmd } from '@/components/InstallGuide'

export default function InstallVpsPage() {
  const [cmd, setCmd] = useState<string>('')
  useEffect(() => { api<{ oneLineCommand?: string }>('/api/auth/my-install-command').then(d => setCmd(d.oneLineCommand ?? '')).catch(() => undefined) }, [])

  return (
    <GuideShell icon="☁️" title="Cài Zalo Monitor trên VPS Linux" subtitle="Ổn định nhất — server cloud chạy 24/7, không phụ thuộc máy nhà.">
      <Card>
        <h2 className="text-lg font-bold mb-2">📋 Yêu cầu</h2>
        <ul className="text-sm text-gray-600 dark:text-zinc-400 space-y-1 list-disc list-inside">
          <li>VPS Ubuntu 20.04+ / Debian 11+ / CentOS 8+ (RAM ≥ 512MB)</li>
          <li>Có quyền root hoặc sudo</li>
          <li>Mạng internet (cổng 443 ra ngoài)</li>
        </ul>
        <Note tint="blue">Mua VPS rẻ ~ 60-100k/tháng tại Vultr, DigitalOcean, BizflyCloud, Vinahost...</Note>
      </Card>

      <Step n={1} title="Mua + tạo VPS">
        <ol className="text-sm text-gray-700 dark:text-zinc-300 space-y-1.5 list-decimal list-inside">
          <li>Đăng ký provider, tạo 1 VPS (chọn Ubuntu 22.04 LTS)</li>
          <li>Lấy <strong>IP</strong> + <strong>password root</strong> (hoặc SSH key)</li>
        </ol>
      </Step>

      <Step n={2} title="SSH vào VPS">
        <p className="text-sm text-gray-600 dark:text-zinc-400 mb-2">Trên Mac/Linux: mở Terminal. Trên Windows: dùng PowerShell hoặc PuTTY.</p>
        <pre className="bg-gray-900 dark:bg-black text-green-400 text-xs font-mono p-2 rounded select-all">ssh root@&lt;IP-VPS-CỦA-ANH&gt;</pre>
        <Note tint="amber">Lần đầu hỏi <em>"yes/no"</em> → gõ <Kbd>yes</Kbd> + Enter. Nhập password (gõ ko hiện ký tự, gõ xong Enter).</Note>
      </Step>

      <Step n={3} title="Copy + paste lệnh cài">
        <p className="text-sm text-gray-600 dark:text-zinc-400 mb-2">Sau khi vào terminal VPS, paste lệnh sau:</p>
        <CopyableCmd cmd={cmd} hint="Click chuột phải để paste vào terminal SSH" />
        <Note tint="blue">
          Script tự cài Node + openzca + tạo systemd service. ~ 2-3 phút.
        </Note>
      </Step>

      <Step n={4} title="Đăng nhập Zalo">
        <ol className="text-sm text-gray-700 dark:text-zinc-300 space-y-1.5 list-decimal list-inside">
          <li>Vào <Link href="/dashboard/settings/channels" className="text-blue-600 dark:text-blue-400 hover:underline font-medium">Cài đặt → Kênh</Link></li>
          <li>Bấm <strong>"Kết nối lại"</strong> → QR hiện sau ~5 giây</li>
          <li>Quét bằng Zalo điện thoại → Thêm thiết bị</li>
        </ol>
        <Note tint="green">✅ Listener chạy ngầm 24/7 trên VPS, không cần SSH thường xuyên.</Note>
      </Step>

      <Card>
        <h2 className="text-lg font-bold mb-3">🔧 Quản lý listener</h2>
        <Faq q="Xem listener đang chạy?">
          <pre className="bg-gray-900 dark:bg-black text-green-400 text-xs font-mono p-2 rounded select-all">systemctl --user status zalo-monitor-listener</pre>
        </Faq>
        <Faq q="Xem log real-time?">
          <pre className="bg-gray-900 dark:bg-black text-green-400 text-xs font-mono p-2 rounded select-all">journalctl --user -u zalo-monitor-listener -f</pre>
        </Faq>
        <Faq q="Restart listener?">
          <pre className="bg-gray-900 dark:bg-black text-green-400 text-xs font-mono p-2 rounded select-all">systemctl --user restart zalo-monitor-listener</pre>
        </Faq>
        <Faq q="Cập nhật listener?">
          <p className="text-sm text-gray-600 dark:text-zinc-400">Chạy lại lệnh ở Bước 3 (idempotent — overwrite + restart).</p>
        </Faq>
        <Faq q="Gỡ cài đặt?">
          <pre className="bg-gray-900 dark:bg-black text-green-400 text-xs font-mono p-2 rounded select-all whitespace-pre-wrap">{`systemctl --user disable --now zalo-monitor-listener
rm -rf ~/.zalo-monitor ~/.config/systemd/user/zalo-monitor-listener.service
systemctl --user daemon-reload`}</pre>
        </Faq>
      </Card>
    </GuideShell>
  )
}
