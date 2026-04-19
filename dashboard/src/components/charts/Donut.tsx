'use client'

import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts'

type Slice = { name: string; value: number; color: string }

export function DonutChart({
  data, centerLabel, centerValue, size = 180,
}: {
  data: Slice[]
  centerLabel?: string
  centerValue?: string | number
  size?: number
}) {
  const total = data.reduce((s, d) => s + d.value, 0)

  return (
    <div className="relative" style={{ width: size, height: size, margin: '0 auto' }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            innerRadius={size / 2 - 24}
            outerRadius={size / 2}
            paddingAngle={2}
            strokeWidth={0}
          >
            {data.map((d, i) => (
              <Cell key={i} fill={d.color} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      {/* Center label */}
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <p className="text-3xl font-bold text-gray-900 dark:text-zinc-100 tabular-nums">{centerValue ?? total}</p>
        {centerLabel && <p className="text-xs text-gray-500 dark:text-zinc-400 mt-0.5">{centerLabel}</p>}
      </div>
    </div>
  )
}

export function DonutLegend({ data, total }: { data: Slice[]; total?: number }) {
  const sum = total ?? data.reduce((s, d) => s + d.value, 0)
  return (
    <div className="space-y-2">
      {data.map((d, i) => {
        const pct = sum > 0 ? Math.round((d.value / sum) * 100) : 0
        return (
          <div key={i} className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-sm" style={{ background: d.color }} />
            <p className="text-xs text-gray-700 dark:text-zinc-300 flex-1">{d.name}</p>
            <p className="text-xs font-semibold tabular-nums text-gray-900 dark:text-zinc-100">{d.value}</p>
            <p className="text-xs text-gray-400 dark:text-zinc-500 tabular-nums w-8 text-right">{pct}%</p>
          </div>
        )
      })}
    </div>
  )
}
