'use client'

import { useEffect, useMemo } from 'react'
import type { Pod, RevenueRow, CostRow, PlanStatus } from '@/types/database'
import { sumByStatus, sumCells, monthLabel, fyLabel } from '@/lib/plan-utils'
import { EditableCell } from '@/components/plan/EditableCell'
import { AISummary } from '@/components/plan/AISummary'

type Slide =
  | { kind: 'overview' }
  | { kind: 'pod';    pod: Pod; revenueRows: RevenueRow[]; costRows: CostRow[] }
  | { kind: 'client'; pod: Pod; row: RevenueRow }

interface Props {
  pods:           Pod[]
  allRevenueRows: RevenueRow[]
  allCostRows:    CostRow[]
  months:         readonly string[]
  fyStart:        number
  currentSlide:   number
  onSlideChange:  (n: number) => void
  onClose:        () => void
  onSaveManualCellAmount: (itemId: string, month: string, status: PlanStatus, amount: number) => Promise<void>
  onSaveManualCellStatus: (itemId: string, month: string, amount: number, status: PlanStatus) => Promise<void>
}

function kFmt(v: number) {
  return `${Math.round(v / 1000).toLocaleString('sv-SE')} kSEK`
}

const COLOUR = {
  green: 'text-[#4ADE80]',
  amber: 'text-[#FCD34D]',
  red:   'text-[#F87171]',
  white: 'text-white',
} as const

function KpiCard({ label, value, colour = 'white' }: {
  label:  string
  value:  string
  colour?: keyof typeof COLOUR
}) {
  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl px-5 py-4">
      <p className="text-white/40 text-xs font-semibold uppercase tracking-wider mb-2">{label}</p>
      <p className={`text-2xl font-bold tabular-nums ${COLOUR[colour]}`}>{value}</p>
    </div>
  )
}

function marginColour(pct: number | null): keyof typeof COLOUR {
  if (pct == null) return 'white'
  if (pct >= 20) return 'green'
  if (pct >= 0)  return 'amber'
  return 'red'
}

// ─── Slide: Overview ──────────────────────────────────────────────────────────

function OverviewSlide({ allRevenueRows, allCostRows, months }: {
  allRevenueRows: RevenueRow[]
  allCostRows:    CostRow[]
  months:         readonly string[]
}) {
  const totalRev  = months.reduce((s, m) => s + sumByStatus(allRevenueRows, m, ['A', 'B']), 0)
  const totalCost = months.reduce((s, m) => s + sumCells(allCostRows, m), 0)
  const margin    = totalRev - totalCost
  const marginPct = totalRev > 0 ? Math.round((margin / totalRev) * 100) : null

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-5xl font-bold text-white mb-2">Weekly P&L Review</h1>
      <p className="text-white/40 mb-10 text-lg">Full fiscal year overview</p>

      <div className="grid grid-cols-4 gap-4 mb-8">
        <KpiCard label="Revenue (A+B)" value={kFmt(totalRev)} />
        <KpiCard label="Costs" value={kFmt(totalCost)} />
        <KpiCard label="Gross margin" value={kFmt(margin)} colour={margin >= 0 ? 'green' : 'red'} />
        <KpiCard
          label="Margin %"
          value={marginPct != null ? `${marginPct}%` : '—'}
          colour={marginColour(marginPct)}
        />
      </div>

      <AISummary
        allRevenueRows={allRevenueRows}
        allCostRows={allCostRows}
        months={months}
      />
    </div>
  )
}

// ─── Slide: Pod ───────────────────────────────────────────────────────────────

