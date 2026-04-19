'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'

type Config = {
  positiveKeywords: string[]
  negativeKeywords: string[]
  opportunityKeywords: string[]
  complaintKeywords: string[]
  riskKeywords: string[]
  replyTimeoutMinutes: number
  requireQuoteReply: boolean
  customPrompt: string | null
  industry: string | null
}

type Preset = { industry: string; label: string; sample: Config }

const KW_SECTIONS = [
  { key: 'opportunityKeywords' as const, label: '💰 Cơ hội',     desc: 'Khách hỏi giá / quan tâm sản phẩm',       color: 'text-green-700 bg-green-50 dark:bg-green-500/10 border-green-200' },
  { key: 'positiveKeywords' as const,    label: '👍 Tích cực',    desc: 'Phản hồi tốt, hài lòng',                   color: 'text-blue-700 bg-blue-50 dark:bg-blue-500/10 border-blue-200' },
  { key: 'complaintKeywords' as const,   label: '🚨 Khiếu nại',   desc: 'Phàn nàn, không hài lòng',                color: 'text-orange-700 bg-orange-50 dark:bg-orange-500/10 border-orange-200' },
  { key: 'negativeKeywords' as const,    label: '👎 Tiêu cực',    desc: 'Sentiment xấu',                            color: 'text-red-700 bg-red-50 dark:bg-red-500/10 border-red-200' },
  { key: 'riskKeywords' as const,        label: '⚠️ Rủi ro cao',  desc: 'Kiện tụng, tố cáo, bóc phốt - CRITICAL',  color: 'text-red-800 bg-red-100 border-red-300' },
]

