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
  green: 'text-[#16A34A]',
  amber: 'text-[#D97706]',
  red:   'text-[#DC2626]',
  dark:  'text-[#111827]',
} as const

function marginColour(pct: number | null): keyof typeof COLOUR {
  if (pct == null) return 'dark'
  if (pct >= 20) return 'green'
  if (pct >= 0)  return 'amber'
  return 'red'
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
    const parsed    = parseFloat(draft.replace(',', '.'))
    const newAmount = isNaN(parsed) ? 0 : Math.round(parsed * 1000)
    if (newAmount !== amount) await onSaveAmount(newAmount)
  }

  let textCls: string
  let dotCls:  string
  let label:   string

  if (isAging && amount > 0) {
    textCls = 'text-[#D97706]'; dotCls = 'bg-[#D97706]'; label = 'Aging'
  } else if (status === 'A') {
    textCls = amount === 0 ? 'text-[#D1D5DB]' : 'text-[#16A34A]'; dotCls = 'bg-[#16A34A]'; label = 'Actual'
  } else if (status === 'B') {
    textCls = amount === 0 ? 'text-[#D1D5DB]' : 'text-[#111827]'; dotCls = 'bg-[#2563EB]'; label = 'Booked'
  } else {
    textCls = 'text-[#D1D5DB]'; dotCls = 'bg-[#D1D5DB]'; label = 'Forecast'
  }

  if (editing) {
    return (
      <div className="flex items-center justify-center py-4 px-3">
        <input
          ref={inputRef}
          type="text"
          inputMode="decimal"
          value={draft}
          onChange={e => setDraft(e.target.value.replace(/[^0-9.,]/g, ''))}
          onBlur={commit}
          onKeyDown={e => {
            if (e.key === 'Enter')  { e.preventDefault(); commit() }
            if (e.key === 'Escape') setEditing(false)
          }}
          className="w-full text-center text-xl font-bold bg-[#EFF6FF] border border-[#2563EB]/40 rounded-lg px-2 py-1 outline-none text-[#111827]"
        />
      </div>
    )
  }

  const badgeCls =
    isAging && amount > 0 ? 'bg-[#FEF3C7] text-[#B45309] border-[#FDE68A]'
    : status === 'A'      ? 'bg-[#F0FDF4] text-[#16A34A] border-[#BBF7D0]'
    : status === 'B'      ? 'bg-[#EFF6FF] text-[#2563EB] border-[#BFDBFE]'
    :                       'bg-[#F3F4F6] text-[#9CA3AF] border-[#E5E7EB]'

  return (
    <div className="flex flex-col items-center justify-center py-4 px-2 gap-2">
      <span
        onClick={() => { setDraft(amount === 0 ? '' : String(Math.round(amount / 1000))); setEditing(true) }}
        className={`text-3xl font-bold tabular-nums leading-none cursor-text ${textCls}`}
      >
        {amount === 0 ? '—' : Math.round(amount / 1000).toLocaleString('sv-SE')}
      </span>
      {onSaveStatus && (
        <button
          onClick={e => { e.stopPropagation(); onSaveStatus(cycleStatus(status)) }}
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-bold uppercase tracking-wide transition-opacity hover:opacity-75 ${badgeCls}`}
          title={`Click to cycle status (${label})`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${dotCls}`} />
          {isAging && amount > 0 ? 'Aging' : status}
        </button>
      )}
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
      <div className="relative mb-10">
        <div className="absolute -top-8 -left-8 w-[480px] h-[240px] bg-blue-400/6 rounded-full blur-3xl pointer-events-none" />

        <p className="relative text-[#9CA3AF] text-xs font-bold uppercase tracking-widest mb-6">Weekly P&L Review</p>

        <div className="relative mb-8">
          <p className="text-[#6B7280] text-xs uppercase tracking-widest mb-2">Revenue A+B</p>
          <p className="text-[88px] font-bold text-[#0F0F0F] leading-none tabular-nums tracking-tight">{kFmt(totalRev)}</p>
          <p className="text-[#9CA3AF] text-lg mt-2">kSEK full year</p>
        </div>

        <div className="relative flex items-center gap-10">
          <div>
            <p className="text-[#9CA3AF] text-xs uppercase tracking-widest mb-1">Costs</p>
            <p className="text-4xl font-bold text-[#374151] tabular-nums">{kFmt(totalCost)}<span className="text-xl text-[#9CA3AF] ml-1">k</span></p>
          </div>
          <div className="w-px h-10 bg-[#E5E7EB]" />
          <div>
            <p className="text-[#9CA3AF] text-xs uppercase tracking-widest mb-1">Gross Margin</p>
            <p className={`text-4xl font-bold tabular-nums ${COLOUR[margin >= 0 ? 'green' : 'red']}`}>{kFmt(margin)}<span className="text-xl text-[#9CA3AF] ml-1">k</span></p>
          </div>
          <div className="w-px h-10 bg-[#E5E7EB]" />
          <div>
            <p className="text-[#9CA3AF] text-xs uppercase tracking-widest mb-1">CB1%</p>
            <p className={`text-4xl font-bold tabular-nums ${COLOUR[marginColour(marginPct)]}`}>{marginPct != null ? `${marginPct}%` : '—'}</p>
          </div>
        </div>
      </div>

      {/* Pod breakdown */}
      {activePods.length > 0 && (
        <div className="mb-8">
          <p className="text-[#9CA3AF] text-[10px] font-bold uppercase tracking-widest mb-3">By pod</p>
          <div className="grid grid-cols-2 gap-2">
            {activePods.map(pod => {
              const rows  = allRevenueRows.filter(r => r.pod_id === pod.id)
              const costs = allCostRows.filter(r => r.pod_id === pod.id)
              const rev   = months.reduce((s, m) => s + sumByStatus(rows, m, ['A', 'B']), 0)
              const cost  = months.reduce((s, m) => s + sumCells(costs, m), 0)
              const pct   = rev > 0 ? Math.round(((rev - cost) / rev) * 100) : null
              const barW  = totalRev > 0 ? Math.max(4, Math.round((rev / totalRev) * 100)) : 0
              return (
                <div key={pod.id} className="relative overflow-hidden rounded-xl border border-[#E5E7EB] bg-white px-5 py-4">
                  <div className="absolute inset-y-0 left-0 bg-[#EFF6FF] rounded-xl" style={{ width: `${barW}%` }} />
                  <div className="relative flex items-center justify-between">
                    <p className="text-[#111827] font-semibold">{pod.name}</p>
                    <div className="text-right">
                      <p className="text-[#111827] font-bold tabular-nums">{kFmt(rev)} <span className="text-[#9CA3AF] text-sm">k</span></p>
                      <p className={`text-xs font-semibold tabular-nums ${pct != null ? COLOUR[marginColour(pct)] : 'text-[#9CA3AF]'}`}>
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
          <p className="text-[#9CA3AF] text-xs font-semibold uppercase tracking-widest mb-1">Pod</p>
          <h1 className="text-4xl font-bold text-[#0F0F0F]">{pod.name}</h1>
          <p className="text-[#6B7280] text-sm mt-1">
            {revenueRows.length} client{revenueRows.length !== 1 ? 's' : ''}
            {' · '}
            Showing {featuredMonths.map(m => monthLabel(m)).join(' · ')}
          </p>
        </div>
        <div className="flex items-start gap-8 shrink-0">
          <div className="text-right">
            <p className="text-[#9CA3AF] text-[10px] uppercase tracking-widest mb-1">Revenue A+B</p>
            <p className="text-3xl font-bold text-[#0F0F0F] tabular-nums">{kFmt(totalRevAB)} <span className="text-lg text-[#9CA3AF]">k</span></p>
            {totalRevFC > totalRevAB && <p className="text-[#9CA3AF] text-xs tabular-nums mt-0.5">FC: {kFmt(totalRevFC)} k</p>}
          </div>
          <div className="text-right">
            <p className="text-[#9CA3AF] text-[10px] uppercase tracking-widest mb-1">CB1%</p>
            <p className={`text-3xl font-bold tabular-nums ${COLOUR[marginColour(marginPct)]}`}>
              {marginPct != null ? `${marginPct}%` : '—'}
            </p>
          </div>
        </div>
      </div>

      {revenueRows.length === 0 ? (
        <p className="text-[#9CA3AF]">No clients in this pod.</p>
      ) : (
        <div className="bg-white rounded-2xl border border-[#E5E7EB] shadow-sm overflow-hidden">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-[#E5E7EB]">
                <th className="bg-[#F9FAFB] px-5 py-3 text-left min-w-[220px]">
                  <span className="text-[10px] font-bold text-[#9CA3AF] uppercase tracking-wider">Client</span>
                </th>
                {featuredMonths.map(m => {
                  const isCur = m === curMonth
                  return (
                    <th key={m} className={`py-3 px-6 text-center min-w-[110px] ${isCur ? 'bg-[#EFF6FF]' : 'bg-[#F9FAFB]'}`}>
                      {isCur ? (
                        <span className="inline-flex items-center gap-1.5 bg-[#2563EB]/10 border border-[#2563EB]/20 rounded-full px-3 py-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#2563EB] shrink-0" />
                          <span className="text-[#1D4ED8] text-xs font-bold uppercase tracking-wide">{mLabel(m)}</span>
                        </span>
                      ) : (
                        <span className="text-[#9CA3AF] text-xs font-semibold uppercase tracking-wide">{mLabel(m)}</span>
                      )}
                    </th>
                  )
                })}
                <th className="bg-[#F9FAFB] px-6 py-3 text-right min-w-[90px]">
                  <span className="text-[#9CA3AF] text-[10px] font-bold uppercase tracking-widest">YTD</span>
                </th>
                <th className="bg-[#F9FAFB] px-6 py-3 text-right min-w-[90px]">
                  <span className="text-[#9CA3AF] text-[10px] font-bold uppercase tracking-widest">Full Year</span>
                </th>
              </tr>
            </thead>

            <tbody>
              {revenueRows.map(row => {
                const ytdRev = ytdMonths.reduce((s, m) => s + sumByStatus([row], m, ['A', 'B']), 0)
                const fyAB   = months.reduce((s, m) => s + sumByStatus([row], m, ['A', 'B']), 0)
                const fyFC   = months.reduce((s, m) => s + (row.cells[m]?.amount ?? 0), 0)

                return (
                  <tr key={row.id} className="border-b border-[#F3F4F6] hover:bg-[#FAFAFA] transition-colors">
                    <td className="px-5 py-2">
                      <p className="text-lg font-semibold text-[#0F0F0F] leading-tight">{row.client_name ?? '—'}</p>
                      {row.project && <p className="text-xs text-[#9CA3AF] mt-0.5">{row.project}</p>}
                    </td>
                    {featuredMonths.map(m => {
                      const cell    = row.cells[m] ?? { amount: 0, status: 'F' as PlanStatus }
                      const isAging = m < curMonth && cell.status !== 'A'
                      return (
                        <td key={m} className={`px-6 py-0 text-center ${m === curMonth ? 'bg-[#F0F7FF]' : ''}`}>
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
                      <span className="text-base font-semibold text-[#9CA3AF] tabular-nums">{ytdRev === 0 ? '—' : kFmt(ytdRev)}</span>
                    </td>
                    <td className="px-6 py-2 text-right">
                      <span className="text-base font-semibold text-[#9CA3AF] tabular-nums">{fyAB === 0 ? '—' : kFmt(fyAB)}</span>
                      {fyFC > fyAB && <span className="block text-xs text-[#D1D5DB] tabular-nums">({kFmt(fyFC)} FC)</span>}
                    </td>
                  </tr>
                )
              })}

              {/* Totals row */}
              <tr className="border-t border-[#E5E7EB] bg-[#F9FAFB]">
                <td className="px-5 pt-3 pb-2">
                  <span className="text-[10px] font-bold text-[#9CA3AF] uppercase tracking-widest">Total</span>
                </td>
                {featuredMonths.map(m => {
                  const totAB = sumByStatus(revenueRows, m, ['A', 'B'])
                  const totFC = sumByStatus(revenueRows, m, ['F'])
                  const isCur = m === curMonth
                  return (
                    <td key={m} className={`px-6 pt-3 pb-2 text-center ${isCur ? 'bg-[#EFF6FF]' : ''}`}>
                      <span className={`text-lg font-bold tabular-nums ${isCur ? 'text-[#1D4ED8]' : 'text-[#111827]'}`}>
                        {totAB === 0 ? '—' : kFmt(totAB)}
                      </span>
                      {totFC > 0 && (
                        <span className={`block text-xs tabular-nums ${isCur ? 'text-[#93C5FD]' : 'text-[#D1D5DB]'}`}>
                          ({kFmt(totFC)} FC)
                        </span>
                      )}
                    </td>
                  )
                })}
                <td className="px-6 pt-3 pb-2 text-right">
                  <span className="text-lg font-bold text-[#111827] tabular-nums">
                    {kFmt(ytdMonths.reduce((s, m) => s + sumByStatus(revenueRows, m, ['A', 'B']), 0))}
                  </span>
                </td>
                <td className="px-6 pt-3 pb-2 text-right">
                  {(() => {
                    const fyTotAB = months.reduce((s, m) => s + sumByStatus(revenueRows, m, ['A', 'B']), 0)
                    const fyTotFC = months.reduce((s, m) => s + sumCells(revenueRows, m), 0)
                    return (
                      <>
                        <span className="text-lg font-bold text-[#111827] tabular-nums">{kFmt(fyTotAB)}</span>
                        {fyTotFC > fyTotAB && <span className="block text-xs text-[#D1D5DB] tabular-nums">({kFmt(fyTotFC)} FC)</span>}
                      </>
                    )
                  })()}
                </td>
              </tr>

              {/* CB1% row */}
              <tr className="bg-[#F9FAFB]">
                <td className="px-5 pt-1 pb-3">
                  <span className="text-[10px] font-bold text-[#9CA3AF] uppercase tracking-widest">CB1%</span>
                </td>
                {featuredMonths.map(m => {
                  const rev   = sumByStatus(revenueRows, m, ['A', 'B'])
                  const cost  = sumCells(costRows, m)
                  const pct   = rev > 0 ? Math.round(((rev - cost) / rev) * 100) : null
                  const isCur = m === curMonth
                  return (
                    <td key={m} className={`px-6 pt-1 pb-3 text-center ${isCur ? 'bg-[#EFF6FF]' : ''}`}>
                      <span className={`text-sm font-bold tabular-nums ${
                        pct == null ? 'text-[#D1D5DB]'
                        : pct >= 20  ? 'text-[#16A34A]'
                        : pct >= 0   ? 'text-[#D97706]'
                        : 'text-[#DC2626]'
                      }`}>
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
                        pct == null ? 'text-[#D1D5DB]'
                        : pct >= 20  ? 'text-[#16A34A]'
                        : pct >= 0   ? 'text-[#D97706]'
                        : 'text-[#DC2626]'
                      }`}>{pct == null ? '—' : `${pct}%`}</span>
                    )
                  })()}
                </td>
                <td className="px-6 pt-1 pb-3 text-right">
                  <span className={`text-sm font-bold tabular-nums ${
                    marginPct == null ? 'text-[#D1D5DB]'
                    : marginPct >= 20  ? 'text-[#16A34A]'
                    : marginPct >= 0   ? 'text-[#D97706]'
                    : 'text-[#DC2626]'
                  }`}>{marginPct == null ? '—' : `${marginPct}%`}</span>
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
    <div className="fixed inset-0 z-50 bg-[#F3F4F6] flex flex-col">

      {/* Top bar */}
      <div className="flex items-center justify-between px-8 py-3 border-b border-[#E5E7EB] bg-white shrink-0">
        <span className="text-[#9CA3AF] text-sm font-medium">P&L Review · {fyLabel(fyStart)}</span>
        <span className="text-[#6B7280] text-sm tabular-nums">{safeIdx + 1} / {slides.length}</span>
        <button
          onClick={onClose}
          className="text-[#9CA3AF] hover:text-[#374151] text-sm px-3 py-1 rounded-lg hover:bg-[#F3F4F6] transition-colors"
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
      <div className="flex items-center justify-between px-12 py-4 border-t border-[#E5E7EB] bg-white shrink-0">
        <button
          onClick={() => onSlideChange(Math.max(currentSlide - 1, 0))}
          disabled={currentSlide === 0}
          className="px-6 py-2 rounded-xl border border-[#E5E7EB] text-[#6B7280] disabled:opacity-30 hover:bg-[#F3F4F6] transition-colors text-sm"
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
                  ? 'bg-[#111827] text-white'
                  : 'text-[#6B7280] hover:text-[#374151] hover:bg-[#F3F4F6]'
              }`}
            >
              {s.kind === 'overview' ? 'Overview' : s.pod.name}
            </button>
          ))}
        </div>

        <button
          onClick={() => onSlideChange(Math.min(currentSlide + 1, slides.length - 1))}
          disabled={currentSlide === slides.length - 1}
          className="px-6 py-2 rounded-xl border border-[#E5E7EB] text-[#6B7280] disabled:opacity-30 hover:bg-[#F3F4F6] transition-colors text-sm"
        >
          Next →
        </button>
      </div>

    </div>
  )
}
