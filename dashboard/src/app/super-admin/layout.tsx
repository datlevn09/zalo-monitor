'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { getSuperAdminToken } from '@/lib/super-admin'
import { Footer } from '@/components/Footer'
import { Header } from '@/components/Header'

export default function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [isChecking, setIsChecking] = useState(true)

  useEffect(() => {
    const token = getSuperAdminToken()
    const isLoginPage = pathname === '/super-admin'

    if (!token && !isLoginPage) {
      router.push('/super-admin')
    }
    setIsChecking(false)
  }, [pathname, router])

  if (isChecking) {
    return null
  }

  return (
    <div className="h-[100dvh] overflow-hidden bg-[#f2f2f7] dark:bg-zinc-950 text-gray-900 dark:text-zinc-100 flex flex-col">
      <Header right={<span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-500/15 text-blue-600 dark:text-blue-300 font-semibold">SUPER ADMIN</span>} />
      <main className="flex-1 overflow-auto">{children}</main>
      <Footer />
    </div>
  )
}
