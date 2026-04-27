import Link from 'next/link'

export default function PendingPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10">
      <div className="max-w-md text-center">
        <div className="text-6xl mb-4">🎉</div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-zinc-100 mb-2">Đăng ký thành công!</h1>

        <div className="bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/30 rounded-2xl p-6 mb-6">
          <p className="text-gray-700 dark:text-zinc-300 text-sm leading-relaxed">
            <span className="block font-semibold text-blue-900 dark:text-blue-200 mb-2">Tài khoản của bạn đang chờ kích hoạt.</span>
            Chúng tôi sẽ liên hệ trong vòng 24 giờ để xác minh thông tin và kích hoạt dùng thử.
          </p>
        </div>

        <p className="text-sm text-gray-600 dark:text-zinc-400 mb-6">
          Nếu cần hỗ trợ ngay, liên hệ anh Dat Thong Dong:
        </p>

        <div className="flex gap-3 mb-6">
          <a
            href="https://zalo.me/0868428000"
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl transition-colors"
          >
            💬 Zalo
          </a>
          <a
            href="tel:0868428000"
            className="flex-1 py-2.5 bg-gray-200 dark:bg-white/10 hover:bg-gray-300 dark:hover:bg-white/15 text-gray-900 dark:text-zinc-100 text-sm font-semibold rounded-xl transition-colors"
          >
            📞 Gọi
          </a>
        </div>

        <Link
          href="/"
          className="inline-block text-blue-600 dark:text-blue-400 hover:underline text-sm font-medium"
        >
          ← Quay lại trang chủ
        </Link>
      </div>
    </div>
  )
}
