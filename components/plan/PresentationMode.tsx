'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { Pod, RevenueRow, CostRow, PlanStatus } from '@/types/database'
import { sumByStatus, sumCells, monthLabel, fyLabel } from '@/lib/plan-utils'
import { StatusBadge } from '@/components/plan/StatusBadge'
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
  return `${Math.round(v / 1000).toLocaleString('sv-SE')} kSEK`
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

function KpiCard({ label, value, colour = 'white' }: {
  label:   string
  value:   string
  colour?: keyof typeof COLOUR
}) {
  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl px-5 py-4">
      <p className="text-white/40 text-xs font-semibold uppercase tracking-wider mb-2">{label}</p>
      <p className={`text-2xl font-bold tabular-nums ${COLOUR[colour]}`}>{value}</p>
    </div>
  )
}

// ─── PresCell — editable cell with featured (larger) variant ──────────────────

function PresCell({ amount, status, featured, isAging, onSaveAmount, onSaveStatus }: {
  amount:        number
  status:        PlanStatus
  featured?:     boolean
  isAging?:      boolean
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

  const STATUS_BG: Record<string, string> = { A: 'bg-[#F0FDF4]', B: 'bg-[#EFF6FF]', F: '' }
  const cellBg = isAging && amount > 0 && !editing
    ? 'bg-[#FFFBEB]'
    : amount > 0 && !editing ? (STATUS_BG[status] ?? '') : ''

  const heightCls = featured ? 'min-h-[48px]' : 'min-h-[36px]'
  const amtCls    = featured
    ? `text-right leading-none min-w-[44px] text-sm font-bold ${amount === 0 ? 'text-[#D1D5DB]' : isAging ? 'text-[#B45309]' : 'text-[#0F0F0F]'}`
    : `text-right leading-none min-w-[36px] text-xs font-medium ${amount === 0 ? 'text-[#D1D5DB]' : isAging ? 'text-[#B45309]' : 'text-[#0F0F0F]'}`

  if (editing) {
    return (
      <div className={`flex items-center px-1 py-1 ${heightCls}`}>
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
          className="w-full text-right text-xs bg-[#EFF6FF] border border-[#61b5cc] rounded px-1 py-0.5 outline-none"
        />
      </div>
    )
  }

  return (
    <div className={`flex items-center justify-end gap-1 px-1 py-1 ${heightCls} ${cellBg} transition-colors`}>
      <StatusBadge status={status} onCycle={onSaveStatus} isEmpty={amount === 0} />
      <div
        onClick={() => { setDraft(amount === 0 ? '' : String(Math.round(amount / 1000))); setEditing(true) }}
        className={`${amtCls} cursor-text hover:bg-[#F3F4F6] rounded px-0.5 transition-colors`}
      >
        {amount === 0 ? '—' : Math.round(amount / 1000).toLocaleString('sv-SE')}
      </div>
    </div>
  )
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

      <AISummary allRevenueRows={allRevenueRows} allCostRows={allCostRows} months={months} />
    </div>
  )
}

// ─── Slide: Pod (all revenue lines) ──────────────────────────────────────────

