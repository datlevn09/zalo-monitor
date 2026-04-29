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

type AlertRule = {
  id: string
  name: string
  enabled: boolean
  keywords: string[]
  labels: string[]
  minPriority: string
  cooldownMin: number
  autoCreateDeal: boolean
  autoAssignTo: string | null
}

const LABELS_OPTIONS = ['OPPORTUNITY', 'COMPLAINT', 'RISK', 'POSITIVE', 'NEUTRAL']
const PRIORITY_OPTIONS = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']

const emptyRule = (): Omit<AlertRule, 'id'> => ({
  name: '', enabled: true, keywords: [], labels: ['COMPLAINT', 'RISK'],
  minPriority: 'HIGH', cooldownMin: 10, autoCreateDeal: false, autoAssignTo: null,
})

const KW_SECTIONS = [
  { key: 'opportunityKeywords' as const, label: '💰 Cơ hội',     desc: 'Khách hỏi giá / quan tâm sản phẩm',       color: 'text-green-700 bg-green-50 dark:bg-green-500/10 border-green-200' },
  { key: 'positiveKeywords' as const,    label: '👍 Tích cực',    desc: 'Phản hồi tốt, hài lòng',                   color: 'text-blue-700 bg-blue-50 dark:bg-blue-500/10 border-blue-200' },
  { key: 'complaintKeywords' as const,   label: '🚨 Khiếu nại',   desc: 'Phàn nàn, không hài lòng',                color: 'text-orange-700 bg-orange-50 dark:bg-orange-500/10 border-orange-200' },
  { key: 'negativeKeywords' as const,    label: '👎 Tiêu cực',    desc: 'Sentiment xấu',                            color: 'text-red-700 bg-red-50 dark:bg-red-500/10 border-red-200' },
  { key: 'riskKeywords' as const,        label: '⚠️ Rủi ro cao',  desc: 'Kiện tụng, tố cáo, bóc phốt - CRITICAL',  color: 'text-red-800 bg-red-100 border-red-300' },
]

