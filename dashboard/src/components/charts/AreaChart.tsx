'use client'

import { AreaChart as RechartsArea, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'

type Point = { x: string; y: number; [k: string]: any }

export function GradientAreaChart({
  data, color = '#007AFF', height = 200, dataKey = 'y', label,
}: {
  data: Point[]
  color?: string
  height?: number
  dataKey?: string
  label?: string
}) {
  const gradientId = `gradient-${color.replace('#', '')}`

  return (
    <ResponsiveContainer width="100%" height={height}>
      <RechartsArea data={data} margin={{ top: 10, right: 0, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={color} stopOpacity={0.35} />
            <stop offset="95%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
        <XAxis dataKey="x" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} width={30} />
        <Tooltip
          contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.08)', fontSize: 12 }}
          labelStyle={{ color: '#6b7280' }}
          formatter={(v: any) => [v, label ?? dataKey]}
        />
        <Area type="monotone" dataKey={dataKey} stroke={color} strokeWidth={2.5} fill={`url(#${gradientId})`} />
      </RechartsArea>
    </ResponsiveContainer>
  )
}

export function MultiLineChart({
  data, series, height = 220,
}: {
  data: Array<{ x: string;[k: string]: any }>
  series: Array<{ key: string; color: string; label: string }>
  height?: number
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <RechartsArea data={data} margin={{ top: 10, right: 0, left: 0, bottom: 0 }}>
        <defs>
          {series.map(s => (
            <linearGradient key={s.key} id={`grad-${s.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={s.color} stopOpacity={0.25} />
              <stop offset="95%" stopColor={s.color} stopOpacity={0} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
        <XAxis dataKey="x" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} width={30} />
        <Tooltip contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.08)', fontSize: 12 }} />
        {series.map(s => (
          <Area key={s.key} type="monotone" dataKey={s.key} stroke={s.color} strokeWidth={2} fill={`url(#grad-${s.key})`} name={s.label} />
        ))}
      </RechartsArea>
    </ResponsiveContainer>
  )
}
