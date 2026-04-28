'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'

export default function InstallWindowsPage() {
  const [cmd, setCmd] = useState<string>('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    api<{ windowsCommand?: string }>('/api/auth/my-install-command')
      .then((d) => setCmd(d.windowsCommand ?? ''))
      .catch(() => undefined)
  }, [])

  function copyCmd() {
    if (!cmd) return
    navigator.clipboard.writeText(cmd)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="min-h-[100dvh] bg-[#f2f2f7] dark:bg-zinc-950 text-gray-900 dark:text-zinc-100 flex flex-col">
      <div className="bg-white dark:bg-zinc-900 border-b border-gray-200 dark:border-white/10">
        <div className="max-w-3xl mx-auto px-4 md:px-6 py-4">
          <Link
            href="/dashboard/settings/channels"
            className="inline-flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400 hover:underline mb-4"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Quay lại Cài đặt Kênh
          </Link>
          <div className="flex items-center gap-3">
            <span className="text-3xl">🪟</span>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Cài Zalo Monitor trên Windows</h1>
              <p className="text-sm text-gray-500 dark:text-zinc-400 mt-1">
                Hướng dẫn chi tiết — chỉ cần làm theo từng bước, không cần biết code.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 max-w-3xl mx-auto w-full px-4 md:px-6 py-8 space-y-6">

        {/* TỔNG QUAN */}
        <Card>
          <h2 className="text-lg font-bold mb-2">📋 Tổng quan</h2>
          <p className="text-sm text-gray-600 dark:text-zinc-400 mb-3 leading-relaxed">
            Cần một <strong>máy Windows</strong> bật 24/7 (PC để bàn / mini PC / Windows Server) đã đăng nhập Zalo của anh.
            Máy này sẽ là <em>cầu nối</em> đẩy tin nhắn về dashboard.
          </p>
          <p className="text-sm text-gray-600 dark:text-zinc-400 leading-relaxed">
            Toàn bộ quá trình ~ <strong>5 phút</strong>. Anh chỉ cần copy 1 lệnh + quét 1 mã QR.
          </p>
          <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
            <Badge tint="blue">Windows 10 / 11</Badge>
            <Badge tint="green">Cần quyền Administrator</Badge>
            <Badge tint="amber">Mạng internet</Badge>
          </div>
        </Card>

        {/* BƯỚC 1 */}
        <Step n={1} title="Mở PowerShell với quyền Administrator">
          <p className="text-sm text-gray-600 dark:text-zinc-400 mb-3">Anh có 2 cách. Chọn cách nào cũng được.</p>

          <div className="space-y-3">
            <Tip title="Cách 1 — Phím tắt nhanh nhất:">
              <ol className="text-sm text-gray-700 dark:text-zinc-300 space-y-1.5 list-decimal list-inside">
                <li>Nhấn <Kbd>Windows</Kbd> + <Kbd>X</Kbd> (giữ phím Windows rồi gõ X)</li>
                <li>Trong menu hiện ra, chọn <strong>"Terminal (Admin)"</strong> hoặc <strong>"Windows PowerShell (Admin)"</strong></li>
                <li>Cửa sổ <strong>"User Account Control"</strong> hỏi xác nhận → bấm <strong>"Yes"</strong></li>
              </ol>
            </Tip>

            <Tip title="Cách 2 — Tìm trong Start menu:">
              <ol className="text-sm text-gray-700 dark:text-zinc-300 space-y-1.5 list-decimal list-inside">
                <li>Bấm phím <Kbd>Windows</Kbd>, gõ <code className="px-1 rounded bg-gray-100 dark:bg-white/10">PowerShell</code></li>
                <li>Click <strong>chuột phải</strong> vào "Windows PowerShell"</li>
                <li>Chọn <strong>"Run as administrator"</strong> (Chạy với quyền quản trị)</li>
                <li>Hộp thoại UAC hỏi → bấm <strong>"Yes"</strong></li>
              </ol>
            </Tip>
          </div>

          <Note tint="blue">
            <strong>Sao biết đã mở Admin?</strong> Tiêu đề cửa sổ ghi <em>"Administrator: Windows PowerShell"</em> hoặc
            <em>"Administrator: Terminal"</em>. Nếu KHÔNG có chữ "Administrator" → đóng cửa sổ rồi mở lại theo cách trên.
          </Note>
        </Step>

        {/* BƯỚC 2 */}
        <Step n={2} title="Copy lệnh cài đặt">
          <p className="text-sm text-gray-600 dark:text-zinc-400 mb-3">Đây là lệnh dành riêng cho tài khoản của anh:</p>

          <div className="relative">
            <pre className="bg-gray-900 dark:bg-black text-green-400 text-[11px] md:text-xs font-mono rounded-lg p-3 pr-20 overflow-x-auto whitespace-pre-wrap break-all select-all">
              {cmd || 'Đang tải lệnh — đợi 1 giây...'}
            </pre>
            <button
              onClick={copyCmd}
              disabled={!cmd}
              className="absolute top-2 right-2 px-3 py-1.5 text-xs font-semibold text-white bg-blue-500 hover:bg-blue-600 disabled:opacity-50 rounded-md"
            >
              {copied ? '✓ Đã copy' : '📋 Copy'}
            </button>
          </div>

          <Note tint="amber">
            ⚠️ Lệnh này chứa <strong>secret riêng của anh</strong> — không chia sẻ cho người khác. Ai có lệnh này có thể đăng tin lên dashboard của anh.
          </Note>

          <details className="mt-3 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-lg p-3">
            <summary className="cursor-pointer text-xs font-semibold text-gray-700 dark:text-zinc-300">
              Chạy trên CMD thay PowerShell?
            </summary>
            <div className="mt-2 text-xs text-gray-600 dark:text-zinc-400 space-y-1.5">
              <p>Lệnh trên là PowerShell — <strong>không chạy trực tiếp trên CMD được</strong>. Nếu thích CMD, gọi PowerShell từ CMD:</p>
              <pre className="bg-gray-900 dark:bg-black text-green-400 text-[11px] font-mono p-2 rounded overflow-x-auto select-all whitespace-pre-wrap break-all">{`powershell -ExecutionPolicy Bypass -Command "${cmd}"`}</pre>
              <p>Khuyến nghị dùng PowerShell thẳng — đơn giản hơn.</p>
            </div>
          </details>
        </Step>

        {/* BƯỚC 3 */}
        <Step n={3} title='Paste lệnh vào PowerShell và nhấn Enter'>
          <ol className="text-sm text-gray-700 dark:text-zinc-300 space-y-2 list-decimal list-inside">
            <li>Click chuột vào cửa sổ PowerShell (đảm bảo nó được focus)</li>
            <li>Click chuột phải để paste — hoặc nhấn <Kbd>Ctrl</Kbd> + <Kbd>V</Kbd></li>
            <li>Lệnh hiện ra → Nhấn <Kbd>Enter</Kbd></li>
          </ol>

          <Note tint="blue">
            <strong>Script sẽ tự làm các việc sau (~2-3 phút):</strong>
            <ul className="mt-1.5 space-y-0.5 list-disc list-inside text-[13px]">
              <li>✓ Cài Node.js qua winget (nếu chưa có)</li>
              <li>✓ Cài openzca CLI</li>
              <li>✓ Tải <code>zalo-listener.mjs</code> về <code>%USERPROFILE%\.zalo-monitor\</code></li>
              <li>✓ Tạo Scheduled Task — listener tự chạy ngầm khi anh đăng nhập Windows</li>
              <li>✓ Test kết nối tới dashboard</li>
            </ul>
          </Note>

          <div className="mt-3 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-lg p-3">
            <p className="text-xs font-semibold mb-1">Khi script hỏi cài đặt qua winget:</p>
            <p className="text-xs text-gray-600 dark:text-zinc-400">→ Đợi tự động hoàn tất, không cần thao tác.</p>
          </div>
        </Step>

        {/* BƯỚC 4 */}
        <Step n={4} title="Đăng nhập Zalo qua dashboard (1 lần duy nhất)">
          <p className="text-sm text-gray-600 dark:text-zinc-400 mb-2">Sau khi script chạy xong:</p>

          <ol className="text-sm text-gray-700 dark:text-zinc-300 space-y-2 list-decimal list-inside">
            <li>
              Vào{' '}
              <Link
                href="/dashboard/settings/channels"
                className="text-blue-600 dark:text-blue-400 hover:underline font-medium"
              >
                Cài đặt → Kênh
              </Link>{' '}
              trên dashboard
            </li>
            <li>Tìm thẻ <strong>Zalo</strong> → bấm nút <strong>"Kết nối lại"</strong></li>
            <li>Một mã <strong>QR</strong> sẽ hiện ngay trên dashboard sau ~5 giây</li>
            <li>
              Mở <strong>Zalo trên điện thoại</strong> → vào <strong>Cài đặt</strong> →{' '}
              <strong>"Thiết bị đã đăng nhập"</strong> → <strong>"Thêm thiết bị"</strong>
            </li>
            <li>Quét mã QR trên dashboard</li>
          </ol>

          <Note tint="green">
            ✅ Quét xong → dashboard tự cập nhật trạng thái "Đã kết nối". Listener bắt đầu nhận tin nhắn real-time.
          </Note>

          <Note tint="amber">
            ⚠️ <strong>Đừng đăng nhập Zalo Web</strong> (chat.zalo.me) trên trình duyệt máy này — sẽ kick session listener.
          </Note>
        </Step>

        {/* BƯỚC 5 */}
        <Step n={5} title="Kiểm tra hoạt động">
          <ol className="text-sm text-gray-700 dark:text-zinc-300 space-y-2 list-decimal list-inside">
            <li>Mở Zalo trên điện thoại → gửi 1 tin vào nhóm bất kỳ</li>
            <li>
              Sau ~3 giây, mở{' '}
              <Link href="/dashboard/groups" className="text-blue-600 dark:text-blue-400 hover:underline font-medium">
                Dashboard → Chat
              </Link>{' '}
              → tin nhắn xuất hiện
            </li>
            <li>
              Vào{' '}
              <Link href="/dashboard/analytics" className="text-blue-600 dark:text-blue-400 hover:underline font-medium">
                Phân tích
              </Link>{' '}
              → xem tổng quan, biểu đồ
            </li>
          </ol>

          <Note tint="green">🎉 <strong>Xong!</strong> Listener tự khởi động ngầm mỗi lần anh login Windows. Không cần thao tác thêm.</Note>
        </Step>

        {/* TROUBLESHOOTING */}
        <Card>
          <h2 className="text-lg font-bold mb-3">🔧 Khi gặp sự cố</h2>

          <Faq q="Lệnh báo 'Cannot run' / 'Execution Policy' lỗi:">
            <p className="text-sm text-gray-600 dark:text-zinc-400">
              PowerShell mặc định chặn script. Trước khi chạy lệnh trên, paste lệnh sau rồi Enter:
            </p>
            <pre className="mt-1 bg-gray-900 dark:bg-black text-green-400 text-xs font-mono p-2 rounded select-all">Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force</pre>
            <p className="text-xs text-gray-500 dark:text-zinc-400 mt-1">Sau đó chạy lại lệnh cài.</p>
          </Faq>

          <Faq q="Báo 'winget không có'?">
            <p className="text-sm text-gray-600 dark:text-zinc-400">
              Winget có sẵn trên Windows 10 1709+. Nếu thiếu, cài từ{' '}
              <a
                href="https://apps.microsoft.com/detail/9NBLGGH4NNS1"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-500 hover:underline"
              >
                Microsoft Store: App Installer
              </a>
              .
            </p>
            <p className="text-sm text-gray-600 dark:text-zinc-400 mt-1">
              Hoặc tự cài Node tay tại{' '}
              <a
                href="https://nodejs.org"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-500 hover:underline"
              >
                nodejs.org
              </a>
              {' '}rồi chạy lại lệnh.
            </p>
          </Faq>

          <Faq q="Tin nhắn không về dashboard sau vài phút?">
            <ul className="text-sm text-gray-600 dark:text-zinc-400 space-y-1 list-disc list-inside">
              <li>Kiểm tra Zalo trên điện thoại còn login không</li>
              <li>
                Mở PowerShell (Admin) gõ:{' '}
                <code className="bg-gray-100 dark:bg-white/10 px-1 rounded text-[11px]">
                  schtasks /Query /TN ZaloMonitorListener
                </code>{' '}
                → kiểm tra Status = Running
              </li>
              <li>
                Nếu không Running, gõ:{' '}
                <code className="bg-gray-100 dark:bg-white/10 px-1 rounded text-[11px]">
                  schtasks /Run /TN ZaloMonitorListener
                </code>
              </li>
            </ul>
          </Faq>

          <Faq q="Cần restart / cập nhật listener?">
            <p className="text-sm text-gray-600 dark:text-zinc-400">
              Đơn giản: chạy lại đúng lệnh ở Bước 2 → script tự overwrite phiên bản mới và restart Scheduled Task.
            </p>
          </Faq>

          <Faq q="Tắt máy / restart Windows thì sao?">
            <p className="text-sm text-gray-600 dark:text-zinc-400">
              Listener tự khởi động lại mỗi lần anh login Windows (Scheduled Task on logon). Không cần làm gì.
            </p>
          </Faq>

          <Faq q="Cần xoá listener khỏi máy?">
            <p className="text-sm text-gray-600 dark:text-zinc-400 mb-1">PowerShell (Admin):</p>
            <pre className="bg-gray-900 dark:bg-black text-green-400 text-xs font-mono p-2 rounded select-all whitespace-pre-wrap">{`schtasks /Delete /TN ZaloMonitorListener /F
Remove-Item -Recurse -Force "$env:USERPROFILE\\.zalo-monitor"`}</pre>
          </Faq>
        </Card>

        {/* PRIVACY */}
        <Card>
          <h2 className="text-lg font-bold mb-2">🔐 Cam kết bảo mật</h2>
          <ul className="text-sm text-gray-600 dark:text-zinc-400 space-y-1.5 list-disc list-inside">
            <li><strong>Listener chỉ ĐỌC tin nhắn</strong> — không bao giờ tự reply / tự gửi</li>
            <li>Chỉ gửi tin khi anh chủ động bấm "Gửi" trên dashboard</li>
            <li>Tin nhắn 1-1 (DM) mặc định <strong>KHÔNG đồng bộ</strong> — anh tự bật nếu muốn</li>
            <li>Mã nguồn open-source — anh có thể audit toàn bộ</li>
            <li>Webhook secret là duy nhất, chỉ máy của anh có. Server không lưu password Zalo.</li>
          </ul>
        </Card>

      </div>
    </div>
  )
}

