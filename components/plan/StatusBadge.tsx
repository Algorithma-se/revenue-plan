'use client'

import type { PlanStatus } from '@/types/database'
import { cycleStatus } from '@/lib/plan-utils'

const COLORS: Record<PlanStatus, string> = {
  A: 'bg-[#16A34A] text-white',
  B: 'bg-[#2563EB] text-white',
  F: 'bg-[#9CA3AF] text-white',
}

export function StatusBadge({
  status,
  onCycle,
  readonly,
}: {
  status: PlanStatus
  onCycle?: (next: PlanStatus) => void
  readonly?: boolean
}) {
  return (
    <span
      onClick={e => {
        if (readonly) return
        e.stopPropagation()
        onCycle?.(cycleStatus(status))
      }}
      className={`inline-block text-[9px] font-bold px-1 py-0.5 rounded leading-none select-none
        ${COLORS[status]}
        ${readonly ? '' : 'cursor-pointer hover:opacity-70 transition-opacity'}`}
    >
      {status}
    </span>
  )
}
