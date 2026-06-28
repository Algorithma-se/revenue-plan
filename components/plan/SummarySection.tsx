'use client'

import type { RevenueRow, CostRow } from '@/types/database'
import { sumCells, sumAllMonths, sumByStatus, monthLabel } from '@/lib/plan-utils'

function colStyle(n: number) {
  return { gridTemplateColumns: `200px repeat(${n}, 76px) 80px` }
}

function SummaryRow({ label, values, fy, months, color }: {
  label: string
  values: number[]
  fy: number
  months: readonly string[]
  color?: (v: number) => string
}) {
  return (
    <div className="grid border-b border-[#F3F4F6]" style={colStyle(months.length)}>
      <div className="px-2 py-2 text-xs font-medium text-[#0F0F0F] truncate">{label}</div>
      {months.map((m, i) => (
        <div
          key={m}
          className={`px-1 py-2 text-right text-xs font-semibold
            ${color?.(values[i]) ?? 'text-[#0F0F0F]'}
            ${values[i] === 0 ? '!text-[#D1D5DB]' : ''}`}
        >
          {values[i] === 0 ? '—' : Math.round(values[i] / 1000).toLocaleString('sv-SE')}
        </div>
      ))}
      <div className={`px-1 py-2 text-right text-xs font-semibold ${color?.(fy) ?? 'text-[#0F0F0F]'} ${fy === 0 ? '!text-[#D1D5DB]' : ''}`}>
        {fy === 0 ? '—' : Math.round(fy / 1000).toLocaleString('sv-SE')}
      </div>
    </div>
  )
}

function MarginPctRow({ label, revenue, margin, months }: {
  label: string
  revenue: number[]
  margin:  number[]
  months:  readonly string[]
}) {
  const pct   = (r: number, m: number) => r > 0 ? Math.round((m / r) * 100) : null
  const color = (v: number | null) =>
    v === null ? 'text-[#D1D5DB]' : v >= 20 ? 'text-[#16A34A]' : v >= 0 ? 'text-[#D97706]' : 'text-[#EF4444]'
  const fmt   = (v: number | null) => v === null ? '—' : `${v}%`

  const fyRev    = revenue.reduce((s, v) => s + v, 0)
  const fyMargin = margin.reduce((s, v) => s + v, 0)
  const fyPct    = pct(fyRev, fyMargin)

  return (
    <div className="grid border-b border-[#F3F4F6]" style={colStyle(months.length)}>
      <div className="px-2 py-2 text-xs font-medium text-[#0F0F0F] truncate">{label}</div>
      {months.map((m, i) => {
        const v = pct(revenue[i], margin[i])
        return (
          <div key={m} className={`px-1 py-2 text-right text-xs font-semibold ${color(v)}`}>
            {fmt(v)}
          </div>
        )
      })}
      <div className={`px-1 py-2 text-right text-xs font-semibold ${color(fyPct)}`}>
        {fmt(fyPct)}
      </div>
    </div>
  )
}

export function SummarySection({
  allRevenueRows, allCostRows, months,
}: {
  allRevenueRows: RevenueRow[]
  allCostRows:    CostRow[]
  months:         readonly string[]
}) {
  const CS = colStyle(months.length)

  const conservatism = months.map(m => sumByStatus(allRevenueRows, m, ['F']))
  const totalRevAB   = months.map(m => sumByStatus(allRevenueRows, m, ['A', 'B']))
  const totalCosts   = months.map(m => sumCells(allCostRows, m))
  const actualMargin = months.map((_, i) => totalRevAB[i] - totalCosts[i])

  const fyConservatism = conservatism.reduce((s, v) => s + v, 0)
  const fyRevAB        = totalRevAB.reduce((s, v) => s + v, 0)
  const fyCosts        = totalCosts.reduce((s, v) => s + v, 0)
  const fyMargin       = fyRevAB - fyCosts

  const marginColor = (v: number) => v >= 0 ? 'text-[#16A34A]' : 'text-[#EF4444]'

  return (
    <div className="bg-white rounded-2xl border border-[#9ED3E3] overflow-hidden mt-2">
      <div className="px-3 py-2 bg-[#EBF8FA] border-b border-[#C0E8F2]">
        <span className="text-xs font-bold text-[#5191A4] uppercase tracking-wider">Summation</span>
      </div>

      {/* Month header */}
      <div className="grid bg-[#EBF8FA] border-b border-[#C0E8F2]" style={CS}>
        <div className="px-2 py-1.5" />
        {months.map(m => (
          <div key={m} className="px-1 py-1.5 text-center text-[10px] font-semibold text-[#5191A4] uppercase tracking-wider">
            {monthLabel(m)}
          </div>
        ))}
        <div className="px-1 py-1.5 text-center text-[10px] font-semibold text-[#5191A4] uppercase tracking-wider">FY</div>
      </div>

      <SummaryRow label="Conservatism (FC)" values={conservatism} fy={fyConservatism} months={months} />
      <SummaryRow label="Total revenue (A+B)" values={totalRevAB} fy={fyRevAB} months={months} />
      <SummaryRow label="Total cost" values={totalCosts} fy={fyCosts} months={months} />
      <SummaryRow label="Actual margin" values={actualMargin} fy={fyMargin} months={months} color={marginColor} />
      <MarginPctRow label="Margin %" revenue={totalRevAB} margin={actualMargin} months={months} />
    </div>
  )
}
