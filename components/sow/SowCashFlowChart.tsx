'use client'

import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine } from 'recharts'
import type { Invoice } from '@/types/database'

interface Props {
  planCells:     Record<string, number>
  invoices?:     Invoice[]
  invoicedByMonth?:    Record<string, number>
  expectedByMonth?:    Record<string, number>
  costsByMonth?:       Record<string, number>
  bankBalanceByMonth?: Record<string, number | null>
  months:        readonly string[]
  title?:        string
  minWidth?:     number
}

// Must NOT include Legend — it takes vertical space inside the SVG and breaks
// axis alignment between the main chart and the right-axis panel.
const SERIES: { key: string; label: string; color: string; type: 'bar' | 'line' }[] = [
  { key: 'recognised',    label: 'Recognised (P&L)', color: '#61b5cc', type: 'bar'  },
  { key: 'invoiced',      label: 'Invoiced',          color: '#A78BFA', type: 'bar'  },
  { key: 'expected_cash', label: 'Expected cash',     color: '#F59E0B', type: 'bar'  },
  { key: 'costs',         label: 'Costs (P&L)',       color: '#F87171', type: 'bar'  },
  { key: 'bank_balance',  label: 'Bank balance',      color: '#0B7A9E', type: 'line' },
]

function monthLabel(iso: string) {
  const d = new Date(iso + 'T12:00:00')
  return d.toLocaleString('en-SE', { month: 'short', year: '2-digit' })
}
function fmtK(v: number) { return `${Math.round(v)} k` }

const BAR_WIDTH    = 56
const CHART_HEIGHT = 220
// Shared margins — MUST be identical in both the main chart and the right-axis panel
// so that the plot area height is the same and zeros align pixel-perfectly.
const CHART_MARGIN = { top: 4, right: 0, left: -10, bottom: 0 }
const PAD = 1.12

function alignedDomains(leftVals: number[], rightVals: number[]) {
  const lMax = Math.max(0, ...leftVals)
  const lMin = Math.min(0, ...leftVals)

  // Only use the positive / anchor-driven bank balance values for scaling.
  // Exclude null→0 and extreme future projections so they don't drag the scale.
  const rPositive = rightVals.filter(v => v > 0)
  const rNegative = rightVals.filter(v => v < 0)
  const rMax = rPositive.length > 0 ? Math.max(...rPositive) : 0
  const rRawMin = rNegative.length > 0 ? Math.min(...rNegative) : 0

  // Aligned rMin from zero-alignment formula: lMin/lMax = rMin/rMax
  const rAligned = lMax !== 0 ? (lMin / lMax) * rMax : 0

  // If actual data goes more negative than the aligned rMin, we must extend rMax
  // proportionally to keep zeros in line: rMax_new = rRawMin * lMax / lMin
  let rMin: number, rMaxFinal: number
  if (rRawMin < rAligned && lMin !== 0) {
    rMin     = rRawMin
    rMaxFinal = rRawMin * lMax / lMin   // maintains lMin/lMax = rMin/rMax
  } else {
    rMin      = rAligned
    rMaxFinal = rMax
  }

  return {
    left:  [lMin * PAD, lMax * PAD] as [number, number],
    right: [rMin * PAD, rMaxFinal * PAD] as [number, number],
  }
}

