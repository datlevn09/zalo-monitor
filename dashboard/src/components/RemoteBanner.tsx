'use client'

import { useEffect, useState } from 'react'
import { useRemoteContent } from '@/lib/remote-content'

export function RemoteBanner() {
  const { content } = useRemoteContent()
  const [isDismissed, setIsDismissed] = useState(false)

  const banner = content?.banner
  if (!banner?.active) return null

  // Generate hash of message for dismissal tracking
  const messageHash = btoa(banner.message).substring(0, 12)
  const dismissKey = `zm:banner-dismissed-${messageHash}`

  // Check if already dismissed
  useEffect(() => {
    try {
      if (typeof window === 'undefined' || !window.sessionStorage) return
      const wasDismissed = window.sessionStorage.getItem(dismissKey)
      if (wasDismissed) {
        setIsDismissed(true)
      }
    } catch (e) {
      // Silently ignore session storage errors
    }
  }, [dismissKey])

  const handleDismiss = () => {
    try {
      if (typeof window !== 'undefined' && window.sessionStorage) {
        window.sessionStorage.setItem(dismissKey, 'true')
      }
    } catch (e) {
      // Silently ignore session storage errors
    }
    setIsDismissed(true)
  }

  if (isDismissed) return null

  // Determine background color based on type
  const bgColor = {
    info: 'bg-blue-600 text-white',
    warning: 'bg-amber-500 text-white',
    promo: 'bg-gradient-to-r from-purple-600 to-blue-600 text-white',
    success: 'bg-green-600 text-white',
  }[banner.type]

  return (
    <div
      className={`${bgColor} w-full animate-in slide-in-from-top-2 duration-300`}
    >
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-3 flex items-center justify-center gap-4">
        <p className="text-sm md:text-base font-medium text-center flex-1">
          {banner.message}
        </p>

        {banner.link && banner.linkText && (
          <a
            href={banner.link}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 px-4 py-1.5 bg-white/20 hover:bg-white/30 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {banner.linkText}
          </a>
        )}

        {banner.dismissible && (
          <button
            onClick={handleDismiss}
            className="shrink-0 p-1 hover:bg-white/20 rounded-lg transition-colors"
            aria-label="Dismiss banner"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        )}
      </div>
    </div>
  )
}
