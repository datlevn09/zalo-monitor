'use client'

import { useEffect, useState } from 'react'

type Theme = 'light' | 'dark' | 'system'

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>('system')

  useEffect(() => {
    const saved = (localStorage.getItem('theme') as Theme) ?? 'system'
    setThemeState(saved)
    applyTheme(saved)
  }, [])

  const setTheme = (t: Theme) => {
    localStorage.setItem('theme', t)
    setThemeState(t)
    applyTheme(t)
  }

  return { theme, setTheme }
}

function applyTheme(theme: Theme) {
  const isDark = theme === 'dark' ||
    (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.classList.toggle('dark', isDark)
}

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const next = theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light'
  const icon = theme === 'light' ? '☀️' : theme === 'dark' ? '🌙' : '🖥️'
  const label = theme === 'light' ? 'Sáng' : theme === 'dark' ? 'Tối' : 'Hệ thống'

  return (
    <button
      onClick={() => setTheme(next)}
      title={`Giao diện: ${label} (click đổi)`}
      className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-gray-700 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
    >
      <span className="text-base">{icon}</span>
      <span>{label}</span>
    </button>
  )
}

// Compact pill — cho footer
export function ThemeToggleCompact() {
  const { theme, setTheme } = useTheme()
  const next = theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light'
  const icon = theme === 'light' ? '☀️' : theme === 'dark' ? '🌙' : '🖥️'
  const label = theme === 'light' ? 'Sáng' : theme === 'dark' ? 'Tối' : 'Auto'

  return (
    <button
      onClick={() => setTheme(next)}
      title={`Giao diện: ${label} — click đổi`}
      className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-white dark:bg-white/10 text-gray-700 dark:text-zinc-300 text-xs font-medium rounded-full hover:bg-gray-50 dark:hover:bg-white/15 transition-colors"
    >
      <span className="text-xs leading-none">{icon}</span>
      <span>{label}</span>
    </button>
  )
}
