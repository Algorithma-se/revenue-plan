'use client'

import { useState } from 'react'
import type { Pod, RevenueRow, CostRow, PlanStatus } from '@/types/database'
import { sumCells, sumAllMonths, sumByStatus, computeCB1, monthLabel } from '@/lib/plan-utils'
import { EditableCell } from './EditableCell'
import { CostItemModal } from './CostItemModal'
import { ClientBadge } from './ClientBadge'
import { ItemModal } from '@/components/ItemModal'
import type { ItemModalSaveData } from '@/components/ItemModal'

function colStyle(n: number) {
  return { gridTemplateColumns: `200px repeat(${n}, 76px) 80px` }
}

function currentMonthStr() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="currentColor"
      className={`w-3 h-3 transition-transform duration-200 ${open ? 'rotate-0' : '-rotate-90'}`}
    >
      <path fillRule="evenodd" d="M1.646 4.646a.5.5 0 01.708 0L8 10.293l5.646-5.647a.5.5 0 01.708.708l-6 6a.5.5 0 01-.708 0l-6-6a.5.5 0 010-.708z" clipRule="evenodd" />
    </svg>
  )
}

function TotalRow({ label, values, fy, accent }: {
  label: string
  values: number[]
  fy: number
  accent?: boolean
}) {
  const textColor = accent ? 'text-[#0F0F0F]' : 'text-[#374151]'
  const bg = accent ? 'bg-[#F3F4F6]' : 'bg-[#F9FAFB]'
  return (
    <div className={`grid ${bg}`} style={colStyle(values.length)}>
      <div className={`px-3 py-2 text-xs font-semibold ${textColor} truncate`}>{label}</div>
      {values.map((v, i) => (
        <div key={i} className={`px-1 py-2 text-right text-xs font-semibold ${textColor}`}>
          {v === 0 ? <span className="text-[#D1D5DB]">—</span> : Math.round(v / 1000).toLocaleString('sv-SE')}
        </div>
      ))}
      <div className={`px-1 py-2 text-right text-xs font-semibold ${textColor}`}>
        {fy === 0 ? <span className="text-[#D1D5DB]">—</span> : Math.round(fy / 1000).toLocaleString('sv-SE')}
      </div>
    </div>
  )
}

