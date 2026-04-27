'use client'

import Link from 'next/link'

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4">
      <div className="flex-shrink-0 flex items-center justify-center h-8 w-8 rounded-full bg-blue-500 text-white font-semibold text-sm">{n}</div>
      <div className="flex-1">
        <h3 className="font-semibold text-gray-900 dark:text-zinc-100 mb-2">{title}</h3>
        {children}
      </div>
    </div>
  )
}

function Code({ children }: { children: string }) {
  return (
    <div className="bg-gray-900 dark:bg-zinc-950 rounded-lg p-4 overflow-x-auto">
      <code className="text-sm font-mono text-green-400 select-all">{children}</code>
    </div>
  )
}

export default function InstallZaloPage() {
  return (
    <div className="min-h-[100dvh] bg-[#f2f2f7] dark:bg-zinc-950 text-gray-900 dark:text-zinc-100 flex flex-col">
      <div className="bg-white dark:bg-zinc-900 border-b border-gray-200 dark:border-white/10">
        <div className="max-w-2xl mx-auto px-4 md:px-6 py-4">
          <Link href="/dashboard/settings/channels" className="inline-flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400 hover:underline mb-4">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Quay lại Cài đặt Kênh
          </Link>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Kết nối Zalo</h1>
          <p className="text-sm text-gray-500 dark:text-zinc-400 mt-1">Chỉ cần 1 lệnh — tự động cài đặt và hiện QR để quét</p>
        </div>
      </div>

      <div className="flex-1 max-w-2xl mx-auto w-full px-4 md:px-6 py-8 space-y-6">
        <div className="bg-white dark:bg-zinc-900 dark:ring-1 dark:ring-white/5 rounded-xl p-6 md:p-8 space-y-6">

          <Step n={1} title="Lấy lệnh cài đặt">
            <p className="text-sm text-gray-600 dark:text-zinc-400 mb-3">
              Vào{' '}
              <Link href="/dashboard/settings/channels" className="text-blue-600 dark:text-blue-400 hover:underline font-medium">
                Cài đặt → Kênh
              </Link>
              {' '}→ bấm <strong>Kết nối Zalo</strong> → copy lệnh cài đặt hiển thị trên màn hình.
            </p>
            <p className="text-xs text-gray-500 dark:text-zinc-500">
              Lệnh có dạng: <code className="bg-gray-100 dark:bg-white/10 px-1 rounded">curl -fsSL https://api.../inject.sh?... | bash</code>
            </p>
          </Step>

          <Step n={2} title="Chạy lệnh trên máy chủ">
            <p className="text-sm text-gray-600 dark:text-zinc-400 mb-3">
              SSH vào máy chủ (VPS/NAS/máy tính) rồi paste và chạy lệnh vừa copy. Script sẽ tự động:
            </p>
            <ul className="text-sm text-gray-600 dark:text-zinc-400 space-y-1 mb-3">
              {['Cài OpenClaw nếu chưa có', 'Cài hook Zalo Monitor vào OpenClaw', 'Khởi động daemon tự động (chạy ngầm, không cần giữ terminal)'].map(t => (
                <li key={t} className="flex items-start gap-2"><span className="text-green-500 font-bold mt-0.5">✓</span><span>{t}</span></li>
              ))}
            </ul>
            <div className="bg-blue-50 dark:bg-blue-500/10 rounded-lg p-3 text-xs text-blue-800 dark:text-blue-300">
              💡 Không cần cài Docker. Script chạy khoảng 1–2 phút.
            </div>
          </Step>

          <Step n={3} title="Quét QR trên Zalo">
            <p className="text-sm text-gray-600 dark:text-zinc-400 mb-3">
              Sau khi script chạy xong, mã QR sẽ tự hiện trong dashboard. Quét bằng điện thoại:
            </p>
            <ul className="text-sm text-gray-600 dark:text-zinc-400 space-y-2">
              {[
                'Mở app Zalo trên điện thoại',
                'Vào Cài đặt → Thiết bị đã đăng nhập',
                'Nhấn "Thêm thiết bị"',
                'Quét mã QR hiển thị trong dashboard',
              ].map((t, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="text-blue-500 font-semibold shrink-0">•</span>
                  <span>{t}</span>
                </li>
              ))}
            </ul>
          </Step>

          <Step n={4} title="Xong!">
            <p className="text-sm text-gray-600 dark:text-zinc-400">
              Dashboard tự nhận ra kết nối. Bắt đầu thêm nhóm Zalo để theo dõi tại{' '}
              <Link href="/dashboard/settings/channels" className="text-blue-600 dark:text-blue-400 hover:underline">Cài đặt → Kênh</Link>.
            </p>
          </Step>
        </div>

        {/* FAQ */}
        <div className="bg-white dark:bg-zinc-900 dark:ring-1 dark:ring-white/5 rounded-xl p-6 space-y-4">
          <h2 className="font-semibold text-gray-900 dark:text-zinc-100">Câu hỏi thường gặp</h2>

          <div className="space-y-1">
            <p className="text-sm font-medium text-gray-800 dark:text-zinc-200">QR không hiện trong dashboard?</p>
            <p className="text-sm text-gray-500 dark:text-zinc-400">Kiểm tra script đã chạy thành công chưa. Nếu lỗi, thử chạy lại lệnh cài đặt.</p>
          </div>

          <div className="space-y-1">
            <p className="text-sm font-medium text-gray-800 dark:text-zinc-200">Zalo bị đăng xuất phải làm gì?</p>
            <p className="text-sm text-gray-500 dark:text-zinc-400">
              Vào <Link href="/dashboard/settings/channels" className="text-blue-600 dark:text-blue-400 hover:underline">Cài đặt → Kênh</Link> → bấm <strong>Kết nối lại</strong> để lấy QR mới.
            </p>
          </div>

          <div className="space-y-1">
            <p className="text-sm font-medium text-gray-800 dark:text-zinc-200">Daemon có tự chạy lại sau khi reboot không?</p>
            <p className="text-sm text-gray-500 dark:text-zinc-400">Có — script cài dưới dạng systemd service (Linux) hoặc launchd (Mac), tự khởi động cùng máy.</p>
          </div>
        </div>
      </div>
    </div>
  )
}
