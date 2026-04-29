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

          <section className="mb-8 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 rounded-xl p-4">
            <h2 className="text-lg font-semibold text-emerald-900 dark:text-emerald-200 mb-2">
              Cam kết về dữ liệu của bạn
            </h2>
            <p className="text-sm text-emerald-800 dark:text-emerald-200 leading-relaxed">
              <strong>Chúng tôi không đọc nội dung tin nhắn của bạn.</strong> Dữ liệu chỉ được hệ thống xử lý tự động để phục vụ chính bạn — phân loại tin, gợi ý, báo cáo.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-zinc-100 mb-3">
              Dữ liệu được đồng bộ
            </h2>
            <p className="text-gray-700 dark:text-zinc-300">
              Dịch vụ đồng bộ: tên doanh nghiệp, email, dữ liệu hội thoại từ các kênh chat đã kết nối (Zalo, Telegram, Lark).
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
              Chúng tôi không đọc nội dung tin nhắn của bạn. Việc bảo trì, sao lưu, theo dõi hiệu năng chỉ thao tác trên metadata (tên nhóm, thời gian, số lượng).
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
              Câu hỏi, khiếu nại hoặc yêu cầu liên quan đến dữ liệu cá nhân — vui lòng truy cập{' '}
              <Link href="/contact" className="text-blue-600 dark:text-blue-400 hover:underline font-medium">trang Liên hệ</Link>
              {' '}để gửi lời nhắn hoặc xem thông tin trực tiếp với tác giả.
            </p>
          </section>

          {/* Cross-link giữa các trang công khai */}
          <nav className="mt-10 pt-6 border-t border-gray-200 dark:border-white/10 flex flex-wrap gap-4 text-sm">
            <Link href="/contact" className="text-blue-600 dark:text-blue-400 hover:underline">Liên hệ</Link>
            <Link href="/terms" className="text-blue-600 dark:text-blue-400 hover:underline">Điều khoản sử dụng</Link>
            <Link href="/" className="text-gray-500 dark:text-zinc-400 hover:underline">Trang chủ</Link>
          </nav>
        </article>
      </div>
    </div>
  )
}
