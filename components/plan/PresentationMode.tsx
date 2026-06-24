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

function KpiChip({ label, value, sub, colour = 'white' }: {
  label:   string
  value:   string
  sub?:    string
  colour?: keyof typeof COLOUR
}) {
  return (
    <div className="text-right">
      <p className="text-white/30 text-[10px] font-semibold uppercase tracking-widest mb-1">{label}</p>
      <p className={`font-bold tabular-nums text-2xl ${COLOUR[colour]}`}>{value}</p>
      {sub && <p className="text-white/30 text-xs tabular-nums mt-0.5">{sub}</p>}
    </div>
  )
}

// ─── KeyCell — large editable cell for featured months ────────────────────────

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

  let textCls: string
  let dotCls:  string
  let label:   string

  if (isAging && amount > 0) {
    textCls = 'text-[#FCD34D]'; dotCls = 'bg-[#FCD34D]'; label = 'Aging'
  } else if (status === 'A') {
    textCls = amount === 0 ? 'text-white/20' : 'text-[#4ADE80]'; dotCls = 'bg-[#4ADE80]'; label = 'Actual'
  } else if (status === 'B') {
    textCls = amount === 0 ? 'text-white/20' : 'text-white'; dotCls = 'bg-[#60A5FA]'; label = 'Booked'
  } else {
    textCls = 'text-white/25'; dotCls = 'bg-white/25'; label = 'Forecast'
  }

  if (editing) {
    return (
      <div className="flex items-center justify-center py-5 px-3">
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
          className="w-full text-center text-xl font-bold bg-white/10 border border-[#60A5FA]/50 rounded-lg px-2 py-1 outline-none text-white"
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center justify-center py-4 px-2 group cursor-pointer">
      <span
        onClick={() => { setDraft(amount === 0 ? '' : String(Math.round(amount / 1000))); setEditing(true) }}
        className={`text-3xl font-bold tabular-nums leading-none ${textCls}`}
      >
        {amount === 0 ? '—' : Math.round(amount / 1000).toLocaleString('sv-SE')}
      </span>
      <button
        onClick={() => onSaveStatus?.(cycleStatus(status))}
        className="mt-2 opacity-0 group-hover:opacity-60 transition-opacity flex items-center gap-1"
        title={label}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${dotCls}`} />
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
    <div className="max-w-5xl mx-auto">
      {/* Hero */}
      <div className="relative mb-12">
        {/* Radial glow behind the number */}
        <div className="absolute -top-16 -left-8 w-[480px] h-[320px] bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />

        <p className="relative text-white/30 text-xs font-bold uppercase tracking-widest mb-6">Weekly P&L Review</p>

        <div className="relative flex items-end gap-10 mb-8">
          <div>
            <p className="text-white/40 text-xs uppercase tracking-widest mb-2">Revenue A+B</p>
            <p className="text-[88px] font-bold text-white leading-none tabular-nums tracking-tight">{kFmt(totalRev)}</p>
            <p className="text-white/30 text-lg mt-2">kSEK full year</p>
          </div>
        </div>

        {/* Secondary metrics */}
        <div className="relative flex items-center gap-10">
          <div>
            <p className="text-white/30 text-xs uppercase tracking-widest mb-1">Costs</p>
            <p className="text-4xl font-bold text-white/60 tabular-nums">{kFmt(totalCost)}<span className="text-xl text-white/30 ml-1">k</span></p>
          </div>
          <div className="w-px h-12 bg-white/10" />
          <div>
            <p className="text-white/30 text-xs uppercase tracking-widest mb-1">Gross Margin</p>
            <p className={`text-4xl font-bold tabular-nums ${COLOUR[margin >= 0 ? 'green' : 'red']}`}>{kFmt(margin)}<span className="text-xl text-white/30 ml-1">k</span></p>
          </div>
          <div className="w-px h-12 bg-white/10" />
          <div>
            <p className="text-white/30 text-xs uppercase tracking-widest mb-1">CB1%</p>
            <p className={`text-4xl font-bold tabular-nums ${COLOUR[marginColour(marginPct)]}`}>{marginPct != null ? `${marginPct}%` : '—'}</p>
          </div>
        </div>
      </div>

      {/* Pod breakdown */}
      {activePods.length > 0 && (
        <div className="mb-8">
          <p className="text-white/20 text-[10px] font-bold uppercase tracking-widest mb-4">By pod</p>
          <div className="grid grid-cols-2 gap-2">
            {activePods.map(pod => {
              const rows    = allRevenueRows.filter(r => r.pod_id === pod.id)
              const costs   = allCostRows.filter(r => r.pod_id === pod.id)
              const rev     = months.reduce((s, m) => s + sumByStatus(rows, m, ['A', 'B']), 0)
              const cost    = months.reduce((s, m) => s + sumCells(costs, m), 0)
              const pct     = rev > 0 ? Math.round(((rev - cost) / rev) * 100) : null
              const barW    = totalRev > 0 ? Math.max(4, Math.round((rev / totalRev) * 100)) : 0
              return (
                <div key={pod.id} className="relative overflow-hidden rounded-xl border border-white/[0.07] px-5 py-4">
                  <div className="absolute inset-y-0 left-0 bg-white/[0.04] rounded-xl transition-all" style={{ width: `${barW}%` }} />
                  <div className="relative flex items-center justify-between">
                    <p className="text-white font-semibold">{pod.name}</p>
                    <div className="text-right">
                      <p className="text-white font-bold tabular-nums">{kFmt(rev)} <span className="text-white/30 text-sm">k</span></p>
                      <p className={`text-xs font-semibold tabular-nums ${pct != null ? COLOUR[marginColour(pct)] : 'text-white/30'}`}>
                        {pct != null ? `${pct}% CB1` : '—'}
                      </p>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

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
        <div className="flex items-end gap-8 shrink-0">
          <div className="text-right">
            <p className="text-white/30 text-[10px] uppercase tracking-widest mb-1">Revenue A+B</p>
            <p className="text-3xl font-bold text-white tabular-nums">{kFmt(totalRevAB)} <span className="text-lg text-white/30">k</span></p>
            {totalRevFC > totalRevAB && <p className="text-white/30 text-xs tabular-nums mt-0.5">FC: {kFmt(totalRevFC)} k</p>}
          </div>
          <div className="text-right">
            <p className="text-white/30 text-[10px] uppercase tracking-widest mb-1">CB1%</p>
            <p className={`text-3xl font-bold tabular-nums ${COLOUR[marginColour(marginPct)]}`}>
              {marginPct != null ? `${marginPct}%` : '—'}
            </p>
          </div>
        </div>
      </div>

      {revenueRows.length === 0 ? (
        <p className="text-white/30">No clients in this pod.</p>
      ) : (
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-white/[0.08]">
              <th className="pb-3 text-left min-w-[220px] pr-6" />
              {featuredMonths.map(m => {
                const isCur = m === curMonth
                return (
                  <th key={m} className="pb-3 px-6 text-center min-w-[110px]">
                    {isCur ? (
                      <span className="inline-flex items-center gap-1.5 bg-[#2563EB]/20 border border-[#2563EB]/30 rounded-full px-3 py-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#60A5FA] shrink-0" />
                        <span className="text-[#93C5FD] text-xs font-bold uppercase tracking-wide">{mLabel(m)}</span>
                      </span>
                    ) : (
                      <span className="text-white/30 text-xs font-semibold uppercase tracking-wide">{mLabel(m)}</span>
                    )}
                  </th>
                )
              })}
              <th className="pb-3 px-6 text-right min-w-[90px]">
                <span className="text-white/20 text-[10px] font-bold uppercase tracking-widest">YTD</span>
              </th>
              <th className="pb-3 px-6 text-right min-w-[90px]">
                <span className="text-white/20 text-[10px] font-bold uppercase tracking-widest">Full Year</span>
              </th>
            </tr>
          </thead>

          <tbody>
            {revenueRows.map(row => {
              const ytdRev  = ytdMonths.reduce((s, m) => s + sumByStatus([row], m, ['A', 'B']), 0)
              const fyAB    = months.reduce((s, m) => s + sumByStatus([row], m, ['A', 'B']), 0)
              const fyFC    = months.reduce((s, m) => s + (row.cells[m]?.amount ?? 0), 0)

              return (
                <tr key={row.id} className="border-b border-white/[0.05] hover:bg-white/[0.02] transition-colors">
                  <td className="py-2 pr-6">
                    <p className="text-lg font-semibold text-white leading-tight">{row.client_name ?? '—'}</p>
                    {row.project && <p className="text-xs text-white/30 mt-0.5">{row.project}</p>}
                  </td>
                  {featuredMonths.map(m => {
                    const cell    = row.cells[m] ?? { amount: 0, status: 'F' as PlanStatus }
                    const isAging = m < curMonth && cell.status !== 'A'
                    return (
                      <td key={m} className="px-6 py-0 text-center">
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
                  <td className="px-6 py-2 text-right">
                    <span className="text-base font-semibold text-white/40 tabular-nums">{ytdRev === 0 ? '—' : kFmt(ytdRev)}</span>
                  </td>
                  <td className="px-6 py-2 text-right">
                    <span className="text-base font-semibold text-white/40 tabular-nums">{fyAB === 0 ? '—' : kFmt(fyAB)}</span>
                    {fyFC > fyAB && <span className="block text-xs text-white/20 tabular-nums">({kFmt(fyFC)} FC)</span>}
                  </td>
                </tr>
              )
            })}

            {/* Totals row */}
            <tr className="border-t border-white/10">
              <td className="pt-3 pb-2 pr-6">
                <span className="text-[10px] font-bold text-white/25 uppercase tracking-widest">Total</span>
              </td>
              {featuredMonths.map(m => {
                const totAB = sumByStatus(revenueRows, m, ['A', 'B'])
                const totFC = sumByStatus(revenueRows, m, ['F'])
                const isCur = m === curMonth
                return (
                  <td key={m} className="px-6 pt-3 pb-2 text-center">
                    <span className={`text-lg font-bold tabular-nums ${isCur ? 'text-[#93C5FD]' : 'text-white'}`}>
                      {totAB === 0 ? '—' : kFmt(totAB)}
                    </span>
                    {totFC > 0 && (
                      <span className={`block text-xs tabular-nums ${isCur ? 'text-[#60A5FA]/40' : 'text-white/20'}`}>
                        ({kFmt(totFC)} FC)
                      </span>
                    )}
                  </td>
                )
              })}
              <td className="px-6 pt-3 pb-2 text-right">
                <span className="text-lg font-bold text-white tabular-nums">
                  {kFmt(ytdMonths.reduce((s, m) => s + sumByStatus(revenueRows, m, ['A', 'B']), 0))}
                </span>
              </td>
              <td className="px-6 pt-3 pb-2 text-right">
                {(() => {
                  const fyTotAB = months.reduce((s, m) => s + sumByStatus(revenueRows, m, ['A', 'B']), 0)
                  const fyTotFC = months.reduce((s, m) => s + sumCells(revenueRows, m), 0)
                  return (
                    <>
                      <span className="text-lg font-bold text-white tabular-nums">{kFmt(fyTotAB)}</span>
                      {fyTotFC > fyTotAB && <span className="block text-xs text-white/20 tabular-nums">({kFmt(fyTotFC)} FC)</span>}
                    </>
                  )
                })()}
              </td>
            </tr>

            {/* CB1% row */}
            <tr>
              <td className="pt-1 pb-3 pr-6">
                <span className="text-[10px] font-bold text-white/25 uppercase tracking-widest">CB1%</span>
              </td>
              {featuredMonths.map(m => {
                const rev  = sumByStatus(revenueRows, m, ['A', 'B'])
                const cost = sumCells(costRows, m)
                const pct  = rev > 0 ? Math.round(((rev - cost) / rev) * 100) : null
                const isCur = m === curMonth
                return (
                  <td key={m} className="px-6 pt-1 pb-3 text-center">
                    <span className={`text-sm font-bold tabular-nums ${
                      pct == null ? 'text-white/20'
                      : pct >= 20  ? 'text-[#4ADE80]'
                      : pct >= 0   ? 'text-[#FCD34D]'
                      : 'text-[#F87171]'
                    } ${isCur ? 'opacity-100' : 'opacity-70'}`}>
                      {pct == null ? '—' : `${pct}%`}
                    </span>
                  </td>
                )
              })}
              <td className="px-6 pt-1 pb-3 text-right">
                {(() => {
                  const rev  = ytdMonths.reduce((s, m) => s + sumByStatus(revenueRows, m, ['A', 'B']), 0)
                  const cost = ytdMonths.reduce((s, m) => s + sumCells(costRows, m), 0)
                  const pct  = rev > 0 ? Math.round(((rev - cost) / rev) * 100) : null
                  return (
                    <span className={`text-sm font-bold tabular-nums ${
                      pct == null ? 'text-white/20'
                      : pct >= 20  ? 'text-[#4ADE80]'
                      : pct >= 0   ? 'text-[#FCD34D]'
                      : 'text-[#F87171]'
                    }`}>{pct == null ? '—' : `${pct}%`}</span>
                  )
                })()}
              </td>
              <td className="px-6 pt-1 pb-3 text-right">
                <span className={`text-sm font-bold tabular-nums ${
                  marginPct == null ? 'text-white/20'
                  : marginPct >= 20  ? 'text-[#4ADE80]'
                  : marginPct >= 0   ? 'text-[#FCD34D]'
                  : 'text-[#F87171]'
                }`}>{marginPct == null ? '—' : `${marginPct}%`}</span>
              </td>
            </tr>
          </tbody>
        </table>
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
