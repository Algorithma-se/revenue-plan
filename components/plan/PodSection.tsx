'use client'

import { useState } from 'react'
import type { Pod, RevenueRow, CostRow, PlanStatus } from '@/types/database'
import { sumCells, sumAllMonths, computeCB1 } from '@/lib/plan-utils'
import { EditableCell } from './EditableCell'
import { CostItemModal } from './CostItemModal'
import { ItemModal } from '@/components/ItemModal'
import type { ItemModalSaveData } from '@/components/ItemModal'

function colStyle(n: number) {
  return { gridTemplateColumns: `200px repeat(${n}, 76px) 80px` }
}

function TotalRow({ label, values, fy }: { label: string; values: number[]; fy: number }) {
  return (
    <div className="grid border-t border-[#EBEBEB] bg-[#F9F9F8]" style={colStyle(values.length)}>
      <div className="px-2 py-2 text-xs font-semibold text-[#0F0F0F] truncate">{label}</div>
      {values.map((v, i) => (
        <div key={i} className="px-1 py-2 text-right text-xs font-semibold text-[#0F0F0F]">
          {v === 0 ? <span className="text-[#D1D5DB]">—</span> : Math.round(v / 1000).toLocaleString('sv-SE')}
        </div>
      ))}
      <div className="px-1 py-2 text-right text-xs font-semibold text-[#0F0F0F]">
        {fy === 0 ? <span className="text-[#D1D5DB]">—</span> : Math.round(fy / 1000).toLocaleString('sv-SE')}
      </div>
    </div>
  )
}

