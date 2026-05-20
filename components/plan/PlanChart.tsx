'use client'

import { useState } from 'react'
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import type { RevenueRow, CostRow } from '@/types/database'
import { sumByStatus, sumCells, monthLabel } from '@/lib/plan-utils'

export function PlanChart({
  allRevenueRows, allCostRows, months,
}: {
  allRevenueRows: RevenueRow[]
  allCostRows:    CostRow[]
  months:         readonly string[]
}) {
  const [open, setOpen] = useState(true)

  const today = new Date()
  const currentMonthISO = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`
  const currentMonthLabel = months.includes(currentMonthISO) ? monthLabel(currentMonthISO) : null

  const data = months.map(m => {
    const rev    = sumByStatus(allRevenueRows, m, ['A', 'B'])
    const costs  = sumCells(allCostRows, m)
    const profit = rev - costs
    const marginPct = rev > 0 ? Math.round((profit / rev) * 100) : null
    return {
      month:       monthLabel(m),
      Revenue:     rev    > 0 ? Math.round(rev    / 1000) : null,
      Costs:       costs  > 0 ? Math.round(costs  / 1000) : null,
      Profit:      rev > 0 || costs > 0 ? Math.round(profit / 1000) : null,
      'Margin %':  marginPct,
    }
  })

  return (
    <div className="bg-white rounded-2xl border border-[#EBEBEB] overflow-hidden mb-4 shadow-sm">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-4 py-3 hover:bg-[#F9F9F8] transition-colors"
      >
        <svg
          viewBox="0 0 16 16" fill="currentColor"
          className={`w-3 h-3 text-[#9CA3AF] transition-transform duration-200 ${open ? 'rotate-0' : '-rotate-90'}`}
        >
          <path fillRule="evenodd" d="M1.646 4.646a.5.5 0 01.708 0L8 10.293l5.646-5.647a.5.5 0 01.708.708l-6 6a.5.5 0 01-.708 0l-6-6a.5.5 0 010-.708z" clipRule="evenodd" />
        </svg>
        <span className="text-xs font-bold text-[#64748B] uppercase tracking-widest">Trend</span>
      </button>

      {open && (
        <div className="px-2 pb-6 pt-2">
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={data} margin={{ top: 8, right: 48, left: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
              <XAxis
                dataKey="month"
                tick={{ fontSize: 11, fill: '#9CA3AF' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                yAxisId="kSEK"
                tick={{ fontSize: 11, fill: '#9CA3AF' }}
                axisLine={false}
                tickLine={false}
                tickFormatter={v => `${v}`}
                width={44}
              />
              <YAxis
                yAxisId="pct"
                orientation="right"
                tick={{ fontSize: 11, fill: '#9CA3AF' }}
                axisLine={false}
                tickLine={false}
                tickFormatter={v => `${v}%`}
                width={44}
              />
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 10, border: '1px solid #EBEBEB', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}
                formatter={(value, name) => {
                  const v = typeof value === 'number' ? value : 0
                  const n = String(name ?? '')
                  return n === 'Margin %' ? [`${v}%`, n] : [`${v.toLocaleString('sv-SE')} kSEK`, n]
                }}
              />
              <Legend
                wrapperStyle={{ fontSize: 11, paddingTop: 12, color: '#6B7280' }}
              />
              {currentMonthLabel && (
                <ReferenceLine
                  yAxisId="kSEK"
                  x={currentMonthLabel}
                  stroke="#61b5cc"
                  strokeWidth={1.5}
                  strokeDasharray="4 3"
                  label={{ value: 'now', position: 'insideTopRight', fontSize: 10, fill: '#61b5cc', dy: -4 }}
                />
              )}
              <Bar yAxisId="kSEK" dataKey="Revenue" fill="#61b5cc" opacity={0.85} radius={[3, 3, 0, 0]} maxBarSize={32} />
              <Bar yAxisId="kSEK" dataKey="Costs"   fill="#f97316" opacity={0.85} radius={[3, 3, 0, 0]} maxBarSize={32} />
              <Bar yAxisId="kSEK" dataKey="Profit"  fill="#16a34a" opacity={0.85} radius={[3, 3, 0, 0]} maxBarSize={32} />
              <Line
                yAxisId="pct" type="monotone" dataKey="Margin %"
                stroke="#8b5cf6" strokeWidth={1.5} dot={false} connectNulls
                strokeDasharray="2 2"
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
