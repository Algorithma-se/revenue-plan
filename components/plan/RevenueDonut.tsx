'use client'

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import type { RevenueRow } from '@/types/database'

const COLORS = ['#61b5cc', '#8b5cf6', '#f97316', '#16a34a', '#f59e0b', '#94a3b8']

function currentMonthStr() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
}

type Trend = 'up' | 'flat' | 'down'

function computeTrend(
  allRevenueRows: RevenueRow[],
  customerName: string,
  ytdMonths: string[],
): Trend | null {
  if (ytdMonths.length < 4) return null

  const lastThree = ytdMonths.slice(-3)
  const earlier   = ytdMonths.slice(0, -3)

  const sumMonths = (ms: string[]) =>
    allRevenueRows
      .filter(r => r.client_name === customerName)
      .reduce((total, r) =>
        total + ms.reduce((s, m) => {
          const cell = r.cells[m]
          return s + (cell && (cell.status === 'A' || cell.status === 'B') ? cell.amount : 0)
        }, 0)
      , 0)

  const avgLast3   = sumMonths(lastThree) / 3
  const avgEarlier = sumMonths(earlier) / earlier.length

  if (avgEarlier === 0 && avgLast3 === 0) return null
  if (avgEarlier === 0) return 'up'

  const ratio = avgLast3 / avgEarlier
  if (ratio > 1.10) return 'up'
  if (ratio < 0.90) return 'down'
  return 'flat'
}

function TrendBadge({ trend }: { trend: Trend }) {
  const cfg = {
    up:   { bg: '#16A34A', title: 'Trending up' },
    flat: { bg: '#D97706', title: 'Stable'      },
    down: { bg: '#DC2626', title: 'Trending down' },
  }[trend]

  return (
    <div
      title={cfg.title}
      className="w-3.5 h-3.5 rounded-full flex items-center justify-center flex-shrink-0"
      style={{ background: cfg.bg }}
    >
      <svg viewBox="0 0 12 12" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-2 h-2">
        {trend === 'up'   && <path d="M2 9 L6 3 L10 9" />}
        {trend === 'flat' && <path d="M2 6 H10 M7 3.5 L10 6 L7 8.5" />}
        {trend === 'down' && <path d="M2 3 L6 9 L10 3" />}
      </svg>
    </div>
  )
}

export function RevenueDonut({
  allRevenueRows, months,
}: {
  allRevenueRows: RevenueRow[]
  months:         readonly string[]
}) {
  const curMonth  = currentMonthStr()
  const ytdMonths = months.filter(m => m <= curMonth)

  const totals = new Map<string, number>()
  for (const r of allRevenueRows) {
    if (!r.client_name) continue
    const rowTotal = ytdMonths.reduce((s, m) => {
      const cell = r.cells[m]
      return s + (cell && (cell.status === 'A' || cell.status === 'B') ? cell.amount : 0)
    }, 0)
    totals.set(r.client_name, (totals.get(r.client_name) ?? 0) + rowTotal)
  }

  const byCustomer = Array.from(totals.entries())
    .map(([name, value]) => ({ name, value }))
    .filter(c => c.value > 0)
    .sort((a, b) => b.value - a.value)

  if (byCustomer.length === 0) return null

  const top5        = byCustomer.slice(0, 5)
  const othersValue = byCustomer.slice(5).reduce((s, c) => s + c.value, 0)
  const data        = othersValue > 0 ? [...top5, { name: 'Others', value: othersValue }] : top5
  const total       = data.reduce((s, d) => s + d.value, 0)

  // Pre-compute trends for named customers (not "Others")
  const trends = new Map<string, Trend | null>(
    top5.map(c => [c.name, computeTrend(allRevenueRows, c.name, ytdMonths)])
  )

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
        {data.map((d, i) => {
          const trend = trends.get(d.name) ?? null
          return (
            <div key={d.name} className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
              <span className="text-[11px] text-[#374151] truncate flex-1 min-w-0">{d.name}</span>
              {trend && <TrendBadge trend={trend} />}
              <span className="text-[11px] font-semibold text-[#0F0F0F] tabular-nums">
                {Math.round(d.value / 1000).toLocaleString('sv-SE')}
              </span>
              <span className="text-[10px] text-[#9CA3AF] w-7 text-right flex-shrink-0 tabular-nums">
                {Math.round((d.value / total) * 100)}%
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
