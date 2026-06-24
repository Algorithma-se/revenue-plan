'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { Pod, RevenueRow, CostRow, PlanStatus } from '@/types/database'
import { sumByStatus, sumCells, monthLabel, fyLabel, cycleStatus } from '@/lib/plan-utils'
import { AISummary } from '@/components/plan/AISummary'

type Slide =
  | { kind: 'overview' }
  | { kind: 'pod'; pod: Pod; revenueRows: RevenueRow[]; costRows: CostRow[] }

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function kFmt(v: number) {
  return Math.round(v / 1000).toLocaleString('sv-SE')
}

const COLOUR = {
  green: 'text-[#4ADE80]',
  amber: 'text-[#FCD34D]',
  red:   'text-[#F87171]',
  white: 'text-white',
} as const

function marginColour(pct: number | null): keyof typeof COLOUR {
  if (pct == null) return 'white'
  if (pct >= 20) return 'green'
  if (pct >= 0)  return 'amber'
  return 'red'
}

function KpiChip({ label, value, sub, colour = 'white', big }: {
  label:   string
  value:   string
  sub?:    string
  colour?: keyof typeof COLOUR
  big?:    boolean
}) {
  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl px-5 py-4 text-right">
      <p className="text-white/40 text-[10px] font-semibold uppercase tracking-wider mb-1.5">{label}</p>
      <p className={`font-bold tabular-nums ${big ? 'text-3xl' : 'text-xl'} ${COLOUR[colour]}`}>{value}</p>
      {sub && <p className="text-white/30 text-xs tabular-nums mt-0.5">{sub}</p>}
    </div>
  )
}

// ─── KeyCell — large editable cell for featured months ────────────────────────

const STATUS_STYLES: Record<PlanStatus, { bg: string; dot: string; label: string }> = {
  A: { bg: 'bg-[#DCFCE7]', dot: 'bg-[#16A34A]', label: 'Actual'   },
  B: { bg: 'bg-[#DBEAFE]', dot: 'bg-[#2563EB]', label: 'Booked'   },
  F: { bg: '',             dot: 'bg-[#9CA3AF]', label: 'Forecast'  },
}

function KeyCell({ amount, status, isAging, isCurrent, onSaveAmount, onSaveStatus }: {
  amount:        number
  status:        PlanStatus
  isAging?:      boolean
  isCurrent?:    boolean
  onSaveAmount?: (v: number) => Promise<void>
  onSaveStatus?: (s: PlanStatus) => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft]     = useState('')
  const inputRef              = useRef<HTMLInputElement>(null)

  useEffect(() => { if (editing) inputRef.current?.select() }, [editing])

  async function commit() {
    setEditing(false)
    if (!onSaveAmount) return
    const parsed    = parseFloat(draft)
    const newAmount = isNaN(parsed) ? 0 : Math.round(parsed * 1000)
    if (newAmount !== amount) await onSaveAmount(newAmount)
  }

  const st    = isAging && amount > 0 ? 'A' : status  // show aging as green so bg makes sense
  const style = isAging && amount > 0
    ? { bg: 'bg-[#FFFBEB]', dot: 'bg-[#D97706]', label: 'Aging' }
    : STATUS_STYLES[st]

  const ring = isCurrent ? 'ring-2 ring-inset ring-[#2563EB]/30' : ''

  if (editing) {
    return (
      <div className={`${style.bg} ${ring} flex items-center justify-center min-h-[72px] px-3`}>
        <input
          ref={inputRef}
          type="number"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={e => {
            if (e.key === 'Enter')  { e.preventDefault(); commit() }
            if (e.key === 'Escape') setEditing(false)
          }}
          className="w-full text-center text-xl font-bold bg-white/60 border border-[#61b5cc] rounded-lg px-2 py-1 outline-none"
        />
      </div>
    )
  }

  return (
    <div className={`${style.bg} ${ring} flex flex-col items-center justify-center min-h-[72px] px-2 py-2 group cursor-pointer transition-all hover:brightness-95`}>
      <span
        onClick={() => { setDraft(amount === 0 ? '' : String(Math.round(amount / 1000))); setEditing(true) }}
        className={`text-2xl font-bold tabular-nums leading-none ${
          amount === 0 ? 'text-[#9CA3AF]' : isAging ? 'text-[#B45309]' : 'text-[#0F0F0F]'
        }`}
      >
        {amount === 0 ? '—' : Math.round(amount / 1000).toLocaleString('sv-SE')}
      </span>
      <button
        onClick={() => onSaveStatus?.(cycleStatus(status))}
        className={`mt-1.5 flex items-center gap-1 opacity-60 group-hover:opacity-100 transition-opacity`}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
        <span className="text-[10px] font-semibold uppercase tracking-wide text-[#374151]">{style.label}</span>
      </button>
    </div>
  )
}

