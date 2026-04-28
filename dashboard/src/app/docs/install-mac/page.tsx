'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { GuideShell, Card, Step, Note, Kbd, Faq, CopyableCmd } from '@/components/InstallGuide'

export default function InstallMacPage() {
  const [cmd, setCmd] = useState<string>('')
  useEffect(() => { api<{ oneLineCommand?: string }>('/api/auth/my-install-command').then(d => setCmd(d.oneLineCommand ?? '')).catch(() => undefined) }, [])

  return (
    <GuideShell icon="🍎" title="Cài Zalo Monitor trên macOS" subtitle="Hướng dẫn chi tiết — copy 1 lệnh + quét 1 mã QR.">
      <Card>
        <h2 className="text-lg font-bold mb-2">📋 Tổng quan</h2>
        <p className="text-sm text-gray-600 dark:text-zinc-400 leading-relaxed">
          Cần một <strong>MacBook / Mac mini</strong> bật 24/7. Toàn bộ ~ 5 phút.
        </p>
      </Card>

      <Step n={1} title="Mở Terminal">
        <ol className="text-sm text-gray-700 dark:text-zinc-300 space-y-1.5 list-decimal list-inside">
          <li>Nhấn <Kbd>⌘</Kbd> + <Kbd>Space</Kbd> để mở Spotlight</li>
          <li>Gõ <code className="px-1 rounded bg-gray-100 dark:bg-white/10">Terminal</code> → nhấn Enter</li>
        </ol>
        <Note tint="blue">Cũng có thể mở từ <strong>Finder → Applications → Utilities → Terminal</strong>.</Note>
      </Step>

      <Step n={2} title="Copy lệnh cài đặt">
        <p className="text-sm text-gray-600 dark:text-zinc-400 mb-2">Lệnh tự cài Node.js + openzca + listener service. Tự động cài Homebrew nếu thiếu.</p>
        <CopyableCmd cmd={cmd} />
        <Note tint="amber">⚠️ Lệnh chứa secret riêng — không chia sẻ.</Note>
      </Step>

      <Step n={3} title="Paste lệnh + Enter">
        <ol className="text-sm text-gray-700 dark:text-zinc-300 space-y-1.5 list-decimal list-inside">
          <li>Click vào cửa sổ Terminal</li>
          <li>Nhấn <Kbd>⌘</Kbd> + <Kbd>V</Kbd> để paste</li>
          <li>Nhấn <Kbd>Enter</Kbd></li>
        </ol>
        <Note tint="blue">
          Script sẽ:
          <ul className="mt-1 list-disc list-inside text-[13px]">
            <li>Cài Node.js qua Homebrew (nếu chưa có)</li>
            <li>Cài <code>openzca</code> CLI</li>
            <li>Tải <code>zalo-listener.mjs</code> về <code>~/.zalo-monitor/</code></li>
            <li>Tạo systemd-style launchd service tự khởi động khi anh login Mac</li>
          </ul>
          ~ 2-3 phút tuỳ tốc độ mạng.
        </Note>
      </Step>

      <Step n={4} title="Đăng nhập Zalo qua dashboard">
        <ol className="text-sm text-gray-700 dark:text-zinc-300 space-y-1.5 list-decimal list-inside">
          <li>Vào <Link href="/dashboard/settings/channels" className="text-blue-600 dark:text-blue-400 hover:underline font-medium">Cài đặt → Kênh</Link></li>
          <li>Bấm <strong>"Kết nối lại"</strong> ở thẻ Zalo → QR hiện sau ~5 giây</li>
          <li>Mở Zalo điện thoại → Cài đặt → Thiết bị đã đăng nhập → Thêm thiết bị → Quét QR</li>
        </ol>
        <Note tint="green">✅ Quét xong → dashboard tự cập nhật. Listener bắt đầu nhận tin nhắn real-time.</Note>
      </Step>

      <Step n={5} title="Kiểm tra hoạt động">
        <p className="text-sm text-gray-600 dark:text-zinc-400">Gửi 1 tin Zalo → mở <Link href="/dashboard/groups" className="text-blue-500 hover:underline font-medium">Dashboard → Chat</Link> sau ~3 giây sẽ thấy tin.</p>
      </Step>

      <Card>
        <h2 className="text-lg font-bold mb-3">🔧 Sự cố thường gặp</h2>
        <Faq q="Báo 'permission denied' khi cài npm global">
          <p className="text-sm text-gray-600 dark:text-zinc-400">Chạy với sudo:</p>
          <pre className="bg-gray-900 dark:bg-black text-green-400 text-xs font-mono p-2 rounded select-all mt-1">sudo npm install -g openzca</pre>
        </Faq>
        <Faq q="Tin nhắn không về dashboard">
          <p className="text-sm text-gray-600 dark:text-zinc-400">Mở Terminal, gõ:</p>
          <pre className="bg-gray-900 dark:bg-black text-green-400 text-xs font-mono p-2 rounded select-all mt-1 whitespace-pre-wrap">launchctl list | grep zalo-monitor
# Hoặc check log:
tail -f ~/.zalo-monitor/listener.log</pre>
        </Faq>
        <Faq q="Đóng Terminal có ảnh hưởng listener không?">
          <p className="text-sm text-gray-600 dark:text-zinc-400">Không. Listener chạy ngầm qua launchd service, độc lập với Terminal.</p>
        </Faq>
        <Faq q="Restart Mac có sao không?">
          <p className="text-sm text-gray-600 dark:text-zinc-400">Listener tự khởi động lại khi anh login lại Mac.</p>
        </Faq>
      </Card>
    </GuideShell>
  )
}
