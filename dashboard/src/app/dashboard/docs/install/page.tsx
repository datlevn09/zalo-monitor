'use client'

/**
 * Mirror trang /docs/install dưới dashboard layout — giữ sidebar khi
 * user click 'Hướng dẫn' trong nav. Nội dung guide tái sử dụng từ
 * /docs/install (public).
 */
import InstallGuide from '@/app/docs/install/page'

export default function DashboardInstallGuide() {
  return <InstallGuide />
}