// ─── Slide: Overview ──────────────────────────────────────────────────────────

function OverviewSlide({ allRevenueRows, allCostRows, months, pods }: {
  allRevenueRows: RevenueRow[]
  allCostRows:    CostRow[]
  months:         readonly string[]
  pods:           Pod[]
}) {
  const totalRev  = months.reduce((s, m) => s + sumByStatus(allRevenueRows, m, ['A', 'B']), 0)
  const totalCost = months.reduce((s, m) => s + sumCells(allCostRows, m), 0)
  const margin    = totalRev - totalCost
  const marginPct = totalRev > 0 ? Math.round((margin / totalRev) * 100) : null

  const activePods = pods.filter(pod => allRevenueRows.some(r => r.pod_id === pod.id))

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-5xl font-bold text-white mb-1">Weekly P&L Review</h1>
      <p className="text-white/40 mb-8 text-base">Full fiscal year overview</p>

      <div className="grid grid-cols-4 gap-4 mb-8">
        <KpiChip big label="Revenue (A+B)" value={`${kFmt(totalRev)} kSEK`} />
        <KpiChip big label="Costs" value={`${kFmt(totalCost)} kSEK`} />
        <KpiChip big label="Gross margin" value={`${kFmt(margin)} kSEK`} colour={margin >= 0 ? 'green' : 'red'} />
        <KpiChip big label="Margin %" value={marginPct != null ? `${marginPct}%` : '—'} colour={marginColour(marginPct)} />
      </div>

      {/* Per-pod summary */}
      <div className="grid gap-3 mb-8" style={{ gridTemplateColumns: `repeat(${Math.min(activePods.length, 4)}, 1fr)` }}>
        {activePods.map(pod => {
          const rows    = allRevenueRows.filter(r => r.pod_id === pod.id)
          const costs   = allCostRows.filter(r => r.pod_id === pod.id)
          const rev     = months.reduce((s, m) => s + sumByStatus(rows, m, ['A', 'B']), 0)
          const cost    = months.reduce((s, m) => s + sumCells(costs, m), 0)
          const pct     = rev > 0 ? Math.round(((rev - cost) / rev) * 100) : null
          return (
            <div key={pod.id} className="bg-white/5 border border-white/10 rounded-xl px-4 py-3">
              <p className="text-white/50 text-xs font-semibold uppercase tracking-wider mb-2">{pod.name}</p>
              <p className="text-white font-bold text-lg tabular-nums">{kFmt(rev)} <span className="text-white/40 text-sm">k</span></p>
              <p className={`text-sm font-semibold mt-0.5 ${pct != null ? COLOUR[marginColour(pct)] : 'text-white/40'}`}>
                {pct != null ? `${pct}% margin` : '—'}
              </p>
            </div>
          )
        })}
      </div>

      <AISummary allRevenueRows={allRevenueRows} allCostRows={allCostRows} months={months} />
    </div>
  )
}

// ─── Slide: Pod ───────────────────────────────────────────────────────────────

