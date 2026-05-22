'use client'

import {
  ComposedChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import type { Invoice } from '@/types/database'

interface Props {
  planCells: Record<string, number>
  invoices:  Invoice[]
  months:    readonly string[]
}

function monthLabel(iso: string) {
  return new Date(iso + 'T12:00:00').toLocaleString('en-SE', { month: 'short' })
}

function fmtK(v: number) {
  return `${Math.round(v / 1000)} k`
}

export function SowCashFlowChart({ planCells, invoices, months }: Props) {
  // Build per-month billing from invoices (use paid_date if paid, else due_date)
  const billedByMonth = new Map<string, number>()
  for (const inv of invoices) {
    const dateStr = inv.status === 'paid' && inv.paid_date ? inv.paid_date : inv.due_date
    const month   = dateStr.slice(0, 7) + '-01'
    billedByMonth.set(month, (billedByMonth.get(month) ?? 0) + inv.amount_sek)
  }

  const data = months.map(m => ({
    month:      monthLabel(m),
    recognised: Math.round((planCells[m] ?? 0) / 1000),
    billed:     Math.round((billedByMonth.get(m) ?? 0) / 1000),
  }))

  const hasData = data.some(d => d.recognised > 0 || d.billed > 0)
  if (!hasData) return null

  return (
    <div>
      <p className="text-[10px] font-bold text-[#9CA3AF] uppercase tracking-widest mb-3">Cash flow vs Recognition</p>
      <ResponsiveContainer width="100%" height={180}>
        <ComposedChart data={data} margin={{ top: 0, right: 0, left: -10, bottom: 0 }}>
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
            formatter={(v, name) => [`${v} kSEK`, name === 'recognised' ? 'Recognised (P&L)' : 'Billed/Expected']}
            contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #E5E7EB' }}
          />
          <Legend
            formatter={(value) => value === 'recognised' ? 'Recognised (P&L)' : 'Billed/Expected'}
            wrapperStyle={{ fontSize: 10 }}
          />
          <Bar dataKey="recognised" fill="#61b5cc" radius={[2, 2, 0, 0]} maxBarSize={20} />
          <Bar dataKey="billed"     fill="#F59E0B" radius={[2, 2, 0, 0]} maxBarSize={20} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
