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
    <pre className="bg-gray-900 dark:bg-zinc-950 rounded-lg p-3 overflow-x-auto text-xs font-mono text-green-400 select-all whitespace-pre-wrap break-all">{children}</pre>
  )
}

export default function InstallZaloPage() {
  return (
    <div className="min-h-[100dvh] bg-[#f2f2f7] dark:bg-zinc-950 text-gray-900 dark:text-zinc-100 flex flex-col">
      <div className="bg-white dark:bg-zinc-900 border-b border-gray-200 dark:border-white/10">
        <div className="max-w-3xl mx-auto px-4 md:px-6 py-4">
          <Link href="/dashboard/settings/channels" className="inline-flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400 hover:underline mb-4">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Quay lại Cài đặt Kênh
          </Link>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Kết nối Zalo</h1>
          <p className="text-sm text-gray-500 dark:text-zinc-400 mt-1">
            Listener chỉ <strong>ĐỌC</strong> tin nhắn và báo cáo về dashboard. <strong>Không reply tự động</strong>. Chỉ gửi tin khi bạn chủ động bấm Gửi từ dashboard.
          </p>
        </div>
      </div>

      <div className="flex-1 max-w-3xl mx-auto w-full px-4 md:px-6 py-8 space-y-6">
        <div className="bg-white dark:bg-zinc-900 dark:ring-1 dark:ring-white/5 rounded-xl p-6 md:p-8 space-y-6">

          <Step n={1} title="Lấy lệnh cài đặt từ dashboard">
            <p className="text-sm text-gray-600 dark:text-zinc-400">
              Vào <Link href="/dashboard/settings/channels" className="text-blue-600 dark:text-blue-400 hover:underline font-medium">Cài đặt → Kênh</Link>, chọn cách cài phù hợp với máy chủ của bạn → copy lệnh.
            </p>
          </Step>

          <Step n={2} title="3 cách cài tuỳ máy chủ">
            <div className="space-y-5 mt-3">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-lg">🐧</span>
                  <strong className="text-gray-900 dark:text-zinc-100">Linux VPS / Cloud server</strong>
                </div>
                <p className="text-xs text-gray-500 dark:text-zinc-400 mb-2">SSH vào máy chủ, paste 1 lệnh — script tự cài Node, openzca, systemd service.</p>
                <Code>{'curl -fsSL "https://api.../api/setup/inject.sh?..." | bash'}</Code>
              </div>

              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-lg">🐳</span>
                  <strong className="text-gray-900 dark:text-zinc-100">Docker (NAS Synology / Windows / mọi nơi có Docker)</strong>
                </div>
                <p className="text-xs text-gray-500 dark:text-zinc-400 mb-2">Container có sẵn Node + openzca, chạy 1 lệnh.</p>
                <Code>{`docker run -d --name zalo-listener \\
  -v zalo-data:/home/node/.openzca \\
  -e BACKEND_URL=https://api... \\
  -e WEBHOOK_SECRET=xxx \\
  -e TENANT_ID=xxx \\
  --restart unless-stopped \\
  datlevn09/zalo-monitor-listener:latest

# Login Zalo (interactive QR scan):
docker exec -it zalo-listener openzca --profile zalo-monitor auth login`}</Code>
              </div>

              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-lg">🍎</span>
                  <strong className="text-gray-900 dark:text-zinc-100">macOS / Linux Desktop (chạy trong terminal)</strong>
                </div>
                <Code>{`brew install node          # macOS, hoặc apt/yum trên Linux
npm install -g openzca
openzca --profile zalo-monitor auth login   # Scan QR

curl -O https://api.../api/setup/hook-files/zalo-listener.mjs
BACKEND_URL=https://api... WEBHOOK_SECRET=xxx TENANT_ID=xxx \\
  node zalo-listener.mjs`}</Code>
              </div>
            </div>
          </Step>

          <Step n={3} title="Quét QR đăng nhập Zalo">
            <p className="text-sm text-gray-600 dark:text-zinc-400 mb-2">Trên app Zalo điện thoại:</p>
            <ul className="text-sm text-gray-600 dark:text-zinc-400 space-y-1 list-disc list-inside">
              <li>Cài đặt → Thiết bị đã đăng nhập → Thêm thiết bị</li>
              <li>Quét QR hiển thị trong terminal</li>
            </ul>
          </Step>

          <Step n={4} title="Xong — Listener tự forward tin về dashboard">
            <ul className="text-sm text-gray-600 dark:text-zinc-400 space-y-1 list-disc list-inside">
              <li><strong>Chỉ ĐỌC</strong> — listener không bao giờ tự reply</li>
              <li>Bấm <strong>Gửi</strong> trên dashboard → backend queue → listener exec <code className="bg-gray-100 dark:bg-white/10 px-1 rounded">openzca msg send</code></li>
              <li>Auto-restart khi mất kết nối / reboot máy</li>
            </ul>
          </Step>
        </div>

        <div className="bg-white dark:bg-zinc-900 dark:ring-1 dark:ring-white/5 rounded-xl p-6 space-y-4">
          <h2 className="font-semibold text-gray-900 dark:text-zinc-100">FAQ</h2>

          <div className="space-y-1">
            <p className="text-sm font-medium text-gray-800 dark:text-zinc-200">Listener có gửi tin nhắn tự động không?</p>
            <p className="text-sm text-gray-500 dark:text-zinc-400">
              <strong>Không.</strong> Chỉ đọc + forward. Gửi chỉ khi user chủ động bấm Gửi từ dashboard. Không có agent AI nào tự reply.
            </p>
          </div>

          <div className="space-y-1">
            <p className="text-sm font-medium text-gray-800 dark:text-zinc-200">Zalo bị đăng xuất phải làm gì?</p>
            <p className="text-sm text-gray-500 dark:text-zinc-400">
              SSH (hoặc <code className="bg-gray-100 dark:bg-white/10 px-1 rounded">docker exec</code>) vào máy → <code className="bg-gray-100 dark:bg-white/10 px-1 rounded">openzca --profile zalo-monitor auth login</code> → scan QR mới.
            </p>
          </div>

          <div className="space-y-1">
            <p className="text-sm font-medium text-gray-800 dark:text-zinc-200">Cập nhật listener phiên bản mới?</p>
            <p className="text-sm text-gray-500 dark:text-zinc-400">
              Linux VPS: chạy lại lệnh inject.sh (idempotent).<br/>
              Docker: <code className="bg-gray-100 dark:bg-white/10 px-1 rounded">docker pull ... && docker restart zalo-listener</code>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
