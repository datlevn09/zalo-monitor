'use client'

import { useEffect, useState } from 'react'

export interface RemoteContent {
  landing?: {
    badge?: string
    headline?: string
    headlineAccent?: string
    subheadline?: string
    features?: Array<{ icon: string; title: string; desc: string }>
  }
  banner?: {
    active: boolean
    type: 'info' | 'warning' | 'promo' | 'success'
    message: string
    link?: string
    linkText?: string
    dismissible?: boolean
  }
}

interface CacheData {
  data: RemoteContent | null
  fetchedAt: number
}

const CACHE_KEY = 'zm:remote-content'
const CACHE_TTL = 3600000 // 1 hour in milliseconds
const FETCH_TIMEOUT = 3000 // 3 seconds

function getRemoteContentUrl(): string {
  if (typeof window === 'undefined') return ''
  return process.env.NEXT_PUBLIC_REMOTE_CONTENT_URL || 'https://datthongdong.com/api/zalo-monitor'
}

function getCachedContent(): RemoteContent | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null
    const cached = window.localStorage.getItem(CACHE_KEY)
    if (!cached) return null

    const { data, fetchedAt } = JSON.parse(cached) as CacheData
    const now = Date.now()

    // Return cache if fresh (< 1 hour old)
    if (now - fetchedAt < CACHE_TTL) {
      return data
    }
  } catch (e) {
    // Silently ignore cache errors
  }
  return null
}

function setCachedContent(data: RemoteContent | null): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return
    const cache: CacheData = {
      data,
      fetchedAt: Date.now(),
    }
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(cache))
  } catch (e) {
    // Silently ignore cache errors (quota exceeded, etc.)
  }
}

async function fetchRemoteContent(): Promise<RemoteContent | null> {
  const url = getRemoteContentUrl()
  if (!url) return null

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT)

    const response = await fetch(`${url}/content.json`, {
      signal: controller.signal,
      cache: 'no-store',
    })

    clearTimeout(timeoutId)

    if (!response.ok) return null

    const data = (await response.json()) as RemoteContent
    setCachedContent(data)
    return data
  } catch (e) {
    // Fetch failed (timeout, network error, etc.)
    // Return cached data if available, otherwise null
    return getCachedContent()
  }
}

export function useRemoteContent(): {
  content: RemoteContent | null
  loading: boolean
} {
  const [content, setContent] = useState<RemoteContent | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Return cached content immediately if fresh
    const cached = getCachedContent()
    if (cached) {
      setContent(cached)
      setLoading(false)
    } else {
      setLoading(true)
    }

    // Fetch fresh content in background
    let isMounted = true

    fetchRemoteContent().then(data => {
      if (isMounted) {
        if (data) {
          setContent(data)
        } else if (!cached) {
          // No fresh data and no cache, use null
          setContent(null)
        }
        setLoading(false)
      }
    })

    return () => {
      isMounted = false
    }
  }, [])

  return { content, loading }
}