function PodSlide({ pod, revenueRows, costRows, months, onSaveAmount, onSaveStatus }: {
  pod:         Pod
  revenueRows: RevenueRow[]
  costRows:    CostRow[]
  months:      readonly string[]
  onSaveAmount: (itemId: string, month: string, status: PlanStatus, amount: number) => Promise<void>
  onSaveStatus: (itemId: string, month: string, amount: number, status: PlanStatus) => Promise<void>
}) {
  const today    = new Date()
  const curMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`
  const curIdx   = months.indexOf(curMonth)

  // prev, current, next 2 — clamped to valid range
  const keySet = new Set(
    [-1, 0, 1, 2]
      .map(offset => curIdx + offset)
      .filter(i => i >= 0 && i < months.length)
      .map(i => months[i])
  )

  const totalRev  = months.reduce((s, m) => s + sumByStatus(revenueRows, m, ['A', 'B']), 0)
  const totalCost = months.reduce((s, m) => s + sumCells(costRows, m), 0)
  const margin    = totalRev - totalCost
  const marginPct = totalRev > 0 ? Math.round((margin / totalRev) * 100) : null

  return (
    <div className="max-w-none mx-auto">
      {/* Pod header + KPIs */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <p className="text-white/40 text-xs font-semibold uppercase tracking-widest mb-1">Pod</p>
          <h1 className="text-4xl font-bold text-white">{pod.name}</h1>
          <p className="text-white/40 text-sm mt-1">{revenueRows.length} client{revenueRows.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex gap-3">
          <KpiCard label="Revenue A+B" value={kFmt(totalRev)} />
          <KpiCard label="Costs" value={kFmt(totalCost)} />
          <KpiCard
            label="Margin %"
            value={marginPct != null ? `${marginPct}%` : '—'}
            colour={marginColour(marginPct)}
          />
        </div>
      </div>

      {/* Revenue table */}
      {revenueRows.length === 0 ? (
        <p className="text-white/30 text-sm">No clients in this pod.</p>
      ) : (
        <div className="bg-white rounded-2xl overflow-hidden shadow-2xl">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  {/* Client name header */}
                  <th className="sticky left-0 z-10 bg-[#F9F9F8] px-4 py-2.5 text-left text-[10px] font-bold text-[#9CA3AF] uppercase tracking-wider border-b border-r border-[#EBEBEB] min-w-[160px]">
                    Client
                  </th>
                  {/* Month headers */}
                  {months.map(m => {
                    const featured = keySet.has(m)
                    return (
                      <th
                        key={m}
                        className={`py-2.5 text-center border-b border-[#EBEBEB] ${
                          featured
                            ? 'bg-[#EFF6FF] text-[10px] font-bold text-[#1D4ED8] uppercase tracking-wider min-w-[76px]'
                            : 'bg-[#F9F9F8] text-[10px] font-semibold text-[#9CA3AF] uppercase tracking-wider min-w-[60px]'
                        }`}
                      >
                        {monthLabel(m)}
                        {m === curMonth && (
                          <span className="ml-1 inline-block w-1.5 h-1.5 rounded-full bg-[#1D4ED8] align-middle" />
                        )}
                      </th>
                    )
                  })}
                  {/* FY total header */}
                  <th className="bg-[#F9F9F8] px-3 py-2.5 text-right text-[10px] font-bold text-[#9CA3AF] uppercase tracking-wider border-b border-l border-[#EBEBEB] min-w-[72px]">
                    FY Total
                  </th>
                </tr>
              </thead>

              <tbody>
                {revenueRows.map((row, ri) => {
                  const fyTotal = months.reduce((s, m) => s + (row.cells[m]?.amount ?? 0), 0)
                  return (
                    <tr key={row.id} className={ri % 2 === 1 ? 'bg-[#FAFAFA]' : ''}>
                      {/* Client name */}
                      <td className={`sticky left-0 z-10 px-4 py-0 border-b border-r border-[#EBEBEB] ${ri % 2 === 1 ? 'bg-[#FAFAFA]' : 'bg-white'}`}>
                        <div className="py-2">
                          <p className="text-sm font-medium text-[#0F0F0F] leading-tight">{row.client_name ?? '—'}</p>
                          {row.project && <p className="text-[10px] text-[#9CA3AF] mt-0.5">{row.project}</p>}
                        </div>
                      </td>
                      {/* Month cells */}
                      {months.map(m => {
                        const cell     = row.cells[m] ?? { amount: 0, status: 'F' as PlanStatus }
                        const featured = keySet.has(m)
                        const isAging  = m < curMonth && cell.status !== 'A'
                        return (
                          <td
                            key={m}
                            className={`border-b border-r border-[#F3F4F6] last:border-r-0 ${featured ? 'border-x-[#DBEAFE]' : ''}`}
                          >
                            <PresCell
                              amount={cell.amount}
                              status={cell.status}
                              featured={featured}
                              isAging={isAging}
                              onSaveAmount={v => onSaveAmount(row.id, m, cell.status, v)}
                              onSaveStatus={s => onSaveStatus(row.id, m, cell.amount, s)}
                            />
                          </td>
                        )
                      })}
                      {/* FY total */}
                      <td className="border-b border-l border-[#EBEBEB] px-3 py-0 text-right">
                        <span className="text-xs font-bold text-[#374151] tabular-nums">
                          {fyTotal === 0 ? '—' : Math.round(fyTotal / 1000).toLocaleString('sv-SE')}
                        </span>
                      </td>
                    </tr>
                  )
                })}

                {/* Revenue totals row */}
                <tr className="border-t-2 border-[#E5E7EB] bg-[#F9F9F8]">
                  <td className="sticky left-0 z-10 bg-[#F9F9F8] px-4 py-2 border-r border-[#EBEBEB]">
                    <span className="text-[10px] font-bold text-[#9CA3AF] uppercase tracking-wider">Total revenue</span>
                  </td>
                  {months.map(m => {
                    const tot      = sumByStatus(revenueRows, m, ['A', 'B', 'F'])
                    const featured = keySet.has(m)
                    return (
                      <td key={m} className="px-1 py-2 text-right border-r border-[#F3F4F6]">
                        <span className={`tabular-nums ${featured ? 'text-sm font-bold text-[#374151]' : 'text-xs font-medium text-[#6B7280]'}`}>
                          {tot === 0 ? '—' : Math.round(tot / 1000).toLocaleString('sv-SE')}
                        </span>
                      </td>
                    )
                  })}
                  <td className="border-l border-[#EBEBEB] px-3 py-2 text-right">
                    <span className="text-xs font-bold text-[#374151] tabular-nums">
                      {Math.round(months.reduce((s, m) => s + sumCells(revenueRows, m), 0) / 1000).toLocaleString('sv-SE')}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
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

        <div className="flex gap-2 flex-wrap justify-center max-w-[60vw]">
          {slides.map((s, i) => (
            <button
              key={i}
              onClick={() => onSlideChange(i)}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs transition-colors ${
                i === safeIdx
                  ? 'bg-white text-[#0F0F0F] font-semibold'
                  : 'text-white/40 hover:text-white/70 hover:bg-white/10'
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