export default function RulesPage() {
  const [tab, setTab] = useState<'ai' | 'automation'>('ai')
  const [config, setConfig] = useState<Config | null>(null)
  const [presets, setPresets] = useState<Preset[]>([])
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // Alert rules state
  const [rules, setRules] = useState<AlertRule[]>([])
  const [ruleForm, setRuleForm] = useState<Omit<AlertRule, 'id'>>(emptyRule())
  const [editRuleId, setEditRuleId] = useState<string | null>(null)
  const [showRuleForm, setShowRuleForm] = useState(false)
  const [savingRule, setSavingRule] = useState(false)
  const [ruleKwInput, setRuleKwInput] = useState('')

  useEffect(() => {
    api<Config>('/api/config').then(setConfig)
    api<Preset[]>('/api/config/presets').then(setPresets)
    api<AlertRule[]>('/api/alert-rules').then(setRules)
  }, [])

  function loadRules() { api<AlertRule[]>('/api/alert-rules').then(setRules) }

  async function saveRule() {
    setSavingRule(true)
    try {
      if (editRuleId) {
        await api(`/api/alert-rules/${editRuleId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(ruleForm) })
      } else {
        await api('/api/alert-rules', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(ruleForm) })
      }
      setShowRuleForm(false)
      loadRules()
    } finally { setSavingRule(false) }
  }

  async function toggleRule(r: AlertRule) {
    await api(`/api/alert-rules/${r.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: !r.enabled }) })
    loadRules()
  }

  async function deleteRule(id: string) {
    if (!confirm('Xoá rule này?')) return
    await api(`/api/alert-rules/${id}`, { method: 'DELETE' })
    loadRules()
  }

  function openNewRule() {
    setEditRuleId(null)
    setRuleForm(emptyRule())
    setRuleKwInput('')
    setShowRuleForm(true)
  }

  function openEditRule(r: AlertRule) {
    setEditRuleId(r.id)
    setRuleForm({ name: r.name, enabled: r.enabled, keywords: r.keywords, labels: r.labels, minPriority: r.minPriority, cooldownMin: r.cooldownMin, autoCreateDeal: r.autoCreateDeal, autoAssignTo: r.autoAssignTo })
    setRuleKwInput('')
    setShowRuleForm(true)
  }

  function addRuleKw() {
    const kw = ruleKwInput.trim()
    if (!kw || ruleForm.keywords.includes(kw)) { setRuleKwInput(''); return }
    setRuleForm(f => ({ ...f, keywords: [...f.keywords, kw] }))
    setRuleKwInput('')
  }

  function toggleLabel(label: string) {
    setRuleForm(f => ({
      ...f,
      labels: f.labels.includes(label) ? f.labels.filter(l => l !== label) : [...f.labels, label],
    }))
  }

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
      <div className="mb-4">
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-zinc-100 tracking-tight">⚙️ Cấu hình & Automation</h1>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 bg-gray-100 dark:bg-zinc-800 rounded-xl p-1 w-fit">
        {(['ai', 'automation'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === t ? 'bg-white dark:bg-zinc-900 text-gray-900 dark:text-zinc-100 shadow-sm' : 'text-gray-500 dark:text-zinc-400'
            }`}>
            {t === 'ai' ? '🤖 Cấu hình AI' : '⚡ Automation Rules'}
          </button>
        ))}
      </div>

      {/* AUTOMATION TAB */}
      {tab === 'automation' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500 dark:text-zinc-400">{rules.length} rule — kích hoạt tự động khi AI phân loại xong</p>
            <button onClick={openNewRule} className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded-xl transition-colors">+ Thêm rule</button>
          </div>

          {rules.length === 0 && (
            <div className="text-center py-12 bg-white dark:bg-zinc-900 rounded-2xl border border-gray-100 dark:border-white/10">
              <div className="text-4xl mb-2">⚡</div>
              <p className="text-gray-500 dark:text-zinc-400 text-sm">Chưa có automation rule nào</p>
              <p className="text-xs text-gray-400 dark:text-zinc-500 mt-1">Tạo rule để tự động tạo deal, gán nhân viên khi nhận được tin nhắn phù hợp</p>
            </div>
          )}

          {rules.map(r => (
            <div key={r.id} className={`bg-white dark:bg-zinc-900 rounded-2xl border p-4 ${r.enabled ? 'border-gray-100 dark:border-white/10' : 'border-gray-100 dark:border-white/5 opacity-60'}`}>
              <div className="flex items-start gap-3">
                <button onClick={() => toggleRule(r)}
                  className={`mt-0.5 w-9 h-5 rounded-full transition-colors shrink-0 ${r.enabled ? 'bg-green-500' : 'bg-gray-300 dark:bg-zinc-600'}`}>
                  <span className={`block w-4 h-4 bg-white rounded-full shadow mx-0.5 transition-transform ${r.enabled ? 'translate-x-4' : ''}`} />
                </button>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 dark:text-zinc-100 text-sm">{r.name}</p>
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {r.labels.map(l => (
                      <span key={l} className="text-[10px] bg-purple-100 dark:bg-purple-500/20 text-purple-700 dark:text-purple-300 px-2 py-0.5 rounded-full font-medium">{l}</span>
                    ))}
                    {r.keywords.slice(0, 3).map(k => (
                      <span key={k} className="text-[10px] bg-gray-100 dark:bg-white/10 text-gray-600 dark:text-zinc-400 px-2 py-0.5 rounded-full">"{k}"</span>
                    ))}
                    {r.keywords.length > 3 && <span className="text-[10px] text-gray-400">+{r.keywords.length - 3}</span>}
                  </div>
                  <div className="flex gap-3 mt-2 text-[11px] text-gray-500 dark:text-zinc-400">
                    {r.autoCreateDeal && <span className="text-teal-600 dark:text-teal-400 font-medium">✓ Tạo Deal</span>}
                    {r.autoAssignTo   && <span className="text-blue-600 dark:text-blue-400 font-medium">✓ Gán nhân viên</span>}
                    <span>⏱ {r.cooldownMin}p cooldown</span>
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button onClick={() => openEditRule(r)} className="w-7 h-7 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 flex items-center justify-center text-gray-400 transition-colors text-xs">✏️</button>
                  <button onClick={() => deleteRule(r.id)} className="w-7 h-7 rounded-lg hover:bg-red-50 dark:hover:bg-red-500/10 flex items-center justify-center text-gray-400 hover:text-red-500 transition-colors text-xs">🗑</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* AI CONFIG TAB */}
      {tab === 'ai' && <>

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
            {/* Slider phi tuyến: 4 anchor (0%/33%/66%/100% → 5p/60p/240p/480p).
                Linear interpolate giữa các anchor để label trùng vị trí slider. */}
            {(() => {
              const anchors = [
                { p: 0,   m: 5 },
                { p: 33,  m: 60 },
                { p: 66,  m: 240 },
                { p: 100, m: 480 },
              ]
              const minutesToPos = (m: number) => {
                for (let i = 0; i < anchors.length - 1; i++) {
                  const a = anchors[i], b = anchors[i + 1]
                  if (m <= b.m) return a.p + ((m - a.m) / (b.m - a.m)) * (b.p - a.p)
                }
                return 100
              }
              const posToMinutes = (p: number) => {
                for (let i = 0; i < anchors.length - 1; i++) {
                  const a = anchors[i], b = anchors[i + 1]
                  if (p <= b.p) return a.m + ((p - a.p) / (b.p - a.p)) * (b.m - a.m)
                }
                return 480
              }
              return (
                <input type="range" min="0" max="100" step="1"
                  value={Math.round(minutesToPos(config.replyTimeoutMinutes))}
                  onChange={e => {
                    const minutes = Math.max(5, Math.round(posToMinutes(Number(e.target.value)) / 5) * 5)
                    setConfig({ ...config, replyTimeoutMinutes: minutes })
                  }}
                  className="w-full accent-blue-500"
                />
              )
            })()}
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
              <span className="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-md transition-transform"
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
      </>}

      {/* Save button — only in AI tab */}
      {tab === 'ai' && (
        <div className="fixed bottom-4 left-4 right-4 md:bottom-6 md:left-auto md:right-6 md:w-auto z-40">
          <button onClick={save} disabled={saving}
            className="w-full md:w-auto px-6 py-3 bg-blue-500 hover:bg-blue-600 text-white font-medium rounded-full shadow-lg shadow-blue-500/30 disabled:bg-gray-400">
            {saving ? 'Đang lưu...' : saved ? '✓ Đã lưu' : '💾 Lưu cấu hình'}
          </button>
        </div>
      )}

      {/* Rule form modal */}
      {showRuleForm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-end md:items-center justify-center p-4">
          <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col">
            <div className="px-5 pt-5 pb-3 border-b border-gray-100 dark:border-white/10 flex items-center justify-between">
              <h3 className="font-semibold text-gray-900 dark:text-zinc-100">{editRuleId ? 'Sửa rule' : 'Thêm Automation Rule'}</h3>
              <button onClick={() => setShowRuleForm(false)} className="text-gray-400 text-xl">×</button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              <div>
                <label className="text-xs font-medium text-gray-500 dark:text-zinc-400 mb-1 block">Tên rule *</label>
                <input value={ruleForm.name} onChange={e => setRuleForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="VD: Khiếu nại khẩn cấp"
                  className="w-full border border-gray-200 dark:border-white/10 rounded-xl px-3 py-2 text-sm bg-white dark:bg-zinc-800 text-gray-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>

              <div>
                <label className="text-xs font-medium text-gray-500 dark:text-zinc-400 mb-1.5 block">Kích hoạt khi label là</label>
                <div className="flex flex-wrap gap-1.5">
                  {LABELS_OPTIONS.map(l => (
                    <button key={l} onClick={() => toggleLabel(l)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                        ruleForm.labels.includes(l)
                          ? 'bg-purple-500 text-white border-purple-500'
                          : 'border-gray-200 dark:border-white/10 text-gray-600 dark:text-zinc-300 hover:border-purple-300'
                      }`}>{l}</button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-gray-500 dark:text-zinc-400 mb-1 block">Keywords kích hoạt (tuỳ chọn)</label>
                <div className="flex flex-wrap gap-1 mb-2">
                  {ruleForm.keywords.map(k => (
                    <span key={k} className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 dark:bg-white/10 rounded-full text-xs text-gray-700 dark:text-zinc-300">
                      {k} <button onClick={() => setRuleForm(f => ({ ...f, keywords: f.keywords.filter(x => x !== k) }))} className="opacity-60">×</button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input value={ruleKwInput} onChange={e => setRuleKwInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addRuleKw() } }}
                    placeholder="Thêm keyword (Enter)..."
                    className="flex-1 border border-gray-200 dark:border-white/10 rounded-lg px-3 py-1.5 text-xs bg-white dark:bg-zinc-800 text-gray-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  <button onClick={addRuleKw} className="px-3 py-1.5 bg-gray-800 text-white text-xs rounded-lg">Thêm</button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-500 dark:text-zinc-400 mb-1 block">Priority tối thiểu</label>
                  <select value={ruleForm.minPriority} onChange={e => setRuleForm(f => ({ ...f, minPriority: e.target.value }))}
                    className="w-full border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm bg-white dark:bg-zinc-800 text-gray-900 dark:text-zinc-100 focus:outline-none">
                    {PRIORITY_OPTIONS.map(p => <option key={p}>{p}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 dark:text-zinc-400 mb-1 block">Cooldown (phút)</label>
                  <input type="number" min={1} value={ruleForm.cooldownMin} onChange={e => setRuleForm(f => ({ ...f, cooldownMin: Number(e.target.value) }))}
                    className="w-full border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm bg-white dark:bg-zinc-800 text-gray-900 dark:text-zinc-100 focus:outline-none" />
                </div>
              </div>

              <div className="border-t border-gray-100 dark:border-white/10 pt-3 space-y-3">
                <p className="text-xs font-semibold text-gray-500 dark:text-zinc-400 uppercase tracking-wide">⚡ Actions tự động</p>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" checked={ruleForm.autoCreateDeal} onChange={e => setRuleForm(f => ({ ...f, autoCreateDeal: e.target.checked }))}
                    className="w-4 h-4 rounded accent-teal-500" />
                  <div>
                    <p className="text-sm font-medium text-gray-800 dark:text-zinc-200">Tự tạo Deal trong Pipeline</p>
                    <p className="text-xs text-gray-400">Tự động thêm deal với tiêu đề từ nội dung tin nhắn</p>
                  </div>
                </label>
                <div>
                  <label className="text-xs font-medium text-gray-500 dark:text-zinc-400 mb-1 block">Tự gán alert cho userId (tuỳ chọn)</label>
                  <input value={ruleForm.autoAssignTo ?? ''} onChange={e => setRuleForm(f => ({ ...f, autoAssignTo: e.target.value || null }))}
                    placeholder="userId của nhân viên..."
                    className="w-full border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm bg-white dark:bg-zinc-800 text-gray-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
            </div>
            <div className="px-5 pb-5 pt-3 border-t border-gray-100 dark:border-white/10 flex gap-3">
              <button onClick={() => setShowRuleForm(false)} className="flex-1 py-2.5 rounded-xl border border-gray-200 dark:border-white/10 text-sm font-medium text-gray-700 dark:text-zinc-300">Huỷ</button>
              <button onClick={saveRule} disabled={savingRule || !ruleForm.name}
                className="flex-1 py-2.5 rounded-xl bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white text-sm font-medium transition-colors">
                {savingRule ? 'Đang lưu...' : editRuleId ? 'Cập nhật' : 'Tạo rule'}
              </button>
            </div>
          </div>
        </div>
      )}
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
