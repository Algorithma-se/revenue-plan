'use client'

import { useEffect, useRef, useState } from 'react'
import type { RevenueRow, CostRow, PlanTarget } from '@/types/database'
import { sumCells, sumAllMonths, sumByStatus, monthLabel } from '@/lib/plan-utils'

function colStyle(n: number) {
  return { gridTemplateColumns: `200px repeat(${n}, 76px) 80px` }
}

function SummaryRow({ label, values, fy, months, color, editable, onSave }: {
  label: string
  values: number[]
  fy: number
  months: readonly string[]
  color?: (v: number) => string
  editable?: boolean
  onSave?: (month: string, v: number) => void
}) {
  return (
    <div className="grid border-b border-[#F3F4F6]" style={colStyle(months.length)}>
      <div className="px-2 py-2 text-xs font-medium text-[#0F0F0F] truncate">{label}</div>
      {months.map((m, i) => (
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
  allRevenueRows, allCostRows, targets, months, onSaveTarget,
}: {
  allRevenueRows: RevenueRow[]
  allCostRows:    CostRow[]
  targets:        PlanTarget[]
  months:         readonly string[]
  onSaveTarget:   (month: string, amount: number) => Promise<void>
}) {
  const targetMap = Object.fromEntries(targets.map(t => [t.month, t.revenue_target]))
  const CS = colStyle(months.length)

  const conservatism  = months.map(m => sumByStatus(allRevenueRows, m, ['F']))
  const totalRevAB    = months.map(m => sumByStatus(allRevenueRows, m, ['A', 'B']))
  const planTargets   = months.map(m => targetMap[m] ?? 0)
  const marginPlan    = planTargets.map(v => Math.round(v * 0.07))
  const delta         = totalRevAB.map((v, i) => v - planTargets[i])
  const totalCosts    = months.map(m => sumCells(allCostRows, m))
  const actualMargin  = months.map((_, i) => totalRevAB[i] - totalCosts[i])

  const fyConservatism = conservatism.reduce((s, v) => s + v, 0)
  const fyRevAB        = totalRevAB.reduce((s, v) => s + v, 0)
  const fyPlan         = planTargets.reduce((s, v) => s + v, 0)
  const fyMarginPlan   = Math.round(fyPlan * 0.07)
  const fyDelta        = fyRevAB - fyPlan
  const fyCosts        = totalCosts.reduce((s, v) => s + v, 0)
  const fyMargin       = fyRevAB - fyCosts

  const deltaColor  = (v: number) => v >= 0 ? 'text-[#16A34A]' : 'text-[#EF4444]'
  const marginColor = (v: number) => v >= 0 ? 'text-[#16A34A]' : 'text-[#EF4444]'

  return (
    <div className="bg-white rounded-2xl border border-[#EBEBEB] overflow-hidden mt-2">
      <div className="px-3 py-2 bg-[#F9F9F8] border-b border-[#EBEBEB]">
        <span className="text-xs font-bold text-[#0F0F0F] uppercase tracking-wider">Summation</span>
      </div>

      {/* Month header */}
      <div className="grid border-b border-[#EBEBEB]" style={CS}>
        <div className="px-2 py-1.5" />
        {months.map(m => (
          <div key={m} className="px-1 py-1.5 text-center text-[10px] font-semibold text-[#9CA3AF] uppercase tracking-wider">
            {monthLabel(m)}
          </div>
        ))}
        <div className="px-1 py-1.5 text-center text-[10px] font-semibold text-[#9CA3AF] uppercase tracking-wider">FY</div>
      </div>

      <SummaryRow label="Conservatism (FC)" values={conservatism} fy={fyConservatism} months={months} />
      <SummaryRow label="Total revenue (A+B)" values={totalRevAB} fy={fyRevAB} months={months} />

      {/* Revenue plan — editable */}
      <div className="grid border-b border-[#F3F4F6] bg-[#FFFBEB]" style={CS}>
        <div className="px-2 py-2 text-xs font-semibold text-[#B45309] truncate">Revenue plan</div>
        {months.map((m, i) => (
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

      <SummaryRow label="Delta to plan" values={delta} fy={fyDelta} months={months} color={deltaColor} />
      <SummaryRow label="Margin plan (7%)" values={marginPlan} fy={fyMarginPlan} months={months} />
      <SummaryRow label="Total cost" values={totalCosts} fy={fyCosts} months={months} />
      <SummaryRow label="Actual margin" values={actualMargin} fy={fyMargin} months={months} color={marginColor} />
    </div>
  )
}