/* ───────────────────────── Helper components ───────────────────────── */

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-white dark:bg-zinc-900 dark:ring-1 dark:ring-white/5 rounded-xl p-5 md:p-6">
      {children}
    </div>
  )
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white dark:bg-zinc-900 dark:ring-1 dark:ring-white/5 rounded-xl p-5 md:p-6">
      <div className="flex items-start gap-3 mb-3">
        <div className="flex-shrink-0 w-9 h-9 rounded-full bg-blue-500 text-white font-bold flex items-center justify-center">
          {n}
        </div>
        <h2 className="text-lg font-bold text-gray-900 dark:text-zinc-100 mt-1">{title}</h2>
      </div>
      <div className="ml-0 md:ml-12 space-y-2">{children}</div>
    </div>
  )
}

function Tip({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-lg p-3">
      <p className="text-xs font-semibold text-gray-700 dark:text-zinc-300 mb-2">{title}</p>
      {children}
    </div>
  )
}

function Note({ tint, children }: { tint: 'blue' | 'green' | 'amber' | 'red'; children: React.ReactNode }) {
  const map = {
    blue: 'bg-blue-50 dark:bg-blue-500/10 border-blue-200 dark:border-blue-500/30 text-blue-800 dark:text-blue-300',
    green: 'bg-green-50 dark:bg-green-500/10 border-green-200 dark:border-green-500/30 text-green-800 dark:text-green-300',
    amber: 'bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/30 text-amber-800 dark:text-amber-300',
    red: 'bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/30 text-red-800 dark:text-red-300',
  }
  return <div className={`mt-3 px-3 py-2.5 border rounded-lg text-sm leading-relaxed ${map[tint]}`}>{children}</div>
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex items-center px-1.5 py-0.5 text-[11px] font-mono font-semibold bg-gray-100 dark:bg-white/10 border border-gray-300 dark:border-white/20 rounded shadow-sm">
      {children}
    </kbd>
  )
}

function Badge({ tint, children }: { tint: 'blue' | 'green' | 'amber'; children: React.ReactNode }) {
  const map = {
    blue: 'bg-blue-100 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300',
    green: 'bg-green-100 dark:bg-green-500/15 text-green-700 dark:text-green-300',
    amber: 'bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300',
  }
  return <span className={`inline-flex px-2 py-0.5 rounded-full font-medium ${map[tint]}`}>{children}</span>
}

function Faq({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <details className="border-t border-gray-100 dark:border-white/5 pt-3 mt-3 first:border-t-0 first:pt-0 first:mt-0">
      <summary className="cursor-pointer text-sm font-medium text-gray-800 dark:text-zinc-200 hover:text-gray-900 dark:hover:text-zinc-100">
        {q}
      </summary>
      <div className="mt-2 ml-4">{children}</div>
    </details>
  )
}
