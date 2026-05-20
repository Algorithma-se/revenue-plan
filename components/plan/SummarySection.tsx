'use client'

import { useEffect, useRef, useState } from 'react'
import type { RevenueRow, CostRow, PlanTarget } from '@/types/database'
import { FISCAL_MONTHS, sumCells, sumAllMonths, sumByStatus } from '@/lib/plan-utils'

const COL_STYLE = { gridTemplateColumns: '200px repeat(12, 76px) 80px' }

function SummaryRow({ label, values, fy, color, editable, onSave }: {
  label: string
  values: number[]
  fy: number
  color?: (v: number) => string
  editable?: boolean
  onSave?: (month: string, v: number) => void
}) {
  return (
    <div className="grid border-b border-[#F3F4F6]" style={COL_STYLE}>
      <div className="px-2 py-2 text-xs font-medium text-[#0F0F0F] truncate">{label}</div>
      {FISCAL_MONTHS.map((m, i) => (
        <SummaryCell
          key={m}
          value={values[i]}
          colorClass={color?.(values[i])}
          editable={editable}
          onSave={v => onSave?.(m, v)}
        />
      ))}
      <div className={`px-1 py-2 text-right text-xs font-semibold ${color?.(fy) ?? 'text-[#0F0F0F]'}`}>
        {fy === 0 ? <span className="text-[#D1D5DB]">—</span> : Math.round(fy / 1000).toLocaleString('sv-SE')}
      </div>
    </div>
  )
}

function SummaryCell({ value, colorClass, editable, onSave }: {
  value: number
  colorClass?: string
  editable?: boolean
  onSave?: (v: number) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft]     = useState('')
  const inputRef              = useRef<HTMLInputElement>(null)

  useEffect(() => { if (editing) inputRef.current?.select() }, [editing])

  function commit() {
    setEditing(false)
    const parsed = parseFloat(draft)
    const v = isNaN(parsed) ? 0 : Math.round(parsed * 1000)
    if (v !== value) onSave?.(v)
  }

  if (editing) {
    return (
      <div className="px-1 py-1">
        <input
          ref={inputRef}
          type="number"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={e => {
            if (e.key === 'Enter') commit()
            if (e.key === 'Escape') setEditing(false)
          }}
          className="w-full text-right text-xs bg-[#EFF6FF] border border-[#61b5cc] rounded px-1 py-1 outline-none"
        />
      </div>
    )
  }

  return (
    <div
      onClick={() => editable && (setDraft(value === 0 ? '' : String(Math.round(value / 1000))), setEditing(true))}
      className={`px-1 py-2 text-right text-xs font-semibold
        ${colorClass ?? 'text-[#0F0F0F]'}
        ${value === 0 ? '!text-[#D1D5DB]' : ''}
        ${editable ? 'cursor-text hover:bg-[#EFF6FF] rounded transition-colors' : ''}`}
    >
      {value === 0 ? '—' : Math.round(value / 1000).toLocaleString('sv-SE')}
    </div>
  )
}

export function SummarySection({
  allRevenueRows, allCostRows, targets, onSaveTarget,
}: {
  allRevenueRows: RevenueRow[]
  allCostRows:    CostRow[]
  targets:        PlanTarget[]
  onSaveTarget:   (month: string, amount: number) => Promise<void>
}) {
  const targetMap = Object.fromEntries(targets.map(t => [t.month, t.revenue_target]))

  const conservatism  = FISCAL_MONTHS.map(m => sumByStatus(allRevenueRows, m, ['F']))
  const totalRevAB    = FISCAL_MONTHS.map(m => sumByStatus(allRevenueRows, m, ['A', 'B']))
  const totalRev      = FISCAL_MONTHS.map(m => sumCells(allRevenueRows, m))
  const planTargets   = FISCAL_MONTHS.map(m => targetMap[m] ?? 0)
  const marginPlan    = planTargets.map(v => Math.round(v * 0.07))
  const delta         = totalRevAB.map((v, i) => v - planTargets[i])
  const totalCosts    = FISCAL_MONTHS.map(m => sumCells(allCostRows, m))
  const actualMargin  = FISCAL_MONTHS.map((_, i) => totalRevAB[i] - totalCosts[i])

  const fyConservatism = conservatism.reduce((s, v) => s + v, 0)
  const fyRevAB        = totalRevAB.reduce((s, v) => s + v, 0)
  const fyPlan         = planTargets.reduce((s, v) => s + v, 0)
  const fyMarginPlan   = Math.round(fyPlan * 0.07)
  const fyDelta        = fyRevAB - fyPlan
  const fyCosts        = totalCosts.reduce((s, v) => s + v, 0)
  const fyMargin       = fyRevAB - fyCosts

  const deltaColor = (v: number) => v >= 0 ? 'text-[#16A34A]' : 'text-[#EF4444]'
  const marginColor = (v: number) => v >= 0 ? 'text-[#16A34A]' : 'text-[#EF4444]'

  return (
    <div className="bg-white rounded-2xl border border-[#EBEBEB] overflow-hidden mt-2">
      <div className="px-3 py-2 bg-[#F9F9F8] border-b border-[#EBEBEB]">
        <span className="text-xs font-bold text-[#0F0F0F] uppercase tracking-wider">Summation</span>
      </div>

      {/* Month header repeat */}
      <div className="grid border-b border-[#EBEBEB]" style={COL_STYLE}>
        <div className="px-2 py-1.5" />
        {FISCAL_MONTHS.map(m => (
          <div key={m} className="px-1 py-1.5 text-center text-[10px] font-semibold text-[#9CA3AF] uppercase tracking-wider">
            {new Date(m + 'T12:00:00').toLocaleString('en-SE', { month: 'short' })}
          </div>
        ))}
        <div className="px-1 py-1.5 text-center text-[10px] font-semibold text-[#9CA3AF] uppercase tracking-wider">FY</div>
      </div>

      <SummaryRow label="Conservatism (FC)" values={conservatism} fy={fyConservatism} />
      <SummaryRow label="Total revenue (A+B)" values={totalRevAB} fy={fyRevAB} />

      {/* Revenue plan — editable */}
      <div className="grid border-b border-[#F3F4F6] bg-[#FFFBEB]" style={COL_STYLE}>
        <div className="px-2 py-2 text-xs font-semibold text-[#B45309] truncate">Revenue plan</div>
        {FISCAL_MONTHS.map((m, i) => (
          <SummaryCell
            key={m}
            value={planTargets[i]}
            colorClass="text-[#B45309] font-semibold"
            editable
            onSave={v => onSaveTarget(m, v)}
          />
        ))}
        <div className="px-1 py-2 text-right text-xs font-semibold text-[#B45309]">
          {fyPlan === 0 ? <span className="text-[#D1D5DB]">—</span> : Math.round(fyPlan / 1000).toLocaleString('sv-SE')}
        </div>
      </div>

      <SummaryRow label="Delta to plan" values={delta} fy={fyDelta} color={deltaColor} />
      <SummaryRow label="Margin plan (7%)" values={marginPlan} fy={fyMarginPlan} />
      <SummaryRow label="Total cost" values={totalCosts} fy={fyCosts} />
      <SummaryRow label="Actual margin" values={actualMargin} fy={fyMargin} color={marginColor} />
    </div>
  )
}
