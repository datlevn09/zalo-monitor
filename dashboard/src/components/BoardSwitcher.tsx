'use client'

import { useState } from 'react'
import { useBoardScope } from '@/lib/board-context'

export function BoardSwitcher() {
  const { boards, activeBoard, setActiveBoard } = useBoardScope()
  const [open, setOpen] = useState(false)

  // Only show if there are multiple boards accessible
  if (boards.length <= 1) return null

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 dark:bg-white/10 hover:bg-gray-200 dark:hover:bg-white/15 rounded-full text-xs font-medium text-gray-700 dark:text-zinc-300 transition-colors"
      >
        <span className="w-4 h-4 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white text-[9px] font-bold shrink-0">
          {activeBoard?.userName?.[0]?.toUpperCase() ?? '?'}
        </span>
        <span className="max-w-[100px] truncate">
          {activeBoard?.isOwn ? 'Board của tôi' : activeBoard?.userName}
        </span>
        <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-50 bg-white dark:bg-zinc-900 dark:ring-1 dark:ring-white/10 rounded-2xl shadow-lg overflow-hidden min-w-[160px]">
            {boards.map((b) => (
              <button
                key={b.userId}
                onClick={() => {
                  setActiveBoard(b)
                  setOpen(false)
                }}
                className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-left transition-colors ${
                  activeBoard?.userId === b.userId
                    ? 'bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300'
                    : 'hover:bg-gray-50 dark:hover:bg-white/5 text-gray-700 dark:text-zinc-300'
                }`}
              >
                <span className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white text-[10px] font-bold shrink-0">
                  {b.userName?.[0]?.toUpperCase() ?? '?'}
                </span>
                <span className="truncate">{b.isOwn ? 'Board của tôi' : b.userName}</span>
                {activeBoard?.userId === b.userId && <span className="text-blue-500 ml-auto">✓</span>}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
