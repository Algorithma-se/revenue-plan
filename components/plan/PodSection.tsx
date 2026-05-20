'use client'

import type { Pod, RevenueRow, CostRow, PlanStatus } from '@/types/database'
import { FISCAL_MONTHS, fmtKSEK, sumCells, sumAllMonths, computeCB1 } from '@/lib/plan-utils'
import { EditableCell } from './EditableCell'
import { AddRowButton } from './AddRowButton'

const COL_STYLE = { gridTemplateColumns: '200px repeat(12, 76px) 80px' }
const TOTAL_MONTHS = FISCAL_MONTHS.length + 2 // label + 12 + FY

function TotalRow({ label, values, fy, accent }: {
  label: string
  values: number[]
  fy: number
  accent?: string
}) {
  return (
    <div className={`grid border-t border-[#EBEBEB] ${accent ?? 'bg-[#F9F9F8]'}`} style={COL_STYLE}>
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
  pod, revenueRows, costRows,
  onSaveManualAmount, onSaveManualStatus,
  onSaveAllocStatus, onSaveCostAmount, onSaveCostStatus,
  onAddRevenue, onAddCost,
}: {
  pod: Pod
  revenueRows: RevenueRow[]
  costRows: CostRow[]
  onSaveManualAmount: (itemId: string, month: string, status: PlanStatus, amount: number) => Promise<void>
  onSaveManualStatus: (itemId: string, month: string, amount: number, status: PlanStatus) => Promise<void>
  onSaveAllocStatus:  (itemId: string, month: string, status: PlanStatus) => Promise<void>
  onSaveCostAmount:   (itemId: string, month: string, status: PlanStatus, amount: number) => Promise<void>
  onSaveCostStatus:   (itemId: string, month: string, amount: number, status: PlanStatus) => Promise<void>
  onAddRevenue: (name: string) => Promise<void>
  onAddCost:    (cat: string)  => Promise<void>
}) {
  const revTotals = FISCAL_MONTHS.map(m => sumCells(revenueRows, m))
  const revFY     = sumAllMonths(revenueRows)
  const costTotals = FISCAL_MONTHS.map(m => sumCells(costRows, m))
  const costFY     = sumAllMonths(costRows)

  return (
    <div className="mb-6 bg-white rounded-2xl border border-[#EBEBEB] overflow-hidden">

      {/* Pod header */}
      <div className="px-3 py-2 bg-[#F9F9F8] border-b border-[#EBEBEB]">
        <span className="text-xs font-bold text-[#0F0F0F] uppercase tracking-wider">{pod.name}</span>
        <span className="text-[10px] text-[#9CA3AF] ml-2">Revenue</span>
      </div>

      {/* Revenue rows */}
      {revenueRows.map(row => (
        <div key={row.id} className="grid border-b border-[#F3F4F6] hover:bg-[#FAFAFA] transition-colors" style={COL_STYLE}>
          <div className="px-2 py-1 flex items-center text-xs text-[#0F0F0F] font-medium truncate" title={row.client_name ?? ''}>
            {row.client_name ?? '—'}
          </div>
          {FISCAL_MONTHS.map(m => {
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
                readonly={true}
                onSaveStatus={s => onSaveAllocStatus(row.id, m, s)}
              />
            )
          })}
          <div className="px-1 py-1 flex items-center justify-end text-xs font-semibold text-[#0F0F0F]">
            {sumAllMonths([row]) === 0
              ? <span className="text-[#D1D5DB]">—</span>
              : Math.round(sumAllMonths([row]) / 1000).toLocaleString('sv-SE')}
          </div>
        </div>
      ))}

      {/* Add revenue row */}
      <div className="border-b border-[#F3F4F6]">
        <AddRowButton
          label="Add revenue item"
          placeholder="Client name…"
          onAdd={onAddRevenue}
          colSpan={TOTAL_MONTHS}
        />
      </div>

      {/* Revenue total */}
      <TotalRow label={`Total revenue ${pod.name}`} values={revTotals} fy={revFY} />

      {/* Cost header */}
      <div className="px-3 py-2 bg-[#F9F9F8] border-t border-[#EBEBEB]">
        <span className="text-[10px] text-[#9CA3AF] font-semibold uppercase tracking-wider">Costs</span>
      </div>

      {/* Cost rows */}
      {costRows.map(row => (
        <div key={row.id} className="grid border-b border-[#F3F4F6] hover:bg-[#FAFAFA] transition-colors" style={COL_STYLE}>
          <div className="px-2 py-1 flex items-center text-xs text-[#6B7280] truncate">{row.category}</div>
          {FISCAL_MONTHS.map(m => {
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
            {sumAllMonths([row]) === 0
              ? <span className="text-[#D1D5DB]">—</span>
              : Math.round(sumAllMonths([row]) / 1000).toLocaleString('sv-SE')}
          </div>
        </div>
      ))}

      {/* Add cost row */}
      <div className="border-b border-[#F3F4F6]">
        <AddRowButton
          label="Add cost item"
          placeholder="Category name…"
          onAdd={onAddCost}
          colSpan={TOTAL_MONTHS}
        />
      </div>

      {/* Cost total */}
      <TotalRow label={`Total costs ${pod.name}`} values={costTotals} fy={costFY} />

      {/* CB1% */}
      <div className="grid border-t border-[#EBEBEB]" style={COL_STYLE}>
        <div className="px-2 py-2 text-xs font-semibold text-[#9CA3AF]">CB1%</div>
        {FISCAL_MONTHS.map((m, i) => {
          const cb = computeCB1(revTotals[i], costTotals[i])
          return (
            <div key={m} className={`px-1 py-2 text-right text-xs font-semibold ${
              cb === null ? 'text-[#D1D5DB]' :
              cb >= 20 ? 'text-[#16A34A]' :
              cb >= 0  ? 'text-[#B45309]' : 'text-[#EF4444]'
            }`}>
              {cb === null ? '—' : `${Math.round(cb)}%`}
            </div>
          )
        })}
        <div className={`px-1 py-2 text-right text-xs font-semibold ${
          (() => { const cb = computeCB1(revFY, costFY); return cb === null ? 'text-[#D1D5DB]' : cb >= 20 ? 'text-[#16A34A]' : cb >= 0 ? 'text-[#B45309]' : 'text-[#EF4444]' })()
        }`}>
          {computeCB1(revFY, costFY) === null ? '—' : `${Math.round(computeCB1(revFY, costFY)!)}%`}
        </div>
      </div>
    </div>
  )
}
