/**
 * Icon set flat (1.75 stroke, line-style) — dùng thay emoji 3D cho đồng bộ
 * UI. Tất cả 20px default, currentColor → tô màu qua className text-*.
 */

type P = { className?: string; size?: number }
const base = (size = 20) => ({
  width: size, height: size, viewBox: '0 0 24 24',
  fill: 'none', stroke: 'currentColor',
  strokeWidth: 1.75, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
})

export const IcChat = ({ className, size }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
)

export const IcMail = ({ className, size }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
    <polyline points="22,6 12,13 2,6" />
  </svg>
)

export const IcAlert = ({ className, size }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
    <line x1="12" y1="9" x2="12" y2="13" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
)

export const IcWarning = ({ className, size }: P) => (
  <svg {...base(size)} className={className}>
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="8" x2="12" y2="12" />
    <line x1="12" y1="16" x2="12.01" y2="16" />
  </svg>
)

export const IcMoney = ({ className, size }: P) => (
  <svg {...base(size)} className={className}>
    <line x1="12" y1="1" x2="12" y2="23" />
    <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
  </svg>
)

export const IcSparkles = ({ className, size }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" />
  </svg>
)

export const IcTrendUp = ({ className, size }: P) => (
  <svg {...base(size)} className={className}>
    <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
    <polyline points="17 6 23 6 23 12" />
  </svg>
)

export const IcHeart = ({ className, size }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
  </svg>
)

export const IcFire = ({ className, size }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M8.5 14.5A2.5 2.5 0 0 0 11 17c1.38 0 2.5-1 2.5-2.5 0-1.5-1-2.5-2.5-4.5C9.5 8 8.5 6 8.5 4c0 0-3 1.5-3 5.5 0 2.5 1 4 3 5z" />
    <path d="M14 17a3 3 0 1 0 6 0c0-1.5-1-2.5-2-4.5C16.5 11 16 9 16 7c0 0-2 1-2 4 0 1.5.5 2 1 3 1 1.5 0 2.5-1 3z" />
  </svg>
)

export const IcSkull = ({ className, size }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M12 2C7 2 4 5.5 4 10v3c0 1 .5 2 1 2.5L7 17v3h2v-2h2v2h2v-2h2v2h2v-3l2-1.5c.5-.5 1-1.5 1-2.5v-3c0-4.5-3-8-8-8z" />
    <circle cx="9" cy="11" r="1.2" />
    <circle cx="15" cy="11" r="1.2" />
  </svg>
)

export const IcClock = ({ className, size }: P) => (
  <svg {...base(size)} className={className}>
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
)

export const IcChart = ({ className, size }: P) => (
  <svg {...base(size)} className={className}>
    <line x1="18" y1="20" x2="18" y2="10" />
    <line x1="12" y1="20" x2="12" y2="4" />
    <line x1="6" y1="20" x2="6" y2="14" />
  </svg>
)

export const IcTarget = ({ className, size }: P) => (
  <svg {...base(size)} className={className}>
    <circle cx="12" cy="12" r="10" />
    <circle cx="12" cy="12" r="6" />
    <circle cx="12" cy="12" r="2" />
  </svg>
)

export const IcUsers = ({ className, size }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
)
