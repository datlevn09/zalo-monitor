import Link from 'next/link'

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-white dark:bg-zinc-950 py-12">
      <div className="mx-auto max-w-2xl px-4">
        <Link href="/" className="text-blue-600 dark:text-blue-400 hover:underline text-sm mb-6 inline-block">
          ← Quay lại
        </Link>

        <article className="prose dark:prose-invert max-w-none">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-zinc-100 mb-2">
            Chính sách bảo mật
          </h1>
          <p className="text-sm text-gray-600 dark:text-zinc-400 mb-8">
            Zalo Monitor — Cập nhật: tháng 4 năm 2026
          </p>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-zinc-100 mb-3">
              Thông tin chúng tôi thu thập
            </h2>
            <p className="text-gray-700 dark:text-zinc-300">
              Chúng tôi thu thập: tên doanh nghiệp, email, tin nhắn từ các kênh chat được kết nối (Zalo, Telegram, Lark).
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-zinc-100 mb-3">
              Mục đích sử dụng
            </h2>
            <p className="text-gray-700 dark:text-zinc-300">
              Mục đích: phân tích, cảnh báo, báo cáo cho chính doanh nghiệp đó.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-zinc-100 mb-3">
              Cách ly dữ liệu
            </h2>
            <p className="text-gray-700 dark:text-zinc-300">
              Dữ liệu mỗi doanh nghiệp được cách ly — doanh nghiệp A không xem được dữ liệu doanh nghiệp B.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-zinc-100 mb-3">
              Quyền truy cập của nhà vận hành
            </h2>
            <p className="text-gray-700 dark:text-zinc-300">
              Là nhà vận hành dịch vụ, chúng tôi có thể truy cập dữ liệu kỹ thuật khi cần để duy trì hệ thống (bảo trì, hỗ trợ kỹ thuật). Chúng tôi không sử dụng nội dung tin nhắn cho mục đích khác.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-zinc-100 mb-3">
              Chia sẻ dữ liệu
            </h2>
            <p className="text-gray-700 dark:text-zinc-300">
              Dữ liệu không được bán cho bên thứ ba.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-zinc-100 mb-3">
              Xóa tài khoản
            </h2>
            <p className="text-gray-700 dark:text-zinc-300">
              Liên hệ hỗ trợ — dữ liệu sẽ bị xóa hoàn toàn trong 30 ngày.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-zinc-100 mb-3">
              Liên hệ
            </h2>
            <p className="text-gray-700 dark:text-zinc-300">
              Email: <a href="mailto:datle@outlook.com" className="text-blue-600 dark:text-blue-400 hover:underline">datle@outlook.com</a>
            </p>
          </section>
        </article>
      </div>
    </div>
  )
}
