'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'

type Platform = 'windows' | 'mac' | 'vps' | 'nas'

const PLATFORMS: { key: Platform; icon: string; label: string; tag: string }[] = [
  { key: 'windows', icon: '🪟', label: 'Windows', tag: 'Phổ biến' },
  { key: 'mac',     icon: '🍎', label: 'macOS',   tag: 'MacBook / Mac mini' },
  { key: 'vps',     icon: '☁️', label: 'VPS Linux', tag: 'Production' },
  { key: 'nas',     icon: '📦', label: 'NAS / Docker', tag: 'Self-host' },
]

export default function InstallGuidePage() {
  // Auto-detect OS ngay khi mount (lazy init → không bị flash sai tab trước render)
  const [tab, setTab] = useState<Platform>(() => {
    if (typeof navigator === 'undefined') return 'windows'
    const ua = navigator.userAgent.toLowerCase()
    if (ua.includes('mac')) return 'mac'
    if (ua.includes('linux') && !ua.includes('android')) return 'vps'
    return 'windows'
  })
  const [cmd, setCmd] = useState<{ oneLineCommand?: string; windowsCommand?: string; dockerCommand?: string }>({})
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    api<typeof cmd>('/api/auth/my-install-command').then(setCmd).catch(() => undefined)
  }, [])

  const installCmd =
    tab === 'windows' ? cmd.windowsCommand :
    tab === 'nas' ? cmd.dockerCommand :
    cmd.oneLineCommand

  function copy() {
    if (!installCmd) return
    navigator.clipboard.writeText(installCmd)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="min-h-[100dvh] bg-[#f2f2f7] dark:bg-zinc-950 text-gray-900 dark:text-zinc-100 flex flex-col">
      {/* Header */}
      <div className="bg-white dark:bg-zinc-900 border-b border-gray-200 dark:border-white/10">
        <div className="max-w-3xl mx-auto px-4 md:px-6 py-4">
          <Link href="/dashboard/settings/channels" className="inline-flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400 hover:underline mb-3">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Quay lại Cài đặt
          </Link>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Hướng dẫn cài đặt Listener</h1>
          <p className="text-sm text-gray-500 dark:text-zinc-400 mt-1">
            Chọn loại máy anh sẽ chạy listener. Toàn bộ quá trình ~ 5 phút — copy 1 lệnh + quét 1 mã QR.
          </p>
        </div>
      </div>

      {/* Sticky tab nav */}
      <div className="sticky top-0 z-20 bg-[#f2f2f7]/95 dark:bg-zinc-950/95 backdrop-blur-xl border-b border-gray-200 dark:border-white/10">
        <div className="max-w-3xl mx-auto px-4 md:px-6 py-2 grid grid-cols-4 gap-1.5">
          {PLATFORMS.map(p => (
            <button
              key={p.key}
              onClick={() => setTab(p.key)}
              className={`flex flex-col items-center justify-center px-2 py-2 rounded-xl transition-all text-xs ${
                tab === p.key
                  ? 'bg-blue-500 text-white shadow-sm'
                  : 'bg-white dark:bg-white/5 text-gray-700 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-white/10'
              }`}
            >
              <span className="text-xl mb-0.5">{p.icon}</span>
              <span className="font-semibold">{p.label}</span>
              <span className={`text-[10px] mt-0.5 ${tab === p.key ? 'text-blue-100' : 'text-gray-400 dark:text-zinc-500'}`}>{p.tag}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 max-w-3xl mx-auto w-full px-4 md:px-6 py-6 space-y-5">
        {/* Common: Tổng quan */}
        <Card>
          <h2 className="text-lg font-bold mb-2">📋 Tổng quan</h2>
          <p className="text-sm text-gray-600 dark:text-zinc-400 leading-relaxed">
            <strong>Listener</strong> là 1 chương trình nhỏ chạy ngầm trên máy có Zalo của bạn.
            Nó <strong>chỉ ĐỌC</strong> tin nhắn và đẩy về dashboard — <em>không bao giờ</em> tự reply.
            Chỉ gửi tin khi bạn chủ động bấm Gửi từ dashboard.
          </p>
        </Card>

        {/* Bước 0 — Đăng ký tài khoản */}
        <Step n={0} title="Bước 1 — Tạo tài khoản dashboard" customIcon="📝">
          <ol className="text-sm text-gray-700 dark:text-zinc-300 space-y-2 list-decimal list-inside">
            <li>
              Truy cập{' '}
              <Link href="/register" className="text-blue-600 dark:text-blue-400 hover:underline font-medium">
                trang Đăng ký
              </Link>
              {' '}— nhập tên doanh nghiệp + email + mật khẩu.
            </li>
            <li>Có thể đăng nhập bằng <strong>Google</strong> nếu thuận tiện.</li>
            <li>Sau khi đăng ký → tự động chuyển vào dashboard.</li>
            <li>
              Có thể cấu hình <Link href="/dashboard/settings" className="text-blue-600 dark:text-blue-400 hover:underline font-medium">
              API Key AI riêng</Link> (Anthropic / OpenAI / Google) hoặc dùng key chung của hệ thống.
            </li>
          </ol>
          <div className="mt-3 p-3 bg-blue-50 dark:bg-blue-500/10 rounded-lg text-xs text-blue-800 dark:text-blue-300">
            💡 <strong>Chưa muốn cài listener?</strong> Bạn vẫn có thể đăng ký để xem board mà người khác chia sẻ cho bạn (nếu có) — không cần cài gì thêm.
          </div>
        </Step>

        {/* Bước 1 — Cài listener (intro) */}
        <Step n={1} title="Bước 2 — Cài listener trên máy có Zalo" customIcon="💻">
          <p className="text-sm text-gray-700 dark:text-zinc-300 mb-2">
            Chọn nền tảng máy bạn dùng (Windows / macOS / VPS Linux / NAS) ở tab phía trên rồi làm theo hướng dẫn cụ thể.
          </p>
          <p className="text-xs text-gray-500 dark:text-zinc-400">
            Mỗi tài khoản Zalo cần 1 listener riêng. Lệnh cài có sẵn webhookSecret riêng cho doanh nghiệp của bạn.
          </p>
        </Step>

        {/* Multi-Zalo guide */}
        <Step n={50} title="Quản nhiều Zalo / Doanh nghiệp" customIcon="🏢">
          <p className="text-sm text-gray-700 dark:text-zinc-300 mb-3">
            1 email có thể tạo nhiều doanh nghiệp (mỗi DN = 1 Zalo riêng) — vào dashboard, click avatar tên DN ở góc phải header → "Thêm doanh nghiệp / Zalo mới".
          </p>
          <div className="p-3 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-lg mb-3">
            <p className="text-xs font-semibold text-amber-800 dark:text-amber-300 mb-1">⚠️ Zalo PC chỉ login 1 account / lúc</p>
            <p className="text-xs text-amber-700 dark:text-amber-300 leading-relaxed">
              Nếu muốn theo dõi 2+ Zalo trên cùng 1 máy → phải tắt Zalo PC chính khi quét QR cho profile khác (openzca dùng profile riêng nhưng Zalo native chỉ giữ 1 phiên).
            </p>
          </div>
          <p className="text-xs text-gray-600 dark:text-zinc-400 leading-relaxed mb-2">
            <strong>Khuyến nghị</strong>:
          </p>
          <ul className="text-xs text-gray-600 dark:text-zinc-400 space-y-1 list-disc list-inside">
            <li>Mỗi Zalo cài listener trên 1 máy riêng (PC khác / VPS / NAS) — đơn giản, không đụng nhau, mỗi máy mở Zalo PC bình thường.</li>
            <li>Quét QR 1 lần đầu cho mỗi tenant. Session lưu vĩnh viễn — restart máy không cần quét lại.</li>
            <li>Switch giữa các tenant trên dashboard: header → tên DN → chọn DN khác.</li>
          </ul>
        </Step>

        {/* Platform-specific */}
        {tab === 'windows' && <WindowsGuide cmd={installCmd} copy={copy} copied={copied} />}
        {tab === 'mac'     && <MacGuide     cmd={installCmd} copy={copy} copied={copied} />}
        {tab === 'vps'     && <VpsGuide     cmd={installCmd} copy={copy} copied={copied} />}
        {tab === 'nas'     && <NasGuide     cmd={installCmd} copy={copy} copied={copied} />}

        {/* Common: After install */}
        <Step n={99} title="Bước cuối — Đăng nhập Zalo qua dashboard" customIcon="🔗">
          <ol className="text-sm text-gray-700 dark:text-zinc-300 space-y-2 list-decimal list-inside">
            <li>
              Vào{' '}
              <Link href="/dashboard/settings/channels" className="text-blue-600 dark:text-blue-400 hover:underline font-medium">
                Cài đặt → Kênh
              </Link>
            </li>
            <li>Bấm <strong>"Kết nối lại"</strong> ở thẻ Zalo → QR hiện sau ~5 giây</li>
            <li>Mở Zalo điện thoại → <strong>Cài đặt</strong> → <strong>Thiết bị đã đăng nhập</strong> → <strong>Thêm thiết bị</strong></li>
            <li>Quét mã QR trên dashboard</li>
          </ol>
          <Note tint="green">✅ Quét xong → dashboard tự cập nhật. Listener bắt đầu nhận tin nhắn real-time.</Note>
          <Note tint="amber">⚠️ <strong>Đừng đăng nhập Zalo Web</strong> (chat.zalo.me) trên trình duyệt cùng máy — sẽ kick session.</Note>
        </Step>

        {/* Common: Privacy */}
        <Card>
          <h2 className="text-lg font-bold mb-2">🔐 Cam kết bảo mật</h2>
          <ul className="text-sm text-gray-600 dark:text-zinc-400 space-y-1 list-disc list-inside">
            <li><strong>Listener chỉ ĐỌC</strong> — không bao giờ tự reply / tự gửi</li>
            <li>Chỉ gửi tin khi anh chủ động bấm "Gửi" trên dashboard</li>
            <li>Tin nhắn 1-1 (DM) <strong>mặc định KHÔNG đồng bộ</strong> — anh tự bật nếu muốn</li>
            <li>Webhook secret duy nhất, chỉ máy của anh có. Server không lưu password Zalo.</li>
          </ul>
        </Card>
      </div>
    </div>
  )
}

/* ────────────────────────── Platform sections ────────────────────────── */

function WindowsGuide({ cmd, copy, copied }: { cmd?: string; copy: () => void; copied: boolean }) {
  return (
    <>
      <Step n={1} title="Mở PowerShell với quyền Administrator">
        <Tip title="Cách 1 — Phím tắt:">
          <ol className="text-sm text-gray-700 dark:text-zinc-300 space-y-1 list-decimal list-inside">
            <li>Nhấn <Kbd>Windows</Kbd> + <Kbd>X</Kbd></li>
            <li>Chọn <strong>"Terminal (Admin)"</strong> hoặc <strong>"Windows PowerShell (Admin)"</strong></li>
            <li>UAC hỏi → bấm <strong>Yes</strong></li>
          </ol>
        </Tip>
        <Tip title="Cách 2 — Tìm Start menu:">
          <ol className="text-sm text-gray-700 dark:text-zinc-300 space-y-1 list-decimal list-inside">
            <li>Bấm <Kbd>Windows</Kbd>, gõ <code>PowerShell</code></li>
            <li>Click <strong>chuột phải</strong> → <strong>"Run as administrator"</strong></li>
          </ol>
        </Tip>
        <Note tint="blue">
          ✓ Tiêu đề cửa sổ ghi <em>"Administrator: ..."</em> mới đúng. Không có chữ "Administrator" → mở lại.
        </Note>
      </Step>

      <Step n={2} title="Copy + paste lệnh + Enter">
        <CmdBox cmd={cmd} copy={copy} copied={copied} />
        <ol className="mt-3 text-sm text-gray-700 dark:text-zinc-300 space-y-1.5 list-decimal list-inside">
          <li>Click vào cửa sổ PowerShell</li>
          <li>Click chuột phải để paste — hoặc <Kbd>Ctrl</Kbd> + <Kbd>V</Kbd></li>
          <li>Nhấn <Kbd>Enter</Kbd></li>
        </ol>
        <Note tint="blue">
          Script tự cài Node.js (qua winget) + openzca + tạo Scheduled Task (~2-3 phút).
        </Note>
      </Step>

      <Faqs>
        <Faq q="Báo 'Execution Policy' không cho chạy?">
          <p className="text-sm text-gray-600 dark:text-zinc-400">Chạy lệnh sau trước:</p>
          <Code>Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force</Code>
        </Faq>
        <Faq q="Báo 'winget' không có?">
          <p className="text-sm text-gray-600 dark:text-zinc-400">
            Cài <a href="https://apps.microsoft.com/detail/9NBLGGH4NNS1" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">App Installer</a> từ Microsoft Store, hoặc cài Node tay tại <a href="https://nodejs.org" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">nodejs.org</a> rồi chạy lại.
          </p>
        </Faq>
        <Faq q="Listener không chạy / tin không về dashboard?">
          <p className="text-sm text-gray-600 dark:text-zinc-400">PowerShell (Admin):</p>
          <Code>{`schtasks /Query /TN ZaloMonitorListener
schtasks /Run /TN ZaloMonitorListener`}</Code>
        </Faq>
        <Faq q="Cập nhật listener?">
          <p className="text-sm text-gray-600 dark:text-zinc-400">Chạy lại đúng lệnh ở Bước 2 → script tự overwrite + restart.</p>
        </Faq>
        <Faq q="Gỡ cài listener?">
          <Code>{`schtasks /Delete /TN ZaloMonitorListener /F
Remove-Item -Recurse -Force "$env:USERPROFILE\\.zalo-monitor"`}</Code>
        </Faq>
      </Faqs>
    </>
  )
}

function MacGuide({ cmd, copy, copied }: { cmd?: string; copy: () => void; copied: boolean }) {
  return (
    <>
      <Step n={1} title="Mở Terminal">
        <ol className="text-sm text-gray-700 dark:text-zinc-300 space-y-1 list-decimal list-inside">
          <li>Nhấn <Kbd>⌘</Kbd> + <Kbd>Space</Kbd> (Spotlight)</li>
          <li>Gõ <code>Terminal</code> → Enter</li>
        </ol>
      </Step>

      <Step n={2} title="Copy + paste lệnh + Enter">
        <CmdBox cmd={cmd} copy={copy} copied={copied} />
        <ol className="mt-3 text-sm text-gray-700 dark:text-zinc-300 space-y-1.5 list-decimal list-inside">
          <li>Click vào Terminal</li>
          <li>Nhấn <Kbd>⌘</Kbd> + <Kbd>V</Kbd> để paste</li>
          <li>Nhấn <Kbd>Enter</Kbd></li>
        </ol>
        <Note tint="blue">
          Script cài Node (qua Homebrew) + openzca + tạo launchd service tự khởi động khi anh login Mac.
        </Note>
      </Step>

      <Faqs>
        <Faq q="Báo 'permission denied' khi cài npm global?">
          <p className="text-sm text-gray-600 dark:text-zinc-400">Chạy với sudo:</p>
          <Code>sudo npm install -g openzca</Code>
        </Faq>
        <Faq q="Đóng Terminal có ảnh hưởng listener?">
          <p className="text-sm text-gray-600 dark:text-zinc-400">Không. Listener chạy ngầm qua launchd, độc lập với Terminal.</p>
        </Faq>
        <Faq q="Restart Mac?">
          <p className="text-sm text-gray-600 dark:text-zinc-400">Listener tự khởi động lại khi anh login lại Mac.</p>
        </Faq>
      </Faqs>
    </>
  )
}

function VpsGuide({ cmd, copy, copied }: { cmd?: string; copy: () => void; copied: boolean }) {
  return (
    <>
      <Card>
        <h2 className="text-base font-bold mb-2">📦 Cần chuẩn bị</h2>
        <ul className="text-sm text-gray-600 dark:text-zinc-400 space-y-1 list-disc list-inside">
          <li>VPS Ubuntu 20.04+ / Debian 11+ / CentOS 8+ (RAM ≥ 512MB)</li>
          <li>Quyền root hoặc sudo</li>
          <li>Mua VPS rẻ ~ 60-100k/tháng tại Vultr, DigitalOcean, BizflyCloud, Vinahost...</li>
        </ul>
      </Card>

      <Step n={1} title="SSH vào VPS">
        <p className="text-sm text-gray-600 dark:text-zinc-400 mb-2">Trên Mac/Linux: mở Terminal. Trên Windows: PowerShell hoặc PuTTY.</p>
        <Code>{`ssh root@<IP-VPS-CỦA-ANH>`}</Code>
        <Note tint="amber">Lần đầu hỏi yes/no → gõ <Kbd>yes</Kbd>. Nhập password (gõ không hiện ký tự).</Note>
      </Step>

      <Step n={2} title="Copy + paste lệnh cài">
        <CmdBox cmd={cmd} copy={copy} copied={copied} />
        <p className="text-sm text-gray-600 dark:text-zinc-400 mt-2">Click chuột phải để paste vào terminal SSH. ~ 2-3 phút.</p>
      </Step>

      <Faqs>
        <Faq q="Xem listener đang chạy?">
          <Code>systemctl --user status zalo-monitor-listener</Code>
        </Faq>
        <Faq q="Xem log real-time?">
          <Code>journalctl --user -u zalo-monitor-listener -f</Code>
        </Faq>
        <Faq q="Restart listener?">
          <Code>systemctl --user restart zalo-monitor-listener</Code>
        </Faq>
        <Faq q="Cập nhật listener?">
          <p className="text-sm text-gray-600 dark:text-zinc-400">Chạy lại đúng lệnh ở Bước 2 (idempotent).</p>
        </Faq>
        <Faq q="Gỡ cài đặt?">
          <Code>{`systemctl --user disable --now zalo-monitor-listener
rm -rf ~/.zalo-monitor ~/.config/systemd/user/zalo-monitor-listener.service
systemctl --user daemon-reload`}</Code>
        </Faq>
      </Faqs>
    </>
  )
}

function NasGuide({ cmd, copy, copied }: { cmd?: string; copy: () => void; copied: boolean }) {
  return (
    <>
      <Card>
        <h2 className="text-base font-bold mb-2">📦 Cần chuẩn bị</h2>
        <ul className="text-sm text-gray-600 dark:text-zinc-400 space-y-1 list-disc list-inside">
          <li>Có Docker (NAS Synology với Container Manager / Docker Engine)</li>
          <li>Quyền chạy Docker (sudo hoặc user trong docker group)</li>
        </ul>
      </Card>

      <Step n={1} title="Mở terminal có quyền Docker">
        <ul className="text-sm text-gray-700 dark:text-zinc-300 space-y-1 list-disc list-inside">
          <li><strong>NAS Synology:</strong> SSH vào NAS với user admin (hoặc Container Manager UI)</li>
          <li><strong>Linux/Mac:</strong> mở Terminal</li>
          <li><strong>Windows:</strong> mở PowerShell với Docker Desktop đang chạy</li>
        </ul>
      </Step>

      <Step n={2} title="Copy + paste lệnh">
        <CmdBox cmd={cmd} copy={copy} copied={copied} />
        <Note tint="blue">
          Container tự khởi động khi máy reboot (<code>--restart unless-stopped</code>). Volume <code>zalo-monitor-data</code> bảo lưu session — không phải đăng nhập lại.
        </Note>
      </Step>

      <Faqs>
        <Faq q="Xem container?">
          <Code>docker ps | grep zalo-monitor-listener</Code>
        </Faq>
        <Faq q="Log real-time?">
          <Code>docker logs -f zalo-monitor-listener</Code>
        </Faq>
        <Faq q="Restart?">
          <Code>docker restart zalo-monitor-listener</Code>
        </Faq>
        <Faq q="Cập nhật?">
          <Code>{`docker stop zalo-monitor-listener
docker rm zalo-monitor-listener
# Chạy lại lệnh ở Bước 2`}</Code>
          <p className="text-sm text-gray-600 dark:text-zinc-400 mt-1">Volume giữ session — không cần login lại.</p>
        </Faq>
        <Faq q="Gỡ hoàn toàn?">
          <Code>{`docker stop zalo-monitor-listener
docker rm zalo-monitor-listener
docker volume rm zalo-monitor-data`}</Code>
        </Faq>
      </Faqs>
    </>
  )
}

/* ────────────────────────── Components helpers ────────────────────────── */

function Card({ children }: { children: React.ReactNode }) {
  return <div className="bg-white dark:bg-zinc-900 dark:ring-1 dark:ring-white/5 rounded-xl p-5 md:p-6">{children}</div>
}

function Step({ n, title, customIcon, children }: { n: number; title: string; customIcon?: string; children: React.ReactNode }) {
  return (
    <div className="bg-white dark:bg-zinc-900 dark:ring-1 dark:ring-white/5 rounded-xl p-5 md:p-6">
      <div className="flex items-start gap-3 mb-3">
        <div className="flex-shrink-0 w-9 h-9 rounded-full bg-blue-500 text-white font-bold flex items-center justify-center">
          {customIcon ?? n}
        </div>
        <h2 className="text-lg font-bold text-gray-900 dark:text-zinc-100 mt-1">{title}</h2>
      </div>
      <div className="ml-0 md:ml-12 space-y-2">{children}</div>
    </div>
  )
}

function Tip({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-lg p-3 mb-2">
      <p className="text-xs font-semibold text-gray-700 dark:text-zinc-300 mb-2">{title}</p>
      {children}
    </div>
  )
}

function Note({ tint, children }: { tint: 'blue' | 'green' | 'amber'; children: React.ReactNode }) {
  const map = {
    blue: 'bg-blue-50 dark:bg-blue-500/10 border-blue-200 dark:border-blue-500/30 text-blue-800 dark:text-blue-300',
    green: 'bg-green-50 dark:bg-green-500/10 border-green-200 dark:border-green-500/30 text-green-800 dark:text-green-300',
    amber: 'bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/30 text-amber-800 dark:text-amber-300',
  }
  return <div className={`mt-3 px-3 py-2.5 border rounded-lg text-sm leading-relaxed ${map[tint]}`}>{children}</div>
}

function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="inline-flex items-center px-1.5 py-0.5 text-[11px] font-mono font-semibold bg-gray-100 dark:bg-white/10 border border-gray-300 dark:border-white/20 rounded shadow-sm">{children}</kbd>
}

function Code({ children }: { children: string }) {
  return <pre className="bg-gray-900 dark:bg-black text-green-400 text-xs font-mono p-2 rounded select-all whitespace-pre-wrap break-all mt-1">{children}</pre>
}

function CmdBox({ cmd, copy, copied }: { cmd?: string; copy: () => void; copied: boolean }) {
  return (
    <div className="relative">
      <pre className="bg-gray-900 dark:bg-black text-green-400 text-[11px] md:text-xs font-mono rounded-lg p-3 pr-20 overflow-x-auto whitespace-pre-wrap break-all select-all">
        {cmd || 'Đang tải lệnh...'}
      </pre>
      <button
        onClick={copy}
        disabled={!cmd}
        className="absolute top-2 right-2 px-3 py-1.5 text-xs font-semibold text-white bg-blue-500 hover:bg-blue-600 disabled:opacity-50 rounded-md"
      >
        {copied ? '✓ Đã copy' : '📋 Copy'}
      </button>
    </div>
  )
}

function Faqs({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-white dark:bg-zinc-900 dark:ring-1 dark:ring-white/5 rounded-xl p-5 md:p-6">
      <h2 className="text-lg font-bold mb-3">🔧 Sự cố thường gặp</h2>
      <div className="divide-y divide-gray-100 dark:divide-white/5">{children}</div>
    </div>
  )
}

function Faq({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <details className="py-3 first:pt-0 last:pb-0">
      <summary className="cursor-pointer text-sm font-medium text-gray-800 dark:text-zinc-200 hover:text-gray-900 dark:hover:text-zinc-100">{q}</summary>
      <div className="mt-2 ml-4">{children}</div>
    </details>
  )
}
