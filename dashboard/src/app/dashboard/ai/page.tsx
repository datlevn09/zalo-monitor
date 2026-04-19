'use client'

import { useEffect, useRef, useState } from 'react'
import { api } from '@/lib/api'

type Message = { role: 'user' | 'assistant'; content: string }

const EXAMPLES = [
  'Hôm nay có gì quan trọng?',
  'Nhóm nào đang có khiếu nại?',
  'Cơ hội bán hàng đang ở đâu?',
  'Khách VIP nào đang active?',
  'Nhóm nào đang im lâu nhất?',
]

export default function AIChatPage() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  async function send(text?: string) {
    const question = (text ?? input).trim()
    if (!question || loading) return
    setInput('')
    setLoading(true)

    const newHistory = [...messages, { role: 'user' as const, content: question }]
    setMessages(newHistory)

    try {
      const { answer } = await api<{ answer: string }>('/api/ai-chat', {
        method: 'POST',
        body: JSON.stringify({ question, history: messages.slice(-6) }),
      })
      setMessages([...newHistory, { role: 'assistant', content: answer }])
    } catch (err: any) {
      setMessages([...newHistory, { role: 'assistant', content: `⚠️ Lỗi: ${err.message}` }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col h-full max-w-3xl mx-auto">
      {/* Page header — không cuộn */}
      <div className="shrink-0 p-4 md:p-6 border-b border-gray-200/60 dark:border-white/5">
        <h1 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-zinc-100 tracking-tight">🤖 AI Assistant</h1>
        <p className="text-sm text-gray-500 dark:text-zinc-400 mt-0.5">Hỏi bất cứ điều gì về dữ liệu của bạn</p>
      </div>

      {/* Messages — chỉ vùng này cuộn */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-auto p-4 md:p-6 space-y-4">
        {messages.length === 0 && (
          <div className="text-center py-10">
            <div className="inline-block w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-3xl mb-3 shadow-lg shadow-indigo-500/30">
              ✨
            </div>
            <p className="text-gray-600 dark:text-zinc-400 font-medium">Hỏi AI về dữ liệu của bạn</p>
            <p className="text-sm text-gray-400 dark:text-zinc-500 mt-1">AI sẽ query DB và trả lời dựa trên dữ liệu thật</p>

            <div className="mt-6 flex flex-wrap gap-2 justify-center">
              {EXAMPLES.map(ex => (
                <button key={ex} onClick={() => send(ex)}
                  className="px-3 py-1.5 bg-white dark:bg-white/10 border border-gray-200 dark:border-white/10 rounded-full text-xs text-gray-700 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-white/15 transition-colors">
                  {ex}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={`flex gap-2 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm shrink-0 ${
              m.role === 'user'
                ? 'bg-gray-200 dark:bg-white/10 text-gray-700 dark:text-zinc-300'
                : 'bg-gradient-to-br from-indigo-500 to-purple-600 text-white'
            }`}>
              {m.role === 'user' ? '🙋' : '🤖'}
            </div>
            <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 ${
              m.role === 'user'
                ? 'bg-blue-500 text-white'
                : 'bg-white dark:bg-zinc-900 border border-gray-100 dark:border-white/5 shadow-sm text-gray-900 dark:text-zinc-100'
            }`}>
              <div
                className="text-sm whitespace-pre-wrap break-words"
                dangerouslySetInnerHTML={{ __html: sanitizeHtml(m.content) }}
              />
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex gap-2">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-sm shrink-0">🤖</div>
            <div className="bg-white dark:bg-zinc-900 border border-gray-100 dark:border-white/5 rounded-2xl px-4 py-3 shadow-sm">
              <div className="flex gap-1">
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Input — không cuộn */}
      <form onSubmit={e => { e.preventDefault(); send() }} className="shrink-0 p-3 md:p-4 border-t border-gray-200/60 dark:border-white/5">
        <div className="flex gap-2">
          <input
            value={input} onChange={e => setInput(e.target.value)}
            placeholder="Hỏi gì đó..."
            disabled={loading}
            className="flex-1 px-4 py-2.5 bg-white dark:bg-zinc-900 dark:ring-1 dark:ring-white/5 rounded-2xl text-sm border-0 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
          />
          <button type="submit" disabled={!input.trim() || loading}
            className="w-11 h-11 rounded-full bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 text-white flex items-center justify-center transition-colors">
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M2 12l20-8-8 20-2-9-10-3z"/></svg>
          </button>
        </div>
      </form>
    </div>
  )
}

// Whitelist HTML tags we want to preserve from AI response
function sanitizeHtml(s: string): string {
  // Allow <b>, <i>, <code>, <br>, <ul>, <li>, <strong>, <em>
  return s
    .replace(/<(?!\/?(b|i|em|strong|code|br|ul|li|p)\s*\/?>)/gi, '&lt;')
    .replace(/\n/g, '<br/>')
}
