'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Step2Connect } from '@/components/setup/Step2Connect'
import { Step3Notify } from '@/components/setup/Step3Notify'
import { Step4Done } from '@/components/setup/Step4Done'
import { API_URL, setTenantId, getTenantId } from '@/lib/api'
import { Footer } from '@/components/Footer'

export type SetupState = {
  tenantId: string
  slug: string
  webhookUrl: string
}

type Tenant = {
  id: string
  name: string
  slug: string
  industry: string | null
  setupDone: boolean
  _count: { groups: number }
}

const STEPS = ['Kết nối Zalo', 'Thông báo', 'Hoàn tất']

export function SetupPageClient() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [step, setStep] = useState(1)
  const [setup, setSetup] = useState<SetupState>({ tenantId: '', slug: '', webhookUrl: '' })
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [mode, setMode] = useState<'choose' | 'new'>('choose')

  useEffect(() => {
    // Get stored tenantId
    const storedTenantId = getTenantId()
    if (storedTenantId) {
      // Have tenantId, go directly to wizard
      setSetup({ tenantId: storedTenantId, slug: '', webhookUrl: '' })
      setStep(1)
      setMode('new')
    } else {
      // No tenantId stored, redirect to /register
      router.replace('/register')
      return
    }

    fetch(`${API_URL}/api/tenants`).then(r => r.json()).then((ts: Tenant[]) => {
      setTenants(ts)
      if (ts.length === 0) setMode('new') // chưa có tenant → vào wizard luôn
    }).catch(() => setMode('new'))
  }, [])

  function quickLogin(t: Tenant) {
    setTenantId(t.id)
    router.push('/dashboard')
  }

  if (mode === 'choose' && tenants.length > 0) {
    return (
      <div className="min-h-screen bg-[#f2f2f7] dark:bg-zinc-950 flex items-center justify-center p-4" >
        <div className="w-full max-w-md">
          <div className="text-center mb-6">
            <div className="w-16 h-16 mx-auto mb-3 rounded-3xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-2xl font-bold shadow-lg shadow-blue-500/30">
              Z
            </div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-zinc-100">Zalo Monitor</h1>
            <p className="text-gray-500 dark:text-zinc-400 mt-1 text-sm">Chọn doanh nghiệp để tiếp tục</p>
          </div>

          <div className="bg-white dark:bg-zinc-900 dark:ring-1 dark:ring-white/5 rounded-2xl shadow-[0_1px_2px_rgba(0,0,0,0.04)] overflow-hidden mb-3">
            <div className="divide-y divide-gray-100 dark:divide-white/5">
              {tenants.map(t => (
                <button
                  key={t.id}
                  onClick={() => quickLogin(t)}
                  className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors text-left"
                >
                  <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white font-bold shrink-0">
                    {t.name[0]?.toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 dark:text-zinc-100 truncate">{t.name}</p>
                    <p className="text-xs text-gray-500 dark:text-zinc-400 truncate">
                      {t.industry ?? 'Chưa chọn ngành'} · {t._count.groups} nhóm
                    </p>
                  </div>
                  <svg className="w-5 h-5 text-gray-400 dark:text-zinc-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/>
                  </svg>
                </button>
              ))}
            </div>
          </div>

          <a
            href="/register"
            className="w-full block bg-white dark:bg-zinc-900 dark:ring-1 dark:ring-white/5 rounded-2xl shadow-[0_1px_2px_rgba(0,0,0,0.04)] py-3.5 text-sm font-medium text-blue-500 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors text-center"
          >
            + Đăng ký mới
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#f2f2f7] dark:bg-zinc-950 flex flex-col" >
      <div className="flex-1 flex items-center justify-center p-4">
       <div className="w-full max-w-xl">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-zinc-100">Zalo Monitor</h1>
          <p className="text-gray-500 dark:text-zinc-400 mt-1 text-sm">Thiết lập kết nối Zalo</p>
        </div>

        {/* Step indicators */}
        <div className="flex items-center justify-between mb-8 px-2">
          {STEPS.map((label, i) => {
            const n = i + 1
            const done = step > n
            const active = step === n
            return (
              <div key={n} className="flex items-center flex-1">
                <div className="flex flex-col items-center">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-colors
                    ${done ? 'bg-green-500 text-white' : active ? 'bg-blue-500 text-white' : 'bg-white dark:bg-zinc-800 text-gray-400 dark:text-zinc-500 shadow-sm dark:ring-1 dark:ring-white/5'}`}>
                    {done ? '✓' : n}
                  </div>
                  <span className={`text-[11px] mt-1.5 text-center w-20 ${active ? 'text-blue-600 dark:text-blue-400 font-semibold' : 'text-gray-400 dark:text-zinc-500'}`}>
                    {label}
                  </span>
                </div>
                {i < STEPS.length - 1 && (
                  <div className={`flex-1 h-0.5 mx-1 mb-5 ${step > n ? 'bg-green-400' : 'bg-gray-200 dark:bg-white/10'}`} />
                )}
              </div>
            )
          })}
        </div>

        {/* Step content */}
        <div className="bg-white dark:bg-zinc-900 dark:ring-1 dark:ring-white/5 rounded-3xl shadow-[0_1px_2px_rgba(0,0,0,0.04)] p-8">
          {step === 1 && <Step2Connect setup={setup} onDone={() => setStep(2)} />}
          {step === 2 && <Step3Notify setup={setup} onDone={() => setStep(3)} />}
          {step === 3 && <Step4Done setup={setup} />}
        </div>

        {tenants.length > 0 && (
          <button
            onClick={() => setMode('choose')}
            className="w-full mt-4 text-sm text-gray-500 dark:text-zinc-400 hover:text-gray-700 dark:text-zinc-300"
          >
            ← Quay lại danh sách doanh nghiệp
          </button>
        )}
       </div>
      </div>
      <Footer />
    </div>
  )
}