function PodSlide({ pod, revenueRows, costRows, months }: {
  pod:         Pod
  revenueRows: RevenueRow[]
  costRows:    CostRow[]
  months:      readonly string[]
}) {
  const totalRev  = months.reduce((s, m) => s + sumByStatus(revenueRows, m, ['A', 'B']), 0)
  const totalCost = months.reduce((s, m) => s + sumCells(costRows, m), 0)
  const margin    = totalRev - totalCost
  const marginPct = totalRev > 0 ? Math.round((margin / totalRev) * 100) : null

  const today     = new Date()
  const curMonth  = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`
  const ytdMonths = months.filter(m => m <= curMonth)

  return (
    <div className="max-w-4xl mx-auto">
      <p className="text-white/40 text-xs font-semibold uppercase tracking-widest mb-2">Pod</p>
      <h1 className="text-5xl font-bold text-white mb-1">{pod.name}</h1>
      <p className="text-white/40 mb-8 text-sm">
        {revenueRows.length} client{revenueRows.length !== 1 ? 's' : ''}
      </p>

      <div className="grid grid-cols-3 gap-4 mb-8">
        <KpiCard label="Revenue (A+B)" value={kFmt(totalRev)} />
        <KpiCard label="Costs" value={kFmt(totalCost)} />
        <KpiCard label="Margin %" value={marginPct != null ? `${marginPct}%` : '—'} colour={marginColour(marginPct)} />
      </div>

      <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
        <div className="px-5 py-3 border-b border-white/10">
          <p className="text-white/50 text-[10px] font-semibold uppercase tracking-wider">Clients in this pod</p>
        </div>
        {revenueRows.length === 0 && (
          <p className="px-5 py-4 text-white/30 text-sm">No clients in this pod.</p>
        )}
        {revenueRows.map(row => {
          const ytdRev = ytdMonths.reduce((s, m) => s + sumByStatus([row], m, ['A', 'B']), 0)
          const fyAll  = months.reduce((s, m) => s + (row.cells[m]?.amount ?? 0), 0)
          return (
            <div key={row.id} className="flex items-center justify-between px-5 py-3.5 border-b border-white/5 last:border-0">
              <div>
                <span className="text-white font-medium">{row.client_name ?? '—'}</span>
                {row.project && <span className="ml-2 text-white/40 text-xs">{row.project}</span>}
              </div>
              <div className="flex gap-10 text-right">
                <div>
                  <p className="text-white/30 text-[10px] uppercase tracking-wider mb-0.5">YTD A+B</p>
                  <p className="text-white/80 text-sm font-semibold tabular-nums">
                    {Math.round(ytdRev / 1000).toLocaleString('sv-SE')} k
                  </p>
                </div>
                <div>
                  <p className="text-white/30 text-[10px] uppercase tracking-wider mb-0.5">FY Total</p>
                  <p className="text-white/80 text-sm font-semibold tabular-nums">
                    {Math.round(fyAll / 1000).toLocaleString('sv-SE')} k
                  </p>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Slide: Client ────────────────────────────────────────────────────────────

function ClientSlide({ pod, row, months, onSaveAmount, onSaveStatus }: {
  pod:          Pod
  row:          RevenueRow
  months:       readonly string[]
  onSaveAmount: (itemId: string, month: string, status: PlanStatus, amount: number) => Promise<void>
  onSaveStatus: (itemId: string, month: string, amount: number, status: PlanStatus) => Promise<void>
}) {
  const fyTotal  = months.reduce((s, m) => s + (row.cells[m]?.amount ?? 0), 0)
  const abTotal  = months.reduce((s, m) => s + sumByStatus([row], m, ['A', 'B']), 0)
  const today    = new Date()
  const curMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`

  return (
    <div className="max-w-5xl mx-auto">
      <p className="text-white/40 text-sm mb-1">{pod.name}</p>
      <h1 className="text-4xl font-bold text-white mb-1">{row.client_name ?? '—'}</h1>
      <div className="mt-1 mb-6">
        {row.project && <p className="text-white/50 text-sm">{row.project}</p>}
        {row.notes   && <p className="text-white/30 text-xs mt-0.5">{row.notes}</p>}
      </div>

      <div className="flex gap-4 mb-6">
        <div className="bg-white/5 border border-white/10 rounded-xl px-5 py-3">
          <p className="text-white/40 text-[10px] uppercase tracking-wider mb-1">FY Forecast</p>
          <p className="text-white font-bold text-xl tabular-nums">
            {Math.round(fyTotal / 1000).toLocaleString('sv-SE')}
            <span className="text-sm text-white/50 ml-1">kSEK</span>
          </p>
        </div>
        <div className="bg-white/5 border border-white/10 rounded-xl px-5 py-3">
          <p className="text-white/40 text-[10px] uppercase tracking-wider mb-1">A+B booked</p>
          <p className="text-white font-bold text-xl tabular-nums">
            {Math.round(abTotal / 1000).toLocaleString('sv-SE')}
            <span className="text-sm text-white/50 ml-1">kSEK</span>
          </p>
        </div>
      </div>

      <div className="bg-white rounded-2xl overflow-hidden shadow-2xl">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-[#F9F9F8] border-b border-[#EBEBEB]">
                {months.map(m => (
                  <th
                    key={m}
                    className="px-1 py-2 text-center text-[10px] font-bold text-[#9CA3AF] uppercase tracking-wider min-w-[72px]"
                  >
                    {monthLabel(m)}
                  </th>
                ))}
                <th className="px-3 py-2 text-right text-[10px] font-bold text-[#9CA3AF] uppercase tracking-wider min-w-[72px] border-l border-[#EBEBEB]">
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                {months.map(m => {
                  const cell    = row.cells[m] ?? { amount: 0, status: 'F' as PlanStatus }
                  const isAging = m < curMonth && cell.status !== 'A'
                  return (
                    <td key={m} className="border-r border-[#F3F4F6]">
                      <EditableCell
                        amount={cell.amount}
                        status={cell.status}
                        isAging={isAging}
                        onSaveAmount={v => onSaveAmount(row.id, m, cell.status, v)}
                        onSaveStatus={s => onSaveStatus(row.id, m, cell.amount, s)}
                      />
                    </td>
                  )
                })}
                <td className="border-l border-[#EBEBEB] px-3 py-1 text-right text-xs font-bold text-[#374151] tabular-nums">
                  {Math.round(fyTotal / 1000).toLocaleString('sv-SE')}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function PresentationMode({
  pods, allRevenueRows, allCostRows, months, fyStart,
  currentSlide, onSlideChange, onClose,
  onSaveManualCellAmount, onSaveManualCellStatus,
}: Props) {
  const slides = useMemo<Slide[]>(() => {
    const result: Slide[] = [{ kind: 'overview' }]
    for (const pod of pods) {
      const podRevRows  = allRevenueRows.filter(r => r.pod_id === pod.id)
      const podCostRows = allCostRows.filter(r => r.pod_id === pod.id)
      if (podRevRows.length === 0 && podCostRows.length === 0) continue
      result.push({ kind: 'pod', pod, revenueRows: podRevRows, costRows: podCostRows })
      for (const row of podRevRows) {
        result.push({ kind: 'client', pod, row })
      }
    }
    return result
  }, [pods, allRevenueRows, allCostRows])

  const safeIdx = Math.min(currentSlide, slides.length - 1)
  const slide   = slides[safeIdx]

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'ArrowRight') onSlideChange(Math.min(currentSlide + 1, slides.length - 1))
      if (e.key === 'ArrowLeft')  onSlideChange(Math.max(currentSlide - 1, 0))
      if (e.key === 'Escape')     onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [currentSlide, slides.length, onSlideChange, onClose])

  if (!slide) return null

  return (
    <div className="fixed inset-0 z-50 bg-[#0F0F0F] flex flex-col">

      {/* Top bar */}
      <div className="flex items-center justify-between px-8 py-3 border-b border-white/10 shrink-0">
        <span className="text-white/40 text-sm font-medium">P&L Review · {fyLabel(fyStart)}</span>
        <span className="text-white/50 text-sm tabular-nums">{safeIdx + 1} / {slides.length}</span>
        <button
          onClick={onClose}
          className="text-white/40 hover:text-white text-sm px-3 py-1 rounded-lg hover:bg-white/10 transition-colors"
        >
          Exit ×
        </button>
      </div>

      {/* Slide content */}
      <div className="flex-1 overflow-auto px-10 py-8">
        {slide.kind === 'overview' && (
          <OverviewSlide
            allRevenueRows={allRevenueRows}
            allCostRows={allCostRows}
            months={months}
          />
        )}
        {slide.kind === 'pod' && (
          <PodSlide
            pod={slide.pod}
            revenueRows={slide.revenueRows}
            costRows={slide.costRows}
            months={months}
          />
        )}
        {slide.kind === 'client' && (
          <ClientSlide
            pod={slide.pod}
            row={slide.row}
            months={months}
            onSaveAmount={onSaveManualCellAmount}
            onSaveStatus={onSaveManualCellStatus}
          />
        )}
      </div>

      {/* Navigation bar */}
      <div className="flex items-center justify-between px-10 py-4 border-t border-white/10 shrink-0">
        <button
          onClick={() => onSlideChange(Math.max(currentSlide - 1, 0))}
          disabled={currentSlide === 0}
          className="px-6 py-2 rounded-xl border border-white/20 text-white/60 disabled:opacity-20 hover:bg-white/10 transition-colors text-sm"
        >
          ← Prev
        </button>

        <div className="flex gap-1.5 flex-wrap justify-center max-w-[60vw]">
          {slides.map((_, i) => (
            <button
              key={i}
              onClick={() => onSlideChange(i)}
              className={`w-2 h-2 rounded-full transition-colors ${
                i === safeIdx ? 'bg-white' : 'bg-white/20 hover:bg-white/50'
              }`}
            />
          ))}
        </div>

        <button
          onClick={() => onSlideChange(Math.min(currentSlide + 1, slides.length - 1))}
          disabled={currentSlide === slides.length - 1}
          className="px-6 py-2 rounded-xl border border-white/20 text-white/60 disabled:opacity-20 hover:bg-white/10 transition-colors text-sm"
        >
          Next →
        </button>
      </div>

    </div>
  )
}