function PodSlide({ pod, revenueRows, costRows, months, onSaveAmount, onSaveStatus }: {
  pod:          Pod
  revenueRows:  RevenueRow[]
  costRows:     CostRow[]
  months:       readonly string[]
  onSaveAmount: (itemId: string, month: string, status: PlanStatus, amount: number) => Promise<void>
  onSaveStatus: (itemId: string, month: string, amount: number, status: PlanStatus) => Promise<void>
}) {
  const today    = new Date()
  const curMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`
  const curIdx   = months.indexOf(curMonth)

  // The 4 featured months: prev, current, next 2 — clamped to the fiscal year
  const featuredMonths = [-1, 0, 1, 2]
    .map(offset => curIdx + offset)
    .filter(i => i >= 0 && i < months.length)
    .map(i => months[i])

  const ytdMonths = months.filter(m => m <= curMonth)

  const totalRevAB = months.reduce((s, m) => s + sumByStatus(revenueRows, m, ['A', 'B']), 0)
  const totalRevFC = months.reduce((s, m) => s + sumByStatus(revenueRows, m, ['A', 'B', 'F']), 0)
  const totalCost  = months.reduce((s, m) => s + sumCells(costRows, m), 0)
  const margin     = totalRevAB - totalCost
  const marginPct  = totalRevAB > 0 ? Math.round((margin / totalRevAB) * 100) : null

  const MONTH_FMT = new Intl.DateTimeFormat('en-SE', { month: 'short', year: '2-digit' })
  function mLabel(iso: string) {
    return MONTH_FMT.format(new Date(iso + 'T12:00:00'))
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <p className="text-white/40 text-xs font-semibold uppercase tracking-widest mb-1">Pod</p>
          <h1 className="text-4xl font-bold text-white">{pod.name}</h1>
          <p className="text-white/40 text-sm mt-1">
            {revenueRows.length} client{revenueRows.length !== 1 ? 's' : ''}
            {' · '}
            Showing {featuredMonths.map(m => monthLabel(m)).join(' · ')}
          </p>
        </div>
        <div className="flex gap-3 shrink-0">
          <KpiChip
            label="Revenue A+B"
            value={`${kFmt(totalRevAB)} k`}
            sub={totalRevFC > totalRevAB ? `(FC: ${kFmt(totalRevFC)} k)` : undefined}
          />
          <KpiChip label="Costs" value={`${kFmt(totalCost)} k`} />
          <KpiChip label="CB1%" value={marginPct != null ? `${marginPct}%` : '—'} colour={marginColour(marginPct)} />
        </div>
      </div>

      {revenueRows.length === 0 ? (
        <p className="text-white/30">No clients in this pod.</p>
      ) : (
        <div className="bg-white rounded-2xl overflow-hidden shadow-2xl">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                {/* Client col */}
                <th className="bg-[#F9F9F8] px-5 py-3 text-left border-b border-r border-[#E5E7EB] min-w-[200px]">
                  <span className="text-[10px] font-bold text-[#9CA3AF] uppercase tracking-wider">Client</span>
                </th>
                {/* Featured month headers */}
                {featuredMonths.map(m => {
                  const isCur = m === curMonth
                  return (
                    <th
                      key={m}
                      className={`py-3 px-2 text-center border-b border-r border-[#E5E7EB] min-w-[120px] ${
                        isCur ? 'bg-[#EFF6FF]' : 'bg-[#F9F9F8]'
                      }`}
                    >
                      <div className="flex flex-col items-center gap-0.5">
                        {isCur && <span className="w-1.5 h-1.5 rounded-full bg-[#2563EB] mb-0.5" />}
                        <span className={`text-xs font-bold uppercase tracking-wider ${isCur ? 'text-[#1D4ED8]' : 'text-[#6B7280]'}`}>
                          {mLabel(m)}
                        </span>
                      </div>
                    </th>
                  )
                })}
                {/* YTD col */}
                <th className="bg-[#F9F9F8] px-4 py-3 text-right border-b border-r border-[#E5E7EB] min-w-[96px]">
                  <span className="text-[10px] font-bold text-[#9CA3AF] uppercase tracking-wider">YTD A+B</span>
                </th>
                {/* FY total col */}
                <th className="bg-[#F9F9F8] px-4 py-3 text-right border-b border-[#E5E7EB] min-w-[96px]">
                  <span className="text-[10px] font-bold text-[#9CA3AF] uppercase tracking-wider">FY Total</span>
                </th>
              </tr>
            </thead>

            <tbody>
              {revenueRows.map((row, ri) => {
                const ytdRev  = ytdMonths.reduce((s, m) => s + sumByStatus([row], m, ['A', 'B']), 0)
                const fyAB    = months.reduce((s, m) => s + sumByStatus([row], m, ['A', 'B']), 0)
                const fyFC    = months.reduce((s, m) => s + (row.cells[m]?.amount ?? 0), 0)
                const isEven  = ri % 2 === 0

                return (
                  <tr key={row.id}>
                    {/* Client name */}
                    <td className={`px-5 py-3 border-b border-r border-[#E5E7EB] ${isEven ? 'bg-white' : 'bg-[#FAFAFA]'}`}>
                      <p className="text-base font-semibold text-[#0F0F0F] leading-tight">{row.client_name ?? '—'}</p>
                      {row.project && <p className="text-xs text-[#9CA3AF] mt-0.5">{row.project}</p>}
                    </td>
                    {/* Featured month cells */}
                    {featuredMonths.map(m => {
                      const cell    = row.cells[m] ?? { amount: 0, status: 'F' as PlanStatus }
                      const isAging = m < curMonth && cell.status !== 'A'
                      return (
                        <td key={m} className="border-b border-r border-[#E5E7EB] p-0">
                          <KeyCell
                            amount={cell.amount}
                            status={cell.status}
                            isAging={isAging}
                            isCurrent={m === curMonth}
                            onSaveAmount={v => onSaveAmount(row.id, m, cell.status, v)}
                            onSaveStatus={s => onSaveStatus(row.id, m, cell.amount, s)}
                          />
                        </td>
                      )
                    })}
                    {/* YTD */}
                    <td className={`px-4 py-3 text-right border-b border-r border-[#E5E7EB] ${isEven ? 'bg-white' : 'bg-[#FAFAFA]'}`}>
                      <span className="text-base font-semibold text-[#374151] tabular-nums">
                        {ytdRev === 0 ? '—' : kFmt(ytdRev)}
                      </span>
                    </td>
                    {/* FY total */}
                    <td className={`px-4 py-3 text-right border-b border-[#E5E7EB] ${isEven ? 'bg-white' : 'bg-[#FAFAFA]'}`}>
                      <span className="text-base font-semibold text-[#374151] tabular-nums">
                        {fyAB === 0 ? '—' : kFmt(fyAB)}
                      </span>
                      {fyFC > fyAB && (
                        <span className="block text-xs text-[#9CA3AF] tabular-nums">({kFmt(fyFC)} FC)</span>
                      )}
                    </td>
                  </tr>
                )
              })}

              {/* Totals row */}
              <tr>
                <td className="px-5 py-3 border-t-2 border-[#E5E7EB] bg-[#F9F9F8] border-r border-b-0">
                  <span className="text-[10px] font-bold text-[#9CA3AF] uppercase tracking-wider">Total</span>
                </td>
                {featuredMonths.map(m => {
                  const totAB = sumByStatus(revenueRows, m, ['A', 'B'])
                  const totFC = sumByStatus(revenueRows, m, ['F'])
                  const isCur = m === curMonth
                  return (
                    <td key={m} className={`border-t-2 border-r border-[#E5E7EB] border-b-0 px-2 py-3 text-center ${isCur ? 'bg-[#EFF6FF]' : 'bg-[#F9F9F8]'}`}>
                      <span className={`text-base font-bold tabular-nums ${isCur ? 'text-[#1D4ED8]' : 'text-[#374151]'}`}>
                        {totAB === 0 ? '—' : kFmt(totAB)}
                      </span>
                      {totFC > 0 && (
                        <span className={`block text-xs tabular-nums ${isCur ? 'text-[#93C5FD]' : 'text-[#9CA3AF]'}`}>
                          ({kFmt(totFC)} FC)
                        </span>
                      )}
                    </td>
                  )
                })}
                <td className="border-t-2 border-r border-[#E5E7EB] border-b-0 bg-[#F9F9F8] px-4 py-3 text-right">
                  <span className="text-base font-bold text-[#374151] tabular-nums">
                    {kFmt(ytdMonths.reduce((s, m) => s + sumByStatus(revenueRows, m, ['A', 'B']), 0))}
                  </span>
                </td>
                <td className="border-t-2 border-[#E5E7EB] border-b-0 bg-[#F9F9F8] px-4 py-3 text-right">
                  {(() => {
                    const fyTotAB = months.reduce((s, m) => s + sumByStatus(revenueRows, m, ['A', 'B']), 0)
                    const fyTotFC = months.reduce((s, m) => s + sumCells(revenueRows, m), 0)
                    return (
                      <>
                        <span className="text-base font-bold text-[#374151] tabular-nums">{kFmt(fyTotAB)}</span>
                        {fyTotFC > fyTotAB && (
                          <span className="block text-xs text-[#9CA3AF] tabular-nums">({kFmt(fyTotFC)} FC)</span>
                        )}
                      </>
                    )
                  })()}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
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
    <div className="fixed inset-0 z-50 bg-[#111827] flex flex-col">

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
      <div className="flex-1 overflow-auto px-12 py-8">
        {slide.kind === 'overview' && (
          <OverviewSlide
            allRevenueRows={allRevenueRows}
            allCostRows={allCostRows}
            months={months}
            pods={pods}
          />
        )}
        {slide.kind === 'pod' && (
          <PodSlide
            pod={slide.pod}
            revenueRows={slide.revenueRows}
            costRows={slide.costRows}
            months={months}
            onSaveAmount={onSaveManualCellAmount}
            onSaveStatus={onSaveManualCellStatus}
          />
        )}
      </div>

      {/* Navigation bar */}
      <div className="flex items-center justify-between px-12 py-4 border-t border-white/10 shrink-0">
        <button
          onClick={() => onSlideChange(Math.max(currentSlide - 1, 0))}
          disabled={currentSlide === 0}
          className="px-6 py-2 rounded-xl border border-white/20 text-white/60 disabled:opacity-20 hover:bg-white/10 transition-colors text-sm"
        >
          ← Prev
        </button>

        <div className="flex gap-2">
          {slides.map((s, i) => (
            <button
              key={i}
              onClick={() => onSlideChange(i)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                i === safeIdx
                  ? 'bg-white text-[#111827]'
                  : 'text-white/40 hover:text-white/80 hover:bg-white/10'
              }`}
            >
              {s.kind === 'overview' ? 'Overview' : s.pod.name}
            </button>
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
