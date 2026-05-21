'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import {
  getFiscalMonths, fyLabel, currentFyStart,
  monthLabel, buildRevenueRows, buildCostRows,
  sumCells, sumAllMonths, computeClientTrend,
} from '@/lib/plan-utils'
import type { Trend } from '@/lib/plan-utils'
import type {
  Pod, ManualRevenueItem, PlanRevenueCell,
  CostItem, PlanCostCell,
  RevenueRow, CostRow, PlanStatus,
} from '@/types/database'
import { PodSection } from '@/components/plan/PodSection'
import { SummarySection } from '@/components/plan/SummarySection'
import { AISummary } from '@/components/plan/AISummary'
import { PlanChart } from '@/components/plan/PlanChart'
import { RevenueDonut } from '@/components/plan/RevenueDonut'

// ─── Raw data state ────────────────────────────────────────────────────────────

interface PlanState {
  pods:         Pod[]
  manualItems:  ManualRevenueItem[]
  planRevCells: PlanRevenueCell[]
  costItems:    CostItem[]
  costCells:    PlanCostCell[]
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function PlanPage() {
  const [state, setState]     = useState<PlanState | null>(null)
  const [loading, setLoading] = useState(true)
  const [fyStart, setFyStart] = useState(currentFyStart)

  const months = getFiscalMonths(fyStart)

  const [mobileMonthIdx, setMobileMonthIdx] = useState(() => {
    const today = new Date()
    const cur = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`
    const idx = getFiscalMonths(currentFyStart()).indexOf(cur)
    return idx >= 0 ? idx : 0
  })
  const safeMobileIdx = Math.min(mobileMonthIdx, months.length - 1)
  const mobileMonth   = months[safeMobileIdx]
  const mobileLabel   = `${monthLabel(mobileMonth)} ${mobileMonth.slice(0, 4)}`

  const load = useCallback(async () => {
    const [
      { data: pods },
      { data: manualItems },
      { data: planRevCells },
      { data: costItems },
      { data: costCells },
    ] = await Promise.all([
      supabase.from('pods').select('*').order('sort'),
      supabase.from('manual_revenue_items').select('*').order('sort'),
      supabase.from('plan_revenue_cells').select('*'),
      supabase.from('cost_items').select('*').order('sort'),
      supabase.from('plan_cost_cells').select('*'),
    ])

    setState({
      pods:         (pods ?? [])         as Pod[],
      manualItems:  (manualItems ?? [])  as ManualRevenueItem[],
      planRevCells: (planRevCells ?? []) as PlanRevenueCell[],
      costItems:    (costItems ?? [])    as CostItem[],
      costCells:    (costCells ?? [])    as PlanCostCell[],
    })
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // ── Optimistic updaters ──────────────────────────────────────────────────────

  function updateManualCell(itemId: string, month: string, amount: number, status: PlanStatus) {
    setState(s => s ? ({
      ...s,
      planRevCells: s.planRevCells.some(c => c.manual_revenue_item_id === itemId && c.month === month)
        ? s.planRevCells.map(c =>
            c.manual_revenue_item_id === itemId && c.month === month
              ? { ...c, amount, status }
              : c
          )
        : [...s.planRevCells, { id: crypto.randomUUID(), manual_revenue_item_id: itemId, month, amount, status }],
    }) : s)
  }

  function updateCostCell(itemId: string, month: string, amount: number, status: PlanStatus) {
    setState(s => s ? ({
      ...s,
      costCells: s.costCells.some(c => c.cost_item_id === itemId && c.month === month)
        ? s.costCells.map(c =>
            c.cost_item_id === itemId && c.month === month
              ? { ...c, amount, status }
              : c
          )
        : [...s.costCells, { id: crypto.randomUUID(), cost_item_id: itemId, month, amount, status }],
    }) : s)
  }

  // ── CRUD operations ──────────────────────────────────────────────────────────

  async function addManualItem(
    podId: string | null,
    clientName: string,
    project: string | null,
    cells: { month: string; amount: number; status: PlanStatus }[],
  ) {
    const { data, error } = await supabase
      .from('manual_revenue_items')
      .insert({ pod_id: podId, client_name: clientName, project, sort: Math.floor(Date.now() / 1000) })
      .select()
      .single()
    if (error || !data) throw new Error(error?.message ?? 'Failed to add item')
    const newItem = data as ManualRevenueItem

    if (cells.length > 0) {
      await supabase
        .from('plan_revenue_cells')
        .insert(cells.map(c => ({ manual_revenue_item_id: newItem.id, month: c.month, amount: c.amount, status: c.status })))
    }
    await load()
  }

  async function editManualItem(
    itemId: string,
    clientName: string,
    project: string | null,
    podId: string | null,
    cells: { month: string; amount: number; status: PlanStatus }[],
  ) {
    await supabase
      .from('manual_revenue_items')
      .update({ client_name: clientName, project, pod_id: podId })
      .eq('id', itemId)
    if (cells.length > 0) {
      // Upsert changed cells (preserves status for unchanged cells not sent from modal)
      await supabase.from('plan_revenue_cells').upsert(
        cells.map(c => ({ manual_revenue_item_id: itemId, month: c.month, amount: c.amount, status: c.status })),
        { onConflict: 'manual_revenue_item_id,month' },
      )
      // Remove cells the user deleted from the modal (months no longer in the save data)
      const months = cells.map(c => c.month)
      await supabase.from('plan_revenue_cells')
        .delete()
        .eq('manual_revenue_item_id', itemId)
        .not('month', 'in', `(${months.join(',')})`)
    } else {
      await supabase.from('plan_revenue_cells').delete().eq('manual_revenue_item_id', itemId)
    }
    await load()
  }

  async function deleteManualItem(itemId: string) {
    // Reset any linked Work List items back to active before deleting the plan row
    await supabase.from('revenue_items')
      .update({ status: 'active', plan_manual_item_id: null })
      .eq('plan_manual_item_id', itemId)
    // plan_revenue_cells cascade-deletes via FK
    await supabase.from('manual_revenue_items').delete().eq('id', itemId)
    await load()
  }

  async function addCostItem(
    podId: string | null,
    category: string,
    comment: string | null,
    cells: { month: string; amount: number }[],
  ) {
    const { data, error } = await supabase
      .from('cost_items')
      .insert({ pod_id: podId, category, comment, sort: Math.floor(Date.now() / 1000) })
      .select()
      .single()
    if (error || !data) throw new Error(error?.message ?? 'Failed to add cost item')
    const newItem = data as CostItem
    if (cells.length > 0) {
      await supabase
        .from('plan_cost_cells')
        .insert(cells.map(c => ({ cost_item_id: newItem.id, month: c.month, amount: c.amount, status: 'F' })))
    }
    await load()
  }

  async function editCostItem(
    itemId: string,
    category: string,
    comment: string | null,
    podId: string | null,
    cells: { month: string; amount: number }[],
  ) {
    await supabase
      .from('cost_items')
      .update({ category, comment, pod_id: podId })
      .eq('id', itemId)
    await supabase.from('plan_cost_cells').delete().eq('cost_item_id', itemId)
    if (cells.length > 0) {
      await supabase
        .from('plan_cost_cells')
        .insert(cells.map(c => ({ cost_item_id: itemId, month: c.month, amount: c.amount, status: 'F' })))
    }
    await load()
  }

  async function deleteCostItem(itemId: string) {
    await supabase.from('plan_cost_cells').delete().eq('cost_item_id', itemId)
    await supabase.from('cost_items').delete().eq('id', itemId)
    await load()
  }

  // ─── Persist helpers ─────────────────────────────────────────────────────────

  async function saveManualCellAmount(itemId: string, month: string, currentStatus: PlanStatus, amount: number) {
    updateManualCell(itemId, month, amount, currentStatus)
    await supabase.from('plan_revenue_cells').upsert(
      { manual_revenue_item_id: itemId, month, amount, status: currentStatus },
      { onConflict: 'manual_revenue_item_id,month' }
    )
  }

  async function saveManualCellStatus(itemId: string, month: string, currentAmount: number, status: PlanStatus) {
    updateManualCell(itemId, month, currentAmount, status)
    await supabase.from('plan_revenue_cells').upsert(
      { manual_revenue_item_id: itemId, month, amount: currentAmount, status },
      { onConflict: 'manual_revenue_item_id,month' }
    )
  }

  async function saveCostCellAmount(itemId: string, month: string, currentStatus: PlanStatus, amount: number) {
    updateCostCell(itemId, month, amount, currentStatus)
    await supabase.from('plan_cost_cells').upsert(
      { cost_item_id: itemId, month, amount, status: currentStatus },
      { onConflict: 'cost_item_id,month' }
    )
  }

  async function saveCostCellStatus(itemId: string, month: string, currentAmount: number, status: PlanStatus) {
    updateCostCell(itemId, month, currentAmount, status)
    await supabase.from('plan_cost_cells').upsert(
      { cost_item_id: itemId, month, amount: currentAmount, status },
      { onConflict: 'cost_item_id,month' }
    )
  }

  // ─── Render ──────────────────────────────────────────────────────────────────

  if (loading || !state) {
    return (
      <div className="px-6 py-8">
        <div className="h-7 w-96 bg-[#F3F4F6] rounded-lg animate-pulse mb-8" />
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="mb-8">
            <div className="h-5 w-32 bg-[#F3F4F6] rounded animate-pulse mb-3" />
            {Array.from({ length: 4 }).map((_, j) => (
              <div key={j} className="h-9 bg-white border border-[#F3F4F6] rounded mb-1 animate-pulse" />
            ))}
          </div>
        ))}
      </div>
    )
  }

  // Future FY: only show rows that have at least one B or F cell with amount > 0
  const isFutureFY = fyStart > currentFyStart()
  function filterFuture(rows: RevenueRow[]): RevenueRow[] {
    if (!isFutureFY) return rows
    return rows.filter(row =>
      months.some(m => {
        const cell = row.cells[m]
        return cell && cell.amount > 0 && (cell.status === 'B' || cell.status === 'F')
      })
    )
  }

  const allRevenueRows: RevenueRow[] = state.pods.flatMap(pod =>
    filterFuture(buildRevenueRows(pod, state.manualItems, state.planRevCells, months))
  )
  const allCostRows: CostRow[] = state.pods.flatMap(pod =>
    buildCostRows(pod, state.costItems, state.costCells, months)
  )

  const today    = new Date()
  const curMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`
  const ytdMonths = months.filter(m => m <= curMonth)
  const clientNames = [...new Set(allRevenueRows.map(r => r.client_name).filter((n): n is string => !!n))]
  const clientTrends = new Map<string, Trend | null>(
    clientNames.map(name => [name, computeClientTrend(allRevenueRows, name, ytdMonths)])
  )

  return (
    <div className="min-h-screen bg-[#F9F9F8]">
      <div className="px-4 py-6 max-w-none">

        {/* Title + FY navigation */}
        <div className="mb-6 flex items-end justify-between">
          <div>
            <h1 className="text-xl font-bold text-[#0F0F0F] tracking-tight">
              Algorithma monthly reporting
            </h1>
            <p className="text-xs text-[#9CA3AF] mt-0.5">Income statement (kSEK)</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setFyStart(y => y - 1)}
              className="p-1.5 rounded-lg text-[#6B7280] hover:text-[#0F0F0F] hover:bg-white border border-transparent hover:border-[#EBEBEB] transition-all"
              title="Previous fiscal year"
            >
              <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4">
                <path fillRule="evenodd" d="M9.707 3.293a1 1 0 010 1.414L6.414 8l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            </button>
            <span className="text-sm font-semibold text-[#0F0F0F] min-w-[72px] text-center">{fyLabel(fyStart)}</span>
            <button
              onClick={() => setFyStart(y => y + 1)}
              className="p-1.5 rounded-lg text-[#6B7280] hover:text-[#0F0F0F] hover:bg-white border border-transparent hover:border-[#EBEBEB] transition-all"
              title="Next fiscal year"
            >
              <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4">
                <path fillRule="evenodd" d="M6.293 3.293a1 1 0 000 1.414L9.586 8l-3.293 3.293a1 1 0 001.414 1.414l4-4a1 1 0 000-1.414l-4-4a1 1 0 00-1.414 0z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
        </div>

        {/* Trend chart */}
        <PlanChart
          allRevenueRows={allRevenueRows}
          allCostRows={allCostRows}
          months={months}
        />

        {/* AI Summary + Revenue Mix */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="flex-1 min-w-0">
            <AISummary
              allRevenueRows={allRevenueRows}
              allCostRows={allCostRows}
              months={months}
            />
          </div>
          <div className="sm:w-72 flex-shrink-0">
            <RevenueDonut allRevenueRows={allRevenueRows} months={months} />
          </div>
        </div>

        {/* Mobile month navigator */}
        <div className="sm:hidden flex items-center justify-between mb-4 bg-white rounded-2xl border border-[#EBEBEB] px-4 py-3 shadow-sm">
          <button
            onClick={() => setMobileMonthIdx(i => Math.max(i - 1, 0))}
            disabled={safeMobileIdx === 0}
            className="p-1.5 rounded-lg text-[#6B7280] hover:text-[#0F0F0F] hover:bg-[#F9F9F8] transition-all disabled:opacity-30"
          >
            <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4">
              <path fillRule="evenodd" d="M9.707 3.293a1 1 0 010 1.414L6.414 8l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
          </button>
          <span className="text-sm font-semibold text-[#0F0F0F]">{mobileLabel}</span>
          <button
            onClick={() => setMobileMonthIdx(i => Math.min(i + 1, months.length - 1))}
            disabled={safeMobileIdx === months.length - 1}
            className="p-1.5 rounded-lg text-[#6B7280] hover:text-[#0F0F0F] hover:bg-[#F9F9F8] transition-all disabled:opacity-30"
          >
            <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4">
              <path fillRule="evenodd" d="M6.293 3.293a1 1 0 000 1.414L9.586 8l-3.293 3.293a1 1 0 001.414 1.414l4-4a1 1 0 000-1.414l-4-4a1 1 0 00-1.414 0z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        {/* Mobile pods */}
        <div className="sm:hidden space-y-4">
          {state.pods.map(pod => {
            const isNoPod = pod.name === 'Other NoPod'
            const revenueRows = filterFuture(buildRevenueRows(pod, state.manualItems, state.planRevCells, months))
            const costRows = buildCostRows(pod, state.costItems, state.costCells, months)
            const mobileCommonProps = {
              pod, pods: state.pods, months, revenueRows, costRows, mobileMonth, allPlanRevCells: state.planRevCells, clientTrends,
              onSaveManualAmount: (itemId: string, month: string, status: import('@/types/database').PlanStatus, amount: number) => saveManualCellAmount(itemId, month, status, amount),
              onSaveManualStatus: (itemId: string, month: string, amount: number, status: import('@/types/database').PlanStatus) => saveManualCellStatus(itemId, month, amount, status),
              onSaveCostAmount: (itemId: string, month: string, status: import('@/types/database').PlanStatus, amount: number) => saveCostCellAmount(itemId, month, status, amount),
              onSaveCostStatus: (itemId: string, month: string, amount: number, status: import('@/types/database').PlanStatus) => saveCostCellStatus(itemId, month, amount, status),
              onAddRevenue: (client: string, project: string | null, podId: string | null, cells: { month: string; amount: number; status: import('@/types/database').PlanStatus }[]) => addManualItem(podId, client, project, cells),
              onEditRevenue: (rowId: string, client: string, project: string | null, podId: string | null, cells: { month: string; amount: number; status: import('@/types/database').PlanStatus }[]) => editManualItem(rowId, client, project, podId, cells),
              onDeleteRevenue: (rowId: string) => deleteManualItem(rowId),
              onAddCost: (category: string, comment: string | null, podId: string | null, cells: { month: string; amount: number }[]) => addCostItem(podId, category, comment, cells),
              onEditCost: (rowId: string, category: string, comment: string | null, podId: string | null, cells: { month: string; amount: number }[]) => editCostItem(rowId, category, comment, podId, cells),
              onDeleteCost: (rowId: string) => deleteCostItem(rowId),
            }
            if (isNoPod) return (
              <div key={pod.id}>
                <PodSection {...mobileCommonProps} isNoPod showOnly="revenue" />
                <PodSection {...mobileCommonProps} isNoPod showOnly="costs" />
              </div>
            )
            return <PodSection key={pod.id} {...mobileCommonProps} />
          })}
        </div>

        {/* Desktop grid */}
        <div className="hidden sm:block overflow-x-auto">
          <div style={{ minWidth: '1100px' }}>

            {/* Pod sections */}
            {state.pods.map(pod => {
              const isNoPod = pod.name === 'Other NoPod'
              const revenueRows = filterFuture(buildRevenueRows(pod, state.manualItems, state.planRevCells, months))
              const costRows = buildCostRows(pod, state.costItems, state.costCells, months)

              const commonProps = {
                pod,
                pods: state.pods,
                months,
                revenueRows,
                costRows,
                allPlanRevCells: state.planRevCells,
                clientTrends,
                onSaveManualAmount: (itemId: string, month: string, status: import('@/types/database').PlanStatus, amount: number) =>
                  saveManualCellAmount(itemId, month, status, amount),
                onSaveManualStatus: (itemId: string, month: string, amount: number, status: import('@/types/database').PlanStatus) =>
                  saveManualCellStatus(itemId, month, amount, status),
                onSaveCostAmount: (itemId: string, month: string, status: import('@/types/database').PlanStatus, amount: number) =>
                  saveCostCellAmount(itemId, month, status, amount),
                onSaveCostStatus: (itemId: string, month: string, amount: number, status: import('@/types/database').PlanStatus) =>
                  saveCostCellStatus(itemId, month, amount, status),
                onAddRevenue: (client: string, project: string | null, podId: string | null, cells: { month: string; amount: number; status: import('@/types/database').PlanStatus }[]) =>
                  addManualItem(podId, client, project, cells),
                onEditRevenue: (rowId: string, client: string, project: string | null, podId: string | null, cells: { month: string; amount: number; status: import('@/types/database').PlanStatus }[]) =>
                  editManualItem(rowId, client, project, podId, cells),
                onDeleteRevenue: (rowId: string) => deleteManualItem(rowId),
                onAddCost: (category: string, comment: string | null, podId: string | null, cells: { month: string; amount: number }[]) =>
                  addCostItem(podId, category, comment, cells),
                onEditCost: (rowId: string, category: string, comment: string | null, podId: string | null, cells: { month: string; amount: number }[]) =>
                  editCostItem(rowId, category, comment, podId, cells),
                onDeleteCost: (rowId: string) => deleteCostItem(rowId),
              }

              if (isNoPod) {
                return (
                  <div key={pod.id}>
                    <PodSection {...commonProps} isNoPod showOnly="revenue" />
                    <PodSection {...commonProps} isNoPod showOnly="costs" />
                  </div>
                )
              }

              return <PodSection key={pod.id} {...commonProps} />
            })}

            {/* Summary */}
            <SummarySection
              allRevenueRows={allRevenueRows}
              allCostRows={allCostRows}
              months={months}
            />
          </div>
        </div>

      </div>
    </div>
  )
}
