import { Footer } from '@/components/Footer'
import { Header } from '@/components/Header'

export const metadata = { title: 'Super Admin · Zalo Monitor' }

export default function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-[100dvh] overflow-hidden bg-[#f2f2f7] dark:bg-zinc-950 text-gray-900 dark:text-zinc-100 flex flex-col">
      <Header right={<span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-500/15 text-purple-600 dark:text-purple-300 font-semibold">ADMIN</span>} />
      <main className="flex-1 overflow-auto">{children}</main>
      <Footer />
    </div>
  )
}
