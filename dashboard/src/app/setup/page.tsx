import { Suspense } from 'react'
import { SetupPageClient } from '@/components/setup/SetupPageClient'

export type SetupState = {
  tenantId: string
  slug: string
  webhookUrl: string
}

export default function SetupPage() {
  return (
    <Suspense>
      <SetupPageClient />
    </Suspense>
  )
}