export default function RulesPage() {
  const [config, setConfig] = useState<Config | null>(null)
  const [presets, setPresets] = useState<Preset[]>([])
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    api<Config>('/api/config').then(setConfig)
    api<Preset[]>('/api/config/presets').then(setPresets)
  }, [])

  async function save() {
    if (!config) return
    setSaving(true)
    const updated = await api<Config>('/api/config', {
      method: 'PATCH', body: JSON.stringify(config),
    })
    setConfig(updated)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  async function applyPreset(industry: string) {
    if (!confirm('Áp dụng preset sẽ ghi đè keywords hiện tại. Tiếp tục?')) return
    const updated = await api<Config>(`/api/config/preset/${industry}`, { method: 'POST' })
    setConfig(updated)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  if (!config) return <div className="p-8 text-gray-400 dark:text-zinc-500">Đang tải...</div>

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto pb-32">
      <div className="mb-6">
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-zinc-100 tracking-tight">⚙️ Cấu hình phân tích</h1>
        <p className="text-gray-500 dark:text-zinc-400 mt-1 text-sm">Tinh chỉnh AI theo ngành nghề của bạn</p>
      </div>

      {/* Industry presets */}
      <Section title="📦 Preset theo ngành" description="Áp dụng bộ keywords mẫu nhanh">
        <div className="grid grid-cols-2 gap-2 p-3">
          {presets.map(p => (
            <button key={p.industry} onClick={() => applyPreset(p.industry)}
              className={`px-4 py-3 rounded-xl text-sm font-medium border-2 transition-all ${
                config.industry === p.industry
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300'
                  : 'border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-gray-700 dark:text-zinc-300 hover:border-gray-300 dark:hover:border-white/20'
              }`}>
              {p.label}
            </button>
          ))}
        </div>
      </Section>

      {/* Response time */}
      <Section title="⏱️ Thời gian phản hồi" description="Định nghĩa thế nào là reply chậm">
        <div className="p-4 space-y-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm text-gray-700 dark:text-zinc-300">Ngưỡng chậm phản hồi</label>
              <span className="text-sm font-semibold tabular-nums">{config.replyTimeoutMinutes} phút</span>
            </div>
            <input type="range" min="5" max="480" step="5"
              value={config.replyTimeoutMinutes}
              onChange={e => setConfig({ ...config, replyTimeoutMinutes: Number(e.target.value) })}
              className="w-full accent-blue-500"
            />
            <div className="flex justify-between text-[11px] text-gray-400 dark:text-zinc-500 mt-1">
              <span>5 phút</span>
              <span>1 giờ</span>
              <span>4 giờ</span>
              <span>8 giờ</span>
            </div>
          </div>

          <div className="flex items-center justify-between pt-3 border-t border-gray-100 dark:border-white/5">
            <div>
              <p className="text-sm text-gray-700 dark:text-zinc-300">Bắt buộc quote reply tin nhắn gốc</p>
              <p className="text-xs text-gray-500 dark:text-zinc-400 mt-0.5">
                Chỉ tính là phản hồi nếu bot/staff reply bằng quote message cụ thể
              </p>
            </div>
            <button onClick={() => setConfig({ ...config, requireQuoteReply: !config.requireQuoteReply })}
              className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${config.requireQuoteReply ? 'bg-green-500' : 'bg-gray-300'}`}>
              <span className="absolute top-0.5 left-0.5 w-5 h-5 bg-white dark:bg-white/10 rounded-full shadow-md transition-transform"
                style={{ transform: config.requireQuoteReply ? 'translateX(20px)' : 'translateX(0)' }} />
            </button>
          </div>
        </div>
      </Section>

      {/* Keywords per category */}
      {KW_SECTIONS.map(section => (
        <Section key={section.key} title={section.label} description={section.desc}>
          <KeywordEditor
            value={config[section.key]}
            onChange={next => setConfig({ ...config, [section.key]: next })}
            tint={section.color}
          />
        </Section>
      ))}

      {/* Custom AI prompt */}
      <Section title="🤖 Custom AI prompt" description="Thêm chỉ dẫn riêng cho AI khi classify (tuỳ chọn)">
        <div className="p-4">
          <textarea
            value={config.customPrompt ?? ''}
            onChange={e => setConfig({ ...config, customPrompt: e.target.value })}
            placeholder="VD: Khách hàng là nhà đầu tư BĐS, thường hỏi về view, hướng, pháp lý..."
            rows={4}
            className="w-full px-3 py-2.5 bg-gray-50 dark:bg-white/5 rounded-xl text-sm border-0 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          />
        </div>
      </Section>

      {/* Save button */}
      <div className="fixed bottom-4 left-4 right-4 md:bottom-6 md:left-auto md:right-6 md:w-auto z-40">
        <button onClick={save} disabled={saving}
          className="w-full md:w-auto px-6 py-3 bg-blue-500 hover:bg-blue-600 text-white font-medium rounded-full shadow-lg shadow-blue-500/30 disabled:bg-gray-400">
          {saving ? 'Đang lưu...' : saved ? '✓ Đã lưu' : '💾 Lưu cấu hình'}
        </button>
      </div>
    </div>
  )
}

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <div className="px-1 mb-2">
        <h2 className="text-sm font-bold text-gray-900 dark:text-zinc-100">{title}</h2>
        {description && <p className="text-xs text-gray-500 dark:text-zinc-400 mt-0.5">{description}</p>}
      </div>
      <div className="bg-white dark:bg-zinc-900 dark:ring-1 dark:ring-white/5 rounded-2xl shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
        {children}
      </div>
    </div>
  )
}

function KeywordEditor({ value, onChange, tint }: { value: string[]; onChange: (v: string[]) => void; tint: string }) {
  const [input, setInput] = useState('')

  function add() {
    const kw = input.trim()
    if (!kw || value.includes(kw)) { setInput(''); return }
    onChange([...value, kw])
    setInput('')
  }
  function remove(kw: string) {
    onChange(value.filter(k => k !== kw))
  }

  return (
    <div className="p-3">
      <div className="flex flex-wrap gap-1.5 mb-2">
        {value.length === 0 && <span className="text-xs text-gray-400 dark:text-zinc-500 italic">Chưa có keyword</span>}
        {value.map(kw => (
          <span key={kw} className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border ${tint}`}>
            {kw}
            <button onClick={() => remove(kw)} className="opacity-60 hover:opacity-100">×</button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add() } }}
          placeholder="Thêm keyword (Enter để lưu)..."
          className="flex-1 px-3 py-1.5 bg-gray-50 dark:bg-white/5 rounded-lg text-xs border-0 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button onClick={add}
          className="px-3 py-1.5 bg-gray-900 hover:bg-gray-800 text-white text-xs rounded-lg font-medium">
          Thêm
        </button>
      </div>
    </div>
  )
}
