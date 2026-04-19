'use client'

type Item = {
  id: string
  name: string
  value: number
  subtitle?: string
  color?: string
}

export function TopList({
  items, maxValue, suffix = '', showBar = true,
}: {
  items: Item[]
  maxValue?: number
  suffix?: string
  showBar?: boolean
}) {
  const max = maxValue ?? (items[0]?.value ?? 1)

  if (items.length === 0) {
    return <p className="text-center text-sm text-gray-400 dark:text-zinc-500 py-4">Chưa có dữ liệu</p>
  }

  return (
    <div className="space-y-2.5">
      {items.map((item, i) => {
        const pct = (item.value / max) * 100
        return (
          <div key={item.id} className="group">
            <div className="flex items-baseline gap-2 mb-1">
              <span className="text-[10px] font-semibold text-gray-400 dark:text-zinc-500 tabular-nums w-4">
                #{i + 1}
              </span>
              <p className="text-sm text-gray-900 dark:text-zinc-100 truncate flex-1 font-medium">{item.name}</p>
              <p className="text-sm font-bold tabular-nums text-gray-900 dark:text-zinc-100">
                {item.value}
                <span className="text-xs font-normal text-gray-500 dark:text-zinc-400 ml-0.5">{suffix}</span>
              </p>
            </div>
            {item.subtitle && (
              <p className="text-[11px] text-gray-500 dark:text-zinc-400 ml-6 mb-1">{item.subtitle}</p>
            )}
            {showBar && (
              <div className="ml-6 h-1.5 bg-gray-100 dark:bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${pct}%`,
                    background: item.color ?? 'linear-gradient(to right, #007AFF, #5AC8FA)',
                  }}
                />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
