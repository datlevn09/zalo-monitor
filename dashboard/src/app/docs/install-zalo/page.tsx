'use client'

import Link from 'next/link'

export default function InstallZaloPage() {
  return (
    <div className="min-h-[100dvh] bg-[#f2f2f7] dark:bg-zinc-950 text-gray-900 dark:text-zinc-100 flex flex-col">
      {/* Simple header */}
      <div className="bg-white dark:bg-zinc-900 border-b border-gray-200 dark:border-white/10">
        <div className="max-w-2xl mx-auto px-4 md:px-6 py-4">
          <Link href="/dashboard/settings/channels" className="inline-flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors mb-4">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Quay lại Cài đặt Kênh
          </Link>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-zinc-100 tracking-tight">
            Cài đặt Zalo trên OpenClaw
          </h1>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 max-w-2xl mx-auto w-full px-4 md:px-6 py-8">
        <div className="bg-white dark:bg-zinc-900 dark:ring-1 dark:ring-white/5 rounded-xl border border-gray-200 dark:border-white/10 p-6 md:p-8">
          <div className="space-y-6">
            {/* Step 1 */}
            <div className="flex gap-4">
              <div className="flex-shrink-0">
                <div className="flex items-center justify-center h-8 w-8 rounded-full bg-blue-500 text-white font-semibold text-sm">
                  1
                </div>
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-gray-900 dark:text-zinc-100 mb-2">Cài Docker trên máy chủ</h3>
                <p className="text-sm text-gray-600 dark:text-zinc-400">
                  Nếu máy chủ của bạn chưa có Docker, vui lòng cài đặt Docker từ{' '}
                  <a href="https://docs.docker.com/get-docker/" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline font-medium">
                    trang chính thức
                  </a>.
                </p>
              </div>
            </div>

            {/* Step 2 */}
            <div className="flex gap-4">
              <div className="flex-shrink-0">
                <div className="flex items-center justify-center h-8 w-8 rounded-full bg-blue-500 text-white font-semibold text-sm">
                  2
                </div>
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-gray-900 dark:text-zinc-100 mb-2">Cài OpenClaw</h3>
                <p className="text-sm text-gray-600 dark:text-zinc-400 mb-3">Chạy lệnh sau trên máy chủ của bạn:</p>
                <div className="bg-gray-900 dark:bg-zinc-950 rounded-lg p-4 overflow-x-auto">
                  <code className="text-sm font-mono text-green-400">curl -fsSL https://get.openclaw.dev | bash</code>
                </div>
              </div>
            </div>

            {/* Step 3 */}
            <div className="flex gap-4">
              <div className="flex-shrink-0">
                <div className="flex items-center justify-center h-8 w-8 rounded-full bg-blue-500 text-white font-semibold text-sm">
                  3
                </div>
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-gray-900 dark:text-zinc-100 mb-2">Khởi động Gateway</h3>
                <p className="text-sm text-gray-600 dark:text-zinc-400 mb-3">Chạy lệnh để khởi động OpenClaw Gateway:</p>
                <div className="bg-gray-900 dark:bg-zinc-950 rounded-lg p-4 overflow-x-auto">
                  <code className="text-sm font-mono text-green-400">openclaw gateway --bind lan</code>
                </div>
                <p className="text-xs text-gray-500 dark:text-zinc-500 mt-2">
                  Giữ cửa sổ terminal này mở. OpenClaw sẽ hiển thị mã QR để quét.
                </p>
              </div>
            </div>

            {/* Step 4 */}
            <div className="flex gap-4">
              <div className="flex-shrink-0">
                <div className="flex items-center justify-center h-8 w-8 rounded-full bg-blue-500 text-white font-semibold text-sm">
                  4
                </div>
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-gray-900 dark:text-zinc-100 mb-2">Quét QR trên Zalo</h3>
                <p className="text-sm text-gray-600 dark:text-zinc-400 mb-3">Trên điện thoại của bạn:</p>
                <ul className="text-sm text-gray-600 dark:text-zinc-400 space-y-2">
                  <li className="flex items-start gap-2">
                    <span className="text-blue-500 font-semibold">•</span>
                    <span>Mở Zalo</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-blue-500 font-semibold">•</span>
                    <span>Vào Cài đặt → Thiết bị đã đăng nhập</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-blue-500 font-semibold">•</span>
                    <span>Nhấn "Thêm thiết bị"</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-blue-500 font-semibold">•</span>
                    <span>Quét mã QR được hiển thị trong terminal</span>
                  </li>
                </ul>
              </div>
            </div>

            {/* Step 5 */}
            <div className="flex gap-4">
              <div className="flex-shrink-0">
                <div className="flex items-center justify-center h-8 w-8 rounded-full bg-blue-500 text-white font-semibold text-sm">
                  5
                </div>
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-gray-900 dark:text-zinc-100 mb-2">Hoàn thành cài đặt</h3>
                <p className="text-sm text-gray-600 dark:text-zinc-400">
                  Sau khi quét QR thành công, quay lại trang Kênh. Kết nối sẽ tự được nhận ra và bạn có thể bắt đầu theo dõi nhóm Zalo.
                </p>
              </div>
            </div>
          </div>

          {/* Note section */}
          <div className="mt-8 p-4 bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/30 rounded-lg">
            <p className="text-sm text-blue-900 dark:text-blue-300 font-medium mb-1">Ghi chú</p>
            <p className="text-sm text-blue-800 dark:text-blue-400">
              OpenClaw phải luôn chạy để nhận tin nhắn từ Zalo. Bạn có thể chạy nó trong một tmux session hoặc systemd service để giữ nó hoạt động liên tục.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