export function PodSection({
  pod, revenueRows, costRows, pods, months, isNoPod, showOnly,
  onSaveManualAmount, onSaveManualStatus,
  onSaveCostAmount, onSaveCostStatus,
  onAddRevenue, onEditRevenue, onDeleteRevenue,
  onAddCost, onEditCost, onDeleteCost,
}: {
  pod: Pod
  revenueRows: RevenueRow[]
  costRows: CostRow[]
  pods: Pod[]
  months: readonly string[]
  isNoPod?: boolean
  showOnly?: 'revenue' | 'costs'
  onSaveManualAmount:  (itemId: string, month: string, status: PlanStatus, amount: number) => Promise<void>
  onSaveManualStatus:  (itemId: string, month: string, amount: number, status: PlanStatus) => Promise<void>
  onSaveCostAmount:    (itemId: string, month: string, status: PlanStatus, amount: number) => Promise<void>
  onSaveCostStatus:    (itemId: string, month: string, amount: number, status: PlanStatus) => Promise<void>
  onAddRevenue:        (client: string, project: string | null, podId: string | null, cells: { month: string; amount: number; status: PlanStatus }[]) => Promise<void>
  onEditRevenue:       (rowId: string, client: string, project: string | null, podId: string | null, cells: { month: string; amount: number; status: PlanStatus }[]) => Promise<void>
  onDeleteRevenue:     (rowId: string) => Promise<void>
  onAddCost:           (category: string, comment: string | null, podId: string | null, cells: { month: string; amount: number }[]) => Promise<void>
  onEditCost:          (rowId: string, category: string, comment: string | null, podId: string | null, cells: { month: string; amount: number }[]) => Promise<void>
  onDeleteCost:        (rowId: string) => Promise<void>
}) {
  const storageKey = `plan-collapse-${pod.id}${showOnly ? '-' + showOnly : ''}`
  const podHeaderLabel = showOnly === 'revenue' && isNoPod ? 'Other Revenue'
    : showOnly === 'costs' && isNoPod ? 'Other Costs'
    : pod.name

  const [revenueOpen, setRevenueOpen] = useState(() => {
    if (typeof window === 'undefined') return true
    try {
      return JSON.parse(localStorage.getItem(storageKey) ?? '{}').revenueOpen ?? true
    } catch { return true }
  })
  const [costsOpen, setCostsOpen] = useState(() => {
    if (typeof window === 'undefined') return true
    try {
      return JSON.parse(localStorage.getItem(storageKey) ?? '{}').costsOpen ?? true
    } catch { return true }
  })

  function toggleRevenue() {
    setRevenueOpen((o: boolean) => {
      const next = !o
      try {
        const prev = JSON.parse(localStorage.getItem(storageKey) ?? '{}')
        localStorage.setItem(storageKey, JSON.stringify({ ...prev, revenueOpen: next }))
      } catch {}
      return next
    })
  }

  function toggleCosts() {
    setCostsOpen((o: boolean) => {
      const next = !o
      try {
        const prev = JSON.parse(localStorage.getItem(storageKey) ?? '{}')
        localStorage.setItem(storageKey, JSON.stringify({ ...prev, costsOpen: next }))
      } catch {}
      return next
    })
  }

  const [addingRevenue, setAddingRevenue]         = useState(false)
  const [editingRevenueRow, setEditingRevenueRow] = useState<RevenueRow | null>(null)
  const [addingCost, setAddingCost]               = useState(false)
  const [editingCostRow, setEditingCostRow]       = useState<CostRow | null>(null)

  const curMonth = currentMonthStr()

  // A+B only for totals and CB1%
  const revTotals  = months.map(m => sumByStatus(revenueRows, m, ['A', 'B']))
  const revFY      = revTotals.reduce((s, v) => s + v, 0)
  const costTotals = months.map(m => sumCells(costRows, m))
  const costFY     = sumAllMonths(costRows, months)

  function revenueRowsForModal(row: RevenueRow): { month: string; amount: string }[] {
    return Object.entries(row.cells)
      .filter(([_, c]) => c.amount > 0)
      .map(([month, c]) => ({ month: month.slice(0, 7), amount: String(Math.round(c.amount / 1000)) }))
      .sort((a, b) => a.month.localeCompare(b.month))
  }

  function handleRevenueModalSave(row: RevenueRow | null, data: ItemModalSaveData) {
    const cells = (data.rows ?? []).map(r => ({
      month: r.month, amount: r.amount, status: 'F' as PlanStatus,
    }))
    if (row) return onEditRevenue(row.id, data.clientName!, data.project ?? null, data.podId, cells)
    return onAddRevenue(data.clientName!, data.project ?? null, data.podId, cells)
  }

  const CS = colStyle(months.length)

  return (
    <>
      <div className="mb-5 bg-white rounded-2xl border border-[#E5E7EB] overflow-hidden shadow-sm">

        {/* ── Pod header ─────────────────────────────────────────────────────── */}
        <div className="grid bg-gradient-to-r from-[#0F0F0F] to-[#1F2937]" style={CS}>
          <div className="px-4 py-2.5 flex items-center gap-2 min-w-0">
            <div className="w-2 h-2 rounded-full bg-[#61b5cc] flex-shrink-0" />
            <span className="text-sm font-bold text-white tracking-wide truncate">{podHeaderLabel}</span>
          </div>
          {months.map(m => (
            <div key={m} className="px-1 py-2.5 text-center text-[10px] font-semibold text-white/40 uppercase tracking-wider">
              {monthLabel(m)}
            </div>
          ))}
          <div className="px-1 py-2.5 text-center text-[10px] font-semibold text-white/40 uppercase tracking-wider">FY</div>
        </div>

        {/* ── Revenue section ────────────────────────────────────────────────── */}
        {showOnly !== 'costs' && <>
        <button
          onClick={toggleRevenue}
          className="w-full flex items-center gap-2 px-4 py-2 bg-[#F8FAFC] border-b border-[#E5E7EB] hover:bg-[#F1F5F9] transition-colors"
        >
          <ChevronIcon open={revenueOpen} />
          <span className="text-[10px] font-bold text-[#64748B] uppercase tracking-widest">Revenue</span>
        </button>

        {/* ── Revenue rows ───────────────────────────────────────────────────── */}
        {revenueOpen && (
          <>
            {revenueRows.map((row, rowIdx) => (
              <div
                key={row.id}
                className={`grid border-b border-[#F3F4F6] transition-colors ${rowIdx % 2 === 1 ? 'bg-[#FAFAFA]' : 'bg-white'} hover:bg-[#F0F9FF]`}
                style={CS}
              >
                {/* Row label */}
                <div
                  className="px-3 py-1.5 flex flex-col justify-center min-w-0 cursor-pointer group"
                  onClick={() => setEditingRevenueRow(row)}
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-xs text-[#111827] font-medium truncate group-hover:text-[#2563EB] transition-colors" title={row.client_name ?? ''}>
                      {row.client_name ?? '—'}
                    </span>
                    <ClientBadge row={row} />
                  </div>
                  {row.project && (
                    <span className="text-[10px] text-[#9CA3AF] truncate mt-0.5">{row.project}</span>
                  )}
                </div>

                {/* Cells */}
                {months.map(m => {
                  const cell = row.cells[m]
                  const isAging = m < curMonth && cell.status !== 'A' && cell.amount > 0
                  return (
                    <EditableCell
                      key={m}
                      amount={cell.amount}
                      status={cell.status}
                      isAging={isAging}
                      onSaveAmount={v => onSaveManualAmount(row.id, m, cell.status, v)}
                      onSaveStatus={s => onSaveManualStatus(row.id, m, cell.amount, s)}
                    />
                  )
                })}

                {/* FY total (all statuses for individual row) */}
                <div className="px-1 py-1.5 flex items-center justify-end text-xs font-semibold text-[#111827]">
                  {sumAllMonths([row], months) === 0
                    ? <span className="text-[#D1D5DB]">—</span>
                    : Math.round(sumAllMonths([row], months) / 1000).toLocaleString('sv-SE')}
                </div>
              </div>
            ))}

            {/* Add revenue button */}
            <div className="border-b border-[#F3F4F6]">
              <button
                onClick={() => setAddingRevenue(true)}
                className="flex items-center gap-1.5 px-4 py-2 text-xs text-[#9CA3AF] hover:text-[#2563EB] hover:bg-[#EFF6FF] w-full transition-colors"
              >
                <span className="text-sm font-light leading-none">+</span>
                Add revenue item
              </button>
            </div>

            {/* Revenue total (A+B only) */}
            <TotalRow label="Total revenue (A+B)" values={revTotals} fy={revFY} accent />
          </>
        )}
        {/* Always show revenue total — visible even when section is collapsed */}
        {!revenueOpen && <TotalRow label="Total revenue (A+B)" values={revTotals} fy={revFY} accent />}
        </>}

        {/* ── Costs section ──────────────────────────────────────────────────── */}
        {showOnly !== 'revenue' && <>
        <button
          onClick={toggleCosts}
          className="w-full flex items-center gap-2 px-4 py-2 bg-[#F8FAFC] border-t border-[#E5E7EB] border-b border-[#E5E7EB] hover:bg-[#F1F5F9] transition-colors"
        >
          <ChevronIcon open={costsOpen} />
          <span className="text-[10px] font-bold text-[#64748B] uppercase tracking-widest">Costs</span>
        </button>

        {/* ── Cost rows ──────────────────────────────────────────────────────── */}
        {costsOpen && (
          <>
            {costRows.map((row, rowIdx) => (
              <div
                key={row.id}
                className={`grid border-b border-[#F3F4F6] transition-colors ${rowIdx % 2 === 1 ? 'bg-[#FAFAFA]' : 'bg-white'} hover:bg-[#FFF7ED]`}
                style={CS}
              >
                <div
                  className="px-3 py-1.5 flex flex-col justify-center min-w-0 cursor-pointer group"
                  onClick={() => setEditingCostRow(row)}
                >
                  <span className="text-xs text-[#374151] truncate group-hover:text-[#EA580C] transition-colors">{row.category}</span>
                  {row.comment && (
                    <span className="text-[10px] text-[#9CA3AF] truncate mt-0.5">{row.comment}</span>
                  )}
                </div>
                {months.map(m => {
                  const cell = row.cells[m]
                  const isAging = m < curMonth && cell.status !== 'A' && cell.amount > 0
                  return (
                    <EditableCell
                      key={m}
                      amount={cell.amount}
                      status={cell.status}
                      isAging={isAging}
                      onSaveAmount={v => onSaveCostAmount(row.id, m, cell.status, v)}
                      onSaveStatus={s => onSaveCostStatus(row.id, m, cell.amount, s)}
                    />
                  )
                })}
                <div className="px-1 py-1.5 flex items-center justify-end text-xs font-semibold text-[#374151]">
                  {sumAllMonths([row], months) === 0
                    ? <span className="text-[#D1D5DB]">—</span>
                    : Math.round(sumAllMonths([row], months) / 1000).toLocaleString('sv-SE')}
                </div>
              </div>
            ))}

            {/* Add cost button */}
            <div className="border-b border-[#F3F4F6]">
              <button
                onClick={() => setAddingCost(true)}
                className="flex items-center gap-1.5 px-4 py-2 text-xs text-[#9CA3AF] hover:text-[#EA580C] hover:bg-[#FFF7ED] w-full transition-colors"
              >
                <span className="text-sm font-light leading-none">+</span>
                Add cost item
              </button>
            </div>

            {/* Cost total */}
            <TotalRow label="Total costs" values={costTotals} fy={costFY} />
          </>
        )}
        {/* Always show cost total — visible even when section is collapsed */}
        {!costsOpen && <TotalRow label="Total costs" values={costTotals} fy={costFY} />}
        </>}

        {/* ── CB1% row ───────────────────────────────────────────────────────── */}
        {!isNoPod && !showOnly && <div className="grid border-t-2 border-[#E5E7EB] bg-[#F8FAFC]" style={CS}>
          <div className="px-3 py-2 text-xs font-bold text-[#64748B] uppercase tracking-wider">CB1%</div>
          {months.map((m, i) => {
            const cb = computeCB1(revTotals[i], costTotals[i])
            return (
              <div key={m} className={`px-1 py-2 text-right text-xs font-bold ${
                cb === null ? 'text-[#D1D5DB]' :
                cb >= 20   ? 'text-[#16A34A]' :
                cb >= 0    ? 'text-[#D97706]' : 'text-[#DC2626]'
              }`}>
                {cb === null ? '—' : `${Math.round(cb)}%`}
              </div>
            )
          })}
          <div className={`px-1 py-2 text-right text-xs font-bold ${(() => {
            const cb = computeCB1(revFY, costFY)
            return cb === null ? 'text-[#D1D5DB]' : cb >= 20 ? 'text-[#16A34A]' : cb >= 0 ? 'text-[#D97706]' : 'text-[#DC2626]'
          })()}`}>
            {(() => {
              const cb = computeCB1(revFY, costFY)
              return cb === null ? '—' : `${Math.round(cb)}%`
            })()}
          </div>
        </div>}
      </div>

      {/* ── Modals ─────────────────────────────────────────────────────────────── */}
      {addingRevenue && (
        <ItemModal
          mode="manual"
          pods={pods}
          initialPodId={pod.id}
          initialRows={[]}
          onClose={() => setAddingRevenue(false)}
          onSave={async data => {
            await handleRevenueModalSave(null, data)
            setAddingRevenue(false)
          }}
        />
      )}

      {editingRevenueRow && (
        <ItemModal
          mode="manual"
          pods={pods}
          initialClientName={editingRevenueRow.client_name ?? ''}
          initialComment={editingRevenueRow.project ?? ''}
          initialPodId={editingRevenueRow.pod_id}
          initialRows={revenueRowsForModal(editingRevenueRow)}
          onClose={() => setEditingRevenueRow(null)}
          onSave={async data => {
            await handleRevenueModalSave(editingRevenueRow, data)
            setEditingRevenueRow(null)
          }}
          onDelete={async () => {
            await onDeleteRevenue(editingRevenueRow.id)
            setEditingRevenueRow(null)
          }}
        />
      )}

      {addingCost && (
        <CostItemModal
          mode="add"
          pods={pods}
          defaultPodId={pod.id}
          onClose={() => setAddingCost(false)}
          onSave={async (category, comment, podId, cells) => {
            await onAddCost(category, comment, podId, cells)
            setAddingCost(false)
          }}
        />
      )}

      {editingCostRow && (
        <CostItemModal
          mode="edit"
          pods={pods}
          editRow={editingCostRow}
          onClose={() => setEditingCostRow(null)}
          onSave={async (category, comment, podId, cells) => {
            await onEditCost(editingCostRow.id, category, comment, podId, cells)
            setEditingCostRow(null)
          }}
          onDelete={async () => {
            await onDeleteCost(editingCostRow.id)
            setEditingCostRow(null)
          }}
        />
      )}
    </>
  )
}