export function PodSection({
  pod, revenueRows, costRows, pods, months,
  onSaveManualAmount, onSaveManualStatus,
  onSaveAllocStatus, onSaveCostAmount, onSaveCostStatus,
  onAddRevenue, onEditRevenue, onDeleteRevenue,
  onAddCost, onEditCost, onDeleteCost,
}: {
  pod: Pod
  revenueRows: RevenueRow[]
  costRows: CostRow[]
  pods: Pod[]
  months: readonly string[]
  onSaveManualAmount: (itemId: string, month: string, status: PlanStatus, amount: number) => Promise<void>
  onSaveManualStatus: (itemId: string, month: string, amount: number, status: PlanStatus) => Promise<void>
  onSaveAllocStatus:  (itemId: string, month: string, status: PlanStatus) => Promise<void>
  onSaveCostAmount:   (itemId: string, month: string, status: PlanStatus, amount: number) => Promise<void>
  onSaveCostStatus:   (itemId: string, month: string, amount: number, status: PlanStatus) => Promise<void>
  onAddRevenue:    (client: string, project: string | null, podId: string | null, cells: { month: string; amount: number; status: PlanStatus }[]) => Promise<void>
  onEditRevenue:   (rowId: string, client: string, project: string | null, podId: string | null, cells: { month: string; amount: number; status: PlanStatus }[]) => Promise<void>
  onDeleteRevenue: (rowId: string) => Promise<void>
  onAddCost:    (category: string, podId: string | null, cells: { month: string; amount: number; status: PlanStatus }[]) => Promise<void>
  onEditCost:   (rowId: string, category: string, podId: string | null, cells: { month: string; amount: number; status: PlanStatus }[]) => Promise<void>
  onDeleteCost: (rowId: string) => Promise<void>
}) {
  const [addingRevenue, setAddingRevenue]         = useState(false)
  const [editingRevenueRow, setEditingRevenueRow] = useState<RevenueRow | null>(null)
  const [addingCost, setAddingCost]               = useState(false)
  const [editingCostRow, setEditingCostRow]       = useState<CostRow | null>(null)

  const revTotals  = months.map(m => sumCells(revenueRows, m))
  const revFY      = sumAllMonths(revenueRows, months)
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
      month: r.month,
      amount: r.amount,
      status: 'F' as PlanStatus,
    }))
    if (row) {
      return onEditRevenue(row.id, data.clientName!, data.project ?? null, data.podId, cells)
    }
    return onAddRevenue(data.clientName!, data.project ?? null, data.podId, cells)
  }

  const CS = colStyle(months.length)

  return (
    <>
      <div className="mb-6 bg-white rounded-2xl border border-[#EBEBEB] overflow-hidden">

        {/* Pod header */}
        <div className="px-3 py-2 bg-[#F9F9F8] border-b border-[#EBEBEB]">
          <span className="text-xs font-bold text-[#0F0F0F] uppercase tracking-wider">{pod.name}</span>
          <span className="text-[10px] text-[#9CA3AF] ml-2">Revenue</span>
        </div>

        {/* Revenue rows */}
        {revenueRows.map(row => (
          <div key={row.id} className="grid border-b border-[#F3F4F6] hover:bg-[#FAFAFA] transition-colors" style={CS}>
            <div
              className={`px-2 py-1 flex flex-col justify-center min-w-0 ${row.kind === 'manual' ? 'cursor-pointer hover:text-[#61b5cc]' : ''}`}
              onClick={row.kind === 'manual' ? () => setEditingRevenueRow(row) : undefined}
            >
              <span className="text-xs text-[#0F0F0F] font-medium truncate" title={row.client_name ?? ''}>
                {row.client_name ?? '—'}
              </span>
              {row.project && (
                <span className="text-[10px] text-[#9CA3AF] truncate">{row.project}</span>
              )}
            </div>
            {months.map(m => {
              const cell = row.cells[m]
              if (row.kind === 'manual') {
                return (
                  <EditableCell
                    key={m}
                    amount={cell.amount}
                    status={cell.status}
                    onSaveAmount={v => onSaveManualAmount(row.id, m, cell.status, v)}
                    onSaveStatus={s => onSaveManualStatus(row.id, m, cell.amount, s)}
                  />
                )
              }
              return (
                <EditableCell
                  key={m}
                  amount={cell.amount}
                  status={cell.status}
                  onSaveStatus={s => onSaveAllocStatus(row.id, m, s)}
                />
              )
            })}
            <div className="px-1 py-1 flex items-center justify-end text-xs font-semibold text-[#0F0F0F]">
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
            className="flex items-center gap-1.5 px-3 py-2 text-xs text-[#9CA3AF] hover:text-[#61b5cc] transition-colors"
          >
            <span className="text-base leading-none">+</span>
            Add revenue item
          </button>
        </div>

        {/* Revenue total */}
        <TotalRow label={`Total revenue ${pod.name}`} values={revTotals} fy={revFY} />

        {/* Cost header */}
        <div className="px-3 py-2 bg-[#F9F9F8] border-t border-[#EBEBEB]">
          <span className="text-[10px] text-[#9CA3AF] font-semibold uppercase tracking-wider">Costs</span>
        </div>

        {/* Cost rows */}
        {costRows.map(row => (
          <div key={row.id} className="grid border-b border-[#F3F4F6] hover:bg-[#FAFAFA] transition-colors" style={CS}>
            <div
              className="px-2 py-1 flex items-center text-xs text-[#6B7280] truncate cursor-pointer hover:text-[#61b5cc]"
              onClick={() => setEditingCostRow(row)}
            >
              {row.category}
            </div>
            {months.map(m => {
              const cell = row.cells[m]
              return (
                <EditableCell
                  key={m}
                  amount={cell.amount}
                  status={cell.status}
                  onSaveAmount={v => onSaveCostAmount(row.id, m, cell.status, v)}
                  onSaveStatus={s => onSaveCostStatus(row.id, m, cell.amount, s)}
                />
              )
            })}
            <div className="px-1 py-1 flex items-center justify-end text-xs font-semibold text-[#6B7280]">
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
            className="flex items-center gap-1.5 px-3 py-2 text-xs text-[#9CA3AF] hover:text-[#61b5cc] transition-colors"
          >
            <span className="text-base leading-none">+</span>
            Add cost item
          </button>
        </div>

        {/* Cost total */}
        <TotalRow label={`Total costs ${pod.name}`} values={costTotals} fy={costFY} />

        {/* CB1% */}
        <div className="grid border-t border-[#EBEBEB]" style={CS}>
          <div className="px-2 py-2 text-xs font-semibold text-[#9CA3AF]">CB1%</div>
          {months.map((m, i) => {
            const cb = computeCB1(revTotals[i], costTotals[i])
            return (
              <div key={m} className={`px-1 py-2 text-right text-xs font-semibold ${
                cb === null ? 'text-[#D1D5DB]' :
                cb >= 20   ? 'text-[#16A34A]' :
                cb >= 0    ? 'text-[#B45309]' : 'text-[#EF4444]'
              }`}>
                {cb === null ? '—' : `${Math.round(cb)}%`}
              </div>
            )
          })}
          <div className={`px-1 py-2 text-right text-xs font-semibold ${
            (() => {
              const cb = computeCB1(revFY, costFY)
              return cb === null ? 'text-[#D1D5DB]' : cb >= 20 ? 'text-[#16A34A]' : cb >= 0 ? 'text-[#B45309]' : 'text-[#EF4444]'
            })()
          }`}>
            {(() => {
              const cb = computeCB1(revFY, costFY)
              return cb === null ? '—' : `${Math.round(cb)}%`
            })()}
          </div>
        </div>
      </div>

      {/* Add revenue modal */}
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

      {/* Edit revenue modal */}
      {editingRevenueRow && (
        <ItemModal
          mode="manual"
          pods={pods}
          initialClientName={editingRevenueRow.client_name ?? ''}
          initialProject={editingRevenueRow.project ?? ''}
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

      {/* Add cost modal */}
      {addingCost && (
        <CostItemModal
          mode="add"
          pods={pods}
          months={months}
          defaultPodId={pod.id}
          onClose={() => setAddingCost(false)}
          onSave={async (category, podId, cells) => {
            await onAddCost(category, podId, cells)
            setAddingCost(false)
          }}
        />
      )}

      {/* Edit cost modal */}
      {editingCostRow && (
        <CostItemModal
          mode="edit"
          pods={pods}
          months={months}
          editRow={editingCostRow}
          onClose={() => setEditingCostRow(null)}
          onSave={async (category, podId, cells) => {
            await onEditCost(editingCostRow.id, category, podId, cells)
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
