'use client'

import { ComposedChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts'
import type { Invoice } from '@/types/database'

interface Props {
  planCells:     Record<string, number>
  invoices?:     Invoice[]
  // Pre-aggregated alternative to invoices — used for the aggregate chart
  invoicedByMonth?: Record<string, number>
  expectedByMonth?: Record<string, number>
  months:        readonly string[]
  title?:        string
}

const SERIES_LABELS: Record<string, string> = {
  recognised:    'Recognised (P&L)',
  invoiced:      'Invoiced',
  expected_cash: 'Expected cash',
}

function monthLabel(iso: string) {
  const d = new Date(iso + 'T12:00:00')
  return d.toLocaleString('en-SE', { month: 'short', year: '2-digit' })
}

function fmtK(v: number) {
  return `${Math.round(v)} k`
}

const BAR_WIDTH = 56  // px per month group
const CHART_HEIGHT = 200

export function SowCashFlowChart({ planCells, invoices, invoicedByMonth: extInvoiced, expectedByMonth: extExpected, months, title }: Props) {
  // Build per-month maps — either from raw Invoice[] or from pre-aggregated maps
  const invoicedMap = new Map<string, number>()
  const expectedMap = new Map<string, number>()

  if (invoices) {
    for (const inv of invoices) {
      const im = inv.issue_date.slice(0, 7) + '-01'
      invoicedMap.set(im, (invoicedMap.get(im) ?? 0) + inv.amount_sek)
      const cashDate  = inv.status === 'paid' && inv.paid_date ? inv.paid_date : inv.due_date
      const em = cashDate.slice(0, 7) + '-01'
      expectedMap.set(em, (expectedMap.get(em) ?? 0) + inv.amount_sek)
    }
  } else {
    for (const [k, v] of Object.entries(extInvoiced ?? {})) invoicedMap.set(k, v)
    for (const [k, v] of Object.entries(extExpected ?? {})) expectedMap.set(k, v)
  }

  const now = new Date().toISOString().slice(0, 7) + '-01'

  const data = months.map(m => ({
    month:         monthLabel(m),
    isCurrent:     m === now,
    recognised:    Math.round((planCells[m] ?? 0) / 1000),
    invoiced:      Math.round((invoicedMap.get(m) ?? 0) / 1000),
    expected_cash: Math.round((expectedMap.get(m) ?? 0) / 1000),
  }))

  const hasData = months.some(m =>
    (planCells[m] ?? 0) > 0 ||
    (invoicedMap.get(m) ?? 0) > 0 ||
    (expectedMap.get(m) ?? 0) > 0
  )
  if (!hasData) return null

  const chartWidth = Math.max(months.length * BAR_WIDTH, 480)

  return (
    <div>
      {title && <p className="text-[10px] font-bold text-[#9CA3AF] uppercase tracking-widest mb-3">{title}</p>}
      <div className="overflow-x-auto">
        <div style={{ width: chartWidth }}>
          <ComposedChart width={chartWidth} height={CHART_HEIGHT} data={data} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
            <XAxis
              dataKey="month"
              tick={{ fontSize: 10, fill: '#9CA3AF' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 10, fill: '#9CA3AF' }}
              axisLine={false}
              tickLine={false}
              tickFormatter={fmtK}
            />
            <Tooltip
              formatter={(v, name) => [`${Math.round(v as number)} kSEK`, SERIES_LABELS[name as string] ?? name]}
              contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #E5E7EB' }}
            />
            <Legend
              formatter={(value) => SERIES_LABELS[value] ?? value}
              wrapperStyle={{ fontSize: 10 }}
            />
            <Bar dataKey="recognised"    fill="#61b5cc" radius={[2, 2, 0, 0]} maxBarSize={14} />
            <Bar dataKey="invoiced"      fill="#A78BFA" radius={[2, 2, 0, 0]} maxBarSize={14} />
            <Bar dataKey="expected_cash" fill="#F59E0B" radius={[2, 2, 0, 0]} maxBarSize={14} />
          </ComposedChart>
        </div>
      </div>
    </div>
  )
}
