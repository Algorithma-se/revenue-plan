'use client'

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import type { RevenueRow } from '@/types/database'

const COLORS = ['#61b5cc', '#8b5cf6', '#f97316', '#16a34a', '#f59e0b', '#94a3b8']

function currentMonthStr() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
}

export function RevenueDonut({
  allRevenueRows, months,
}: {
  allRevenueRows: RevenueRow[]
  months:         readonly string[]
}) {
  const curMonth  = currentMonthStr()
  const ytdMonths = months.filter(m => m <= curMonth)

  const byCustomer = allRevenueRows
    .filter(r => r.client_name)
    .map(r => ({
      name:  r.client_name!,
      value: ytdMonths.reduce((s, m) => {
        const cell = r.cells[m]
        return s + (cell && (cell.status === 'A' || cell.status === 'B') ? cell.amount : 0)
      }, 0),
    }))
    .filter(c => c.value > 0)
    .sort((a, b) => b.value - a.value)

  if (byCustomer.length === 0) return null

  const top5         = byCustomer.slice(0, 5)
  const othersValue  = byCustomer.slice(5).reduce((s, c) => s + c.value, 0)
  const data         = othersValue > 0 ? [...top5, { name: 'Others', value: othersValue }] : top5
  const total        = data.reduce((s, d) => s + d.value, 0)

  return (
    <div className="bg-white rounded-2xl border border-[#EBEBEB] p-4 shadow-sm h-full flex flex-col">

      {/* Header */}
      <div className="flex items-center gap-2 mb-2 flex-shrink-0">
        <span className="text-xs font-bold text-[#6B7280] uppercase tracking-wider">Revenue Mix</span>
        <span className="text-[10px] text-[#D1D5DB] ml-auto">YTD · A+B</span>
      </div>

      {/* Donut */}
      <div className="relative flex-shrink-0">
        <ResponsiveContainer width="100%" height={164}>
          <PieChart>
            <Pie
              data={data}
              cx="50%" cy="50%"
              innerRadius={46} outerRadius={68}
              dataKey="value"
              strokeWidth={2} stroke="white"
              paddingAngle={1}
            >
              {data.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #EBEBEB', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}
              formatter={(value) => {
                const v = typeof value === 'number' ? value : 0
                return [`${Math.round(v / 1000).toLocaleString('sv-SE')} kSEK`, '']
              }}
            />
          </PieChart>
        </ResponsiveContainer>

        {/* Centre label */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-[9px] text-[#9CA3AF] uppercase tracking-wide leading-none mb-0.5">Total</span>
          <span className="text-base font-bold text-[#0F0F0F] leading-none">
            {Math.round(total / 1000).toLocaleString('sv-SE')}
          </span>
          <span className="text-[9px] text-[#9CA3AF] leading-none mt-0.5">kSEK</span>
        </div>
      </div>

      {/* Legend */}
      <div className="space-y-1.5 mt-2 flex-1">
        {data.map((d, i) => (
          <div key={d.name} className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
            <span className="text-[11px] text-[#374151] truncate flex-1 min-w-0">{d.name}</span>
            <span className="text-[11px] font-semibold text-[#0F0F0F] tabular-nums">
              {Math.round(d.value / 1000).toLocaleString('sv-SE')}
            </span>
            <span className="text-[10px] text-[#9CA3AF] w-7 text-right flex-shrink-0 tabular-nums">
              {Math.round((d.value / total) * 100)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
