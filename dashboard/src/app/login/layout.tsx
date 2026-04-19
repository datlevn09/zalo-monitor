import { Footer } from '@/components/Footer'
import { Header } from '@/components/Header'

export const metadata = { title: 'Đăng nhập · Zalo Monitor' }

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-[100dvh] overflow-hidden bg-[#f2f2f7] dark:bg-zinc-950 text-gray-900 dark:text-zinc-100 flex flex-col">
      <Header />
      <main className="flex-1 overflow-auto">{children}</main>
      <Footer />
    </div>
  )
}
