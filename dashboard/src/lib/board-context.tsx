'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { api } from '@/lib/api'

type Board = { userId: string; userName: string; isOwn: boolean }

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

  function setActiveBoard(b: Board) {
    setActiveBoardState(b)
    localStorage.setItem('zm:boardUserId', b.userId)
  }

  return (
    <BoardContext.Provider value={{ boards, activeBoard, setActiveBoard, isReady }}>
      {children}
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
