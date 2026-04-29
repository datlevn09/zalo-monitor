'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { api } from '@/lib/api'

type Board = { userId: string; userName: string; isOwn: boolean; isAllView?: boolean; role?: string }

type BoardContextType = {
  boards: Board[]
  activeBoard: Board | null
  setActiveBoard: (b: Board) => void
  isReady: boolean
}

const BoardContext = createContext<BoardContextType>({
  boards: [],
  activeBoard: null,
  setActiveBoard: () => {},
  isReady: false,
})

export function BoardProvider({
  children,
  currentUserId,
  currentUserName,
}: {
  children: React.ReactNode
  currentUserId: string
  currentUserName: string
}) {
  const [boards, setBoards] = useState<Board[]>([])
  const [activeBoard, setActiveBoardState] = useState<Board | null>(null)
  const [isReady, setIsReady] = useState(false)

  useEffect(() => {
    // Load accessible boards
    api<{ boards: Board[] }>('/api/board/mine')
      .then((data) => {
        const list: Board[] = data.boards ?? []
        setBoards(list)

        // Restore last active board from localStorage
        const saved = localStorage.getItem('zm:boardUserId')
        const found = saved ? list.find((b) => b.userId === saved) : null
        const own = list.find((b) => b.isOwn) ?? { userId: currentUserId, userName: currentUserName, isOwn: true }
        setActiveBoardState(found ?? own)
        setIsReady(true)
      })
      .catch(() => {
        // Fallback: if API fails, use current user's own board
        const own = { userId: currentUserId, userName: currentUserName, isOwn: true }
        setBoards([own])
        setActiveBoardState(own)
        setIsReady(true)
      })
  }, [currentUserId, currentUserName])

  const [switching, setSwitching] = useState(false)
  function setActiveBoard(b: Board) {
    setActiveBoardState(b)
    localStorage.setItem('zm:boardUserId', b.userId)
    // Trigger reload để mọi page re-fetch với board scope mới
    setSwitching(true)
    setTimeout(() => { window.location.reload() }, 600)
  }

  return (
    <BoardContext.Provider value={{ boards, activeBoard, setActiveBoard, isReady }}>
      {children}
      {switching && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[200] bg-blue-500 text-white px-4 py-2.5 rounded-full shadow-lg flex items-center gap-2 text-sm font-medium animate-in fade-in slide-in-from-top-4">
          <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
          <span>Đang chuyển board, chờ chút...</span>
        </div>
      )}
    </BoardContext.Provider>
  )
}

export function useBoardScope() {
  return useContext(BoardContext)
}

// Helper: get boardUserId for API calls
export function getBoardUserId(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem('zm:boardUserId')
}
