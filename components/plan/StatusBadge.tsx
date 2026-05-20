'use client'

import type { PlanStatus } from '@/types/database'
import { cycleStatus } from '@/lib/plan-utils'

const COLORS: Record<PlanStatus, string> = {
  A: 'bg-[#F0FDF4] text-[#16A34A]',
  B: 'bg-[#EFF6FF] text-[#3B82F6]',
  F: 'bg-[#F3F4F6] text-[#6B7280]',
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
