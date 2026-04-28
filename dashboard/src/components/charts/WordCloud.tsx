'use client'

type Word = { word: string; count: number }

export function WordCloud({ words }: { words: Word[] }) {
  if (!words.length) {
    return (
      <div className="py-12 text-center text-sm text-gray-400 dark:text-zinc-500">
        Chưa đủ dữ liệu — cần thêm tin nhắn để tạo word cloud.
      </div>
    )
  }

  const max = words[0]?.count ?? 1
  const min = words[words.length - 1]?.count ?? 1

  // Map count → font size 12px..40px
  function fontSize(count: number): number {
    if (max === min) return 18
    const ratio = (count - min) / (max - min)
    return Math.round(12 + ratio * 28)
  }

  // Color palette — đa dạng nhưng vẫn hài hoà
  const colors = [
    'text-blue-500 dark:text-blue-400',
    'text-purple-500 dark:text-purple-400',
    'text-green-600 dark:text-green-400',
    'text-orange-500 dark:text-orange-400',
    'text-pink-500 dark:text-pink-400',
    'text-cyan-500 dark:text-cyan-400',
    'text-indigo-500 dark:text-indigo-400',
    'text-rose-500 dark:text-rose-400',
    'text-emerald-500 dark:text-emerald-400',
    'text-amber-500 dark:text-amber-400',
  ]

  return (
    <div className="flex flex-wrap gap-x-4 gap-y-2 items-center justify-center py-4 px-2 leading-tight">
      {words.map((w, i) => (
        <span
          key={w.word}
          title={`${w.word} — ${w.count} lần`}
          className={`font-semibold ${colors[i % colors.length]} hover:opacity-100 transition-opacity inline-block`}
          style={{ fontSize: `${fontSize(w.count)}px`, opacity: 0.7 + (w.count / max) * 0.3 }}
        >
          {w.word}
        </span>
      ))}
    </div>
  )
}