export function SowCashFlowChart({
  planCells, invoices, invoicedByMonth: extInvoiced, expectedByMonth: extExpected,
  costsByMonth, bankBalanceByMonth, months, title, minWidth,
}: Props) {
  const invoicedMap = new Map<string, number>()
  const expectedMap = new Map<string, number>()

  if (invoices) {
    for (const inv of invoices) {
      const im = inv.issue_date.slice(0, 7) + '-01'
      invoicedMap.set(im, (invoicedMap.get(im) ?? 0) + inv.amount_sek)
      const cashDate = inv.status === 'paid' && inv.paid_date ? inv.paid_date : inv.due_date
      const em = cashDate.slice(0, 7) + '-01'
      expectedMap.set(em, (expectedMap.get(em) ?? 0) + inv.amount_sek)
    }
  } else {
    for (const [k, v] of Object.entries(extInvoiced ?? {})) invoicedMap.set(k, v)
    for (const [k, v] of Object.entries(extExpected ?? {})) expectedMap.set(k, v)
  }

  const now = new Date().toISOString().slice(0, 7) + '-01'

  const data = months.map(m => {
    const bb = bankBalanceByMonth?.[m]
    return {
      month:         monthLabel(m),
      recognised:    Math.round((planCells[m] ?? 0) / 1000),
      invoiced:      Math.round((invoicedMap.get(m) ?? 0) / 1000),
      expected_cash: Math.round((expectedMap.get(m) ?? 0) / 1000),
      costs:         costsByMonth ? -Math.round((costsByMonth[m] ?? 0) / 1000) : undefined,
      bank_balance:  bb != null ? Math.round(bb / 1000) : null,
    }
  })

  const hasData = months.some(m =>
    (planCells[m] ?? 0) > 0 || (invoicedMap.get(m) ?? 0) > 0 ||
    (expectedMap.get(m) ?? 0) > 0 || (costsByMonth?.[m] ?? 0) > 0 ||
    (bankBalanceByMonth?.[m] != null)
  )
  if (!hasData) return null

  const hasBankBalance = !!bankBalanceByMonth && data.some(d => d.bank_balance != null)

  const leftVals  = data.flatMap(d => [d.recognised, d.invoiced, d.expected_cash, d.costs ?? 0])
  const rightVals = hasBankBalance ? data.map(d => d.bank_balance ?? 0) : []
  const domains   = hasBankBalance ? alignedDomains(leftVals, rightVals) : null

  const chartWidth = Math.max(months.length * BAR_WIDTH, minWidth ?? 480)

  const tooltip = (
    <Tooltip
      formatter={(v, name) => {
        const s = SERIES.find(x => x.key === name)
        return [v != null ? `${Math.round(v as number)} kSEK` : '—', s?.label ?? name]
      }}
      contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #E5E7EB' }}
    />
  )

  // Active series for the legend row
  const activeSeries = SERIES.filter(s => {
    if (s.key === 'costs' && !costsByMonth) return false
    if (s.key === 'bank_balance' && !hasBankBalance) return false
    return true
  })

  return (
    <div>
      {title && <p className="text-[10px] font-bold text-[#9CA3AF] uppercase tracking-widest mb-3">{title}</p>}

      {/* Chart row: scrollable bars | fixed right-axis panel */}
      <div className="flex items-start">

        {/* Scrollable main chart — NO Legend inside (would change plot-area height) */}
        <div className="overflow-x-auto flex-1 min-w-0">
          <div style={{ width: chartWidth }}>
            <ComposedChart
              width={chartWidth}
              height={CHART_HEIGHT}
              data={data}
              margin={CHART_MARGIN}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />

              <YAxis
                yAxisId="left"
                type="number"
                tick={{ fontSize: 10, fill: '#9CA3AF' }}
                axisLine={false} tickLine={false}
                tickFormatter={fmtK}
                allowDataOverflow
                {...(domains ? { domain: domains.left } : {})}
              />

              {/* Right axis present for correct line scale — ticks hidden (panel shows them) */}
              {hasBankBalance && (
                <YAxis
                  yAxisId="right"
                  type="number"
                  orientation="right"
                  tick={false} axisLine={false} tickLine={false}
                  width={1}
                  domain={domains!.right}
                  allowDataOverflow
                />
              )}

              <ReferenceLine yAxisId="left" y={0} stroke="#D1D5DB" strokeWidth={1} />
              {tooltip}

              <Bar yAxisId="left" dataKey="recognised"    fill="#61b5cc" radius={[2,2,0,0]} maxBarSize={14} />
              <Bar yAxisId="left" dataKey="invoiced"      fill="#A78BFA" radius={[2,2,0,0]} maxBarSize={14} />
              <Bar yAxisId="left" dataKey="expected_cash" fill="#F59E0B" radius={[2,2,0,0]} maxBarSize={14} />
              {costsByMonth && <Bar yAxisId="left" dataKey="costs" fill="#F87171" radius={[2,2,0,0]} maxBarSize={14} />}
              {hasBankBalance && (
                <Line
                  yAxisId="right"
                  dataKey="bank_balance"
                  stroke="#0B7A9E" strokeWidth={2}
                  dot={{ r: 3, fill: '#0B7A9E', strokeWidth: 0 }}
                  activeDot={{ r: 4 }}
                  connectNulls={false} type="monotone"
                />
              )}
            </ComposedChart>
          </div>
        </div>

        {/* Fixed right-axis panel — same height + margins as main chart → zeros align */}
        {hasBankBalance && domains && (
          <div className="flex-shrink-0 bg-white" style={{ width: 52 }}>
            <ComposedChart
              width={52}
              height={CHART_HEIGHT}
              data={data}
              margin={{ top: CHART_MARGIN.top, right: 8, left: 0, bottom: CHART_MARGIN.bottom }}
            >
              <YAxis
                type="number"
                orientation="right"
                tick={{ fontSize: 10, fill: '#0B7A9E' }}
                axisLine={false} tickLine={false}
                tickFormatter={fmtK}
                domain={domains.right}
                allowDataOverflow
                width={44}
              />
              {/* Invisible line — needed for Recharts to bind the axis */}
              <Line dataKey="bank_balance" stroke="rgba(0,0,0,0)" dot={false} activeDot={false} legendType="none" />
            </ComposedChart>
          </div>
        )}
      </div>

      {/* Legend rendered OUTSIDE the charts so it doesn't affect plot-area height */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 pl-4" style={{ fontSize: 10, color: '#6B7280' }}>
        {activeSeries.map(s => (
          <span key={s.key} className="flex items-center gap-1.5">
            {s.type === 'line'
              ? <span style={{ display: 'inline-block', width: 12, height: 2, backgroundColor: s.color, borderRadius: 1 }} />
              : <span style={{ display: 'inline-block', width: 8, height: 8, backgroundColor: s.color, borderRadius: 2 }} />
            }
            {s.label}
          </span>
        ))}
      </div>
    </div>
  )
}
