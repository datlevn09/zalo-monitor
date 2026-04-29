import Link from 'next/link'

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-white dark:bg-zinc-950 py-12">
      <div className="mx-auto max-w-2xl px-4">
        <Link href="/" className="text-blue-600 dark:text-blue-400 hover:underline text-sm mb-6 inline-block">
          ← Quay lại
        </Link>

        <article className="prose dark:prose-invert max-w-none">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-zinc-100 mb-2">
            Điều khoản sử dụng
          </h1>
          <p className="text-sm text-gray-600 dark:text-zinc-400 mb-8">
            Zalo Monitor — Cập nhật: tháng 4 năm 2026
          </p>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-zinc-100 mb-3">
              Mô tả dịch vụ
            </h2>
            <p className="text-gray-700 dark:text-zinc-300">
              Dịch vụ cung cấp dashboard đồng bộ dữ liệu từ Zalo/Telegram/Lark.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-zinc-100 mb-3">
              Trách nhiệm của người dùng
            </h2>
            <p className="text-gray-700 dark:text-zinc-300">
              Người dùng chịu trách nhiệm tuân thủ quy định pháp luật khi sử dụng (không dùng để theo dõi trái phép).
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-zinc-100 mb-3">
              Tính khả dụng của dịch vụ
            </h2>
            <p className="text-gray-700 dark:text-zinc-300">
              Dịch vụ có thể gián đoạn để bảo trì — không đảm bảo uptime 100%.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-zinc-100 mb-3">
              Giới hạn trách nhiệm
            </h2>
            <p className="text-gray-700 dark:text-zinc-300">
              Chúng tôi không chịu trách nhiệm về thiệt hại gián tiếp phát sinh từ việc sử dụng.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-zinc-100 mb-3">
              Hủy tài khoản
            </h2>
            <p className="text-gray-700 dark:text-zinc-300">
              Người dùng có thể hủy tài khoản bất cứ lúc nào.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-zinc-100 mb-3">
              Liên hệ
            </h2>
            <p className="text-gray-700 dark:text-zinc-300">
              Mọi câu hỏi về điều khoản, hỗ trợ kỹ thuật hoặc hợp tác — gửi qua{' '}
              <Link href="/contact" className="text-blue-600 dark:text-blue-400 hover:underline font-medium">trang Liên hệ</Link>.
            </p>
          </section>

          {/* Cross-link giữa các trang công khai */}
          <nav className="mt-10 pt-6 border-t border-gray-200 dark:border-white/10 flex flex-wrap gap-4 text-sm">
            <Link href="/contact" className="text-blue-600 dark:text-blue-400 hover:underline">Liên hệ</Link>
            <Link href="/privacy" className="text-blue-600 dark:text-blue-400 hover:underline">Chính sách bảo mật</Link>
            <Link href="/" className="text-gray-500 dark:text-zinc-400 hover:underline">Trang chủ</Link>
          </nav>
        </article>
      </div>
    </div>
  )
}
