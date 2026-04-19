'use client'

import { Suspense, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { setToken, setTenantId } from '@/lib/api'

function Inner() {
  const router = useRouter()
  const search = useSearchParams()

  useEffect(() => {
    const token = search.get('token')
    const tenantId = search.get('tenantId')
    if (token && tenantId) {
      setToken(token)
      setTenantId(tenantId)
      router.replace('/dashboard')
    } else {
      router.replace('/login?error=google_failed')
    }
  }, [router, search])

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <p className="text-sm text-gray-500 dark:text-zinc-400">Đang đăng nhập...</p>
    </div>
  )
}

export default function GoogleCompletePage() {
  return (
    <Suspense fallback={null}>
      <Inner />
    </Suspense>
  )
}
