import type { Trend } from '@/lib/plan-utils'

export function ClientBadge({ trend }: { trend: Trend | null }) {
  if (!trend) return null

  const cfg = {
    up:   { bg: '#16A34A', title: 'Trending up'   },
    flat: { bg: '#D97706', title: 'Stable'         },
    down: { bg: '#DC2626', title: 'Trending down'  },
  }[trend]

  return (
    <div
      title={cfg.title}
      className="w-3.5 h-3.5 rounded-full flex items-center justify-center flex-shrink-0"
      style={{ background: cfg.bg }}
    >
      <svg viewBox="0 0 12 12" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-2 h-2">
        {trend === 'up'   && <path d="M2 9 L6 3 L10 9" />}
        {trend === 'flat' && <path d="M2 6 H10 M7 3.5 L10 6 L7 8.5" />}
        {trend === 'down' && <path d="M2 3 L6 9 L10 3" />}
      </svg>
    </div>
  )
}
