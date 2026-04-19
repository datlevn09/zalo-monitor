'use client'

const DAYS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']

export function Heatmap({ grid, maxValue }: { grid: number[][]; maxValue: number }) {
  const ratio = (v: number) => (maxValue > 0 ? v / maxValue : 0)

  return (
    <div className="space-y-2">
      {/* Hour labels */}
      <div className="flex gap-1 pl-6">
        {Array.from({ length: 24 }, (_, h) => (
          <div key={h} className="flex-1 text-[9px] text-gray-400 dark:text-zinc-500 text-center">
            {h % 3 === 0 ? `${h}h` : ''}
          </div>
        ))}
      </div>

      {/* Rows */}
      {DAYS.map((day, d) => (
        <div key={day} className="flex items-center gap-1">
          <div className="w-5 text-[11px] text-gray-500 dark:text-zinc-400 font-medium">{day}</div>
          <div className="flex gap-1 flex-1">
            {grid[d].map((v, h) => {
              const r = ratio(v)
              if (r === 0) {
                return (
                  <div
                    key={h}
                    className="flex-1 aspect-square rounded bg-zinc-100 dark:bg-zinc-800 transition-all hover:scale-110 cursor-pointer"
                    title={`${day} ${h}h: 0 tin`}
                  />
                )
              }
              return (
                <div
                  key={h}
                  className="flex-1 aspect-square rounded bg-blue-500 transition-all hover:scale-110 cursor-pointer"
                  style={{ opacity: Math.max(0.2, r) }}
                  title={`${day} ${h}h: ${v} tin`}
                />
              )
            })}
          </div>
        </div>
      ))}

      {/* Legend */}
      <div className="flex items-center justify-end gap-1 pt-2 text-[10px] text-gray-400 dark:text-zinc-500">
        <span>Ít</span>
        {[0.15, 0.3, 0.5, 0.75, 1].map((o, i) => (
          <div key={i} className="w-3 h-3 rounded bg-blue-500" style={{ opacity: o }} />
        ))}
        <span>Nhiều</span>
      </div>
    </div>
  )
}
