import type { RevenueRow } from '@/types/database'

type Tier = 'recurring' | 'active' | 'new'

function getBadgeTier(row: RevenueRow): Tier {
  const cells = Object.values(row.cells)
  const monthsWithAmount = cells.filter(c => c.amount > 0).length
  const hasActuals  = cells.some(c => c.status === 'A')
  const hasBookings = cells.some(c => c.status === 'B')

  if (hasActuals && monthsWithAmount >= 6) return 'recurring'
  if (monthsWithAmount >= 3 || hasBookings) return 'active'
  return 'new'
}

const STYLES: Record<Tier, { pill: string; dot: string; label: string }> = {
  recurring: { pill: 'bg-[#F0FDF4] text-[#15803D]', dot: 'bg-[#22C55E]', label: 'Recurring' },
  active:    { pill: 'bg-[#EFF6FF] text-[#2563EB]', dot: 'bg-[#60A5FA]', label: 'Active' },
  new:       { pill: 'bg-[#F9FAFB] text-[#9CA3AF]', dot: 'bg-[#D1D5DB]', label: 'New' },
}

export function ClientBadge({ row }: { row: RevenueRow }) {
  const tier = getBadgeTier(row)
  const s = STYLES[tier]
  return (
    <span className={`inline-flex items-center gap-1 text-[9px] font-semibold px-1.5 py-0.5 rounded-full leading-none whitespace-nowrap ${s.pill}`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${s.dot}`} />
      {s.label}
    </span>
  )
}
