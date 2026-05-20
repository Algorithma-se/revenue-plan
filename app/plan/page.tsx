'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import {
  getFiscalMonths, fyLabel, currentFyStart,
  monthLabel, buildRevenueRows, buildCostRows,
  sumCells, sumAllMonths, fmtKSEK,
} from '@/lib/plan-utils'
import type {
  Pod, RevenueItem, RevenueAllocation, PlanAllocationStatus,
  ManualRevenueItem, PlanRevenueCell, CostItem, PlanCostCell,
  PlanTarget, RevenueRow, CostRow, PlanStatus,
} from '@/types/database'
import { PodSection } from '@/components/plan/PodSection'
import { SummarySection } from '@/components/plan/SummarySection'
import { ItemModal } from '@/components/ItemModal'

// ─── Raw data state ────────────────────────────────────────────────────────────

interface PlanState {
  pods:          Pod[]
  revenueItems:  RevenueItem[]
  allocations:   RevenueAllocation[]
  allocStatuses: PlanAllocationStatus[]
  manualItems:   ManualRevenueItem[]
  planRevCells:  PlanRevenueCell[]
  costItems:     CostItem[]
  costCells:     PlanCostCell[]
  targets:       PlanTarget[]
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function PlanPage() {
  const [state, setState]     = useState<PlanState | null>(null)
  const [loading, setLoading] = useState(true)
  const [fyStart, setFyStart]           = useState(currentFyStart)
  const [editingSyncedId, setEditingSyncedId] = useState<string | null>(null)

  const months = getFiscalMonths(fyStart)

  const load = useCallback(async () => {
    const [
      { data: pods },
      { data: revenueItems },
      { data: allocations },
      { data: allocStatuses },
      { data: manualItems },
      { data: planRevCells },
      { data: costItems },
      { data: costCells },
      { data: targets },
    ] = await Promise.all([
      supabase.from('pods').select('*').order('sort'),
      supabase.from('revenue_items').select('*'),
      supabase.from('revenue_allocations').select('*'),
      supabase.from('plan_allocation_statuses').select('*'),
      supabase.from('manual_revenue_items').select('*').order('sort'),
      supabase.from('plan_revenue_cells').select('*'),
      supabase.from('cost_items').select('*').order('sort'),
      supabase.from('plan_cost_cells').select('*'),
      supabase.from('plan_targets').select('*').order('month'),
    ])

    setState({
      pods:          (pods ?? [])          as Pod[],
      revenueItems:  (revenueItems ?? [])  as RevenueItem[],
      allocations:   (allocations ?? [])   as RevenueAllocation[],
      allocStatuses: (allocStatuses ?? []) as PlanAllocationStatus[],
      manualItems:   (manualItems ?? [])   as ManualRevenueItem[],
      planRevCells:  (planRevCells ?? [])  as PlanRevenueCell[],
      costItems:     (costItems ?? [])     as CostItem[],
      costCells:     (costCells ?? [])     as PlanCostCell[],
      targets:       (targets ?? [])       as PlanTarget[],
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

  function updateAllocStatus(itemId: string, month: string, status: PlanStatus) {
    setState(s => s ? ({
      ...s,
      allocStatuses: s.allocStatuses.some(a => a.revenue_item_id === itemId && a.month === month)
        ? s.allocStatuses.map(a =>
            a.revenue_item_id === itemId && a.month === month ? { ...a, status } : a
          )
        : [...s.allocStatuses, { id: crypto.randomUUID(), revenue_item_id: itemId, month, status }],
    }) : s)
  }

  function updateAllocAmount(itemId: string, month: string, amount: number) {
    setState(s => s ? ({
      ...s,
      allocations: s.allocations.some(a => a.revenue_item_id === itemId && a.month === month)
        ? s.allocations.map(a =>
            a.revenue_item_id === itemId && a.month === month ? { ...a, amount } : a
          )
        : [...s.allocations, { id: crypto.randomUUID(), revenue_item_id: itemId, month, amount, created_at: new Date().toISOString() }],
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

  function updateTarget(month: string, revenueTarget: number) {
    setState(s => s ? ({
      ...s,
      targets: s.targets.map(t => t.month === month ? { ...t, revenue_target: revenueTarget } : t),
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
    await supabase.from('plan_revenue_cells').delete().eq('manual_revenue_item_id', itemId)
    if (cells.length > 0) {
      await supabase
        .from('plan_revenue_cells')
        .insert(cells.map(c => ({ manual_revenue_item_id: itemId, month: c.month, amount: c.amount, status: c.status })))
    }
    await load()
  }

  async function deleteManualItem(itemId: string) {
    await supabase.from('plan_revenue_cells').delete().eq('manual_revenue_item_id', itemId)
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

  async function saveAllocStatus(itemId: string, month: string, status: PlanStatus) {
    updateAllocStatus(itemId, month, status)
    await supabase.from('plan_allocation_statuses').upsert(
      { revenue_item_id: itemId, month, status },
      { onConflict: 'revenue_item_id,month' }
    )
  }

  async function saveAllocCellAmount(itemId: string, month: string, _currentStatus: PlanStatus, amount: number) {
    updateAllocAmount(itemId, month, amount)
    await supabase.from('revenue_allocations').upsert(
      { revenue_item_id: itemId, month, amount },
      { onConflict: 'revenue_item_id,month' }
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

  async function saveTarget(month: string, revenueTarget: number) {
    updateTarget(month, revenueTarget)
    await supabase.from('plan_targets').upsert(
      { month, revenue_target: revenueTarget, margin_target: 7 },
      { onConflict: 'month' }
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

  const allRevenueRows: RevenueRow[] = state.pods.flatMap(pod =>
    buildRevenueRows(pod, state.revenueItems, state.allocations, state.allocStatuses, state.manualItems, state.planRevCells, months)
  )
  const allCostRows: CostRow[] = state.pods.flatMap(pod =>
    buildCostRows(pod, state.costItems, state.costCells, months)
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

        {/* Grid */}
        <div className="overflow-x-auto">
          <div style={{ minWidth: '1100px' }}>

            {/* Month header */}
            <div className="grid mb-1" style={{ gridTemplateColumns: `200px repeat(${months.length}, 76px) 80px` }}>
              <div className="px-2 py-1.5 text-xs font-semibold text-[#9CA3AF] uppercase tracking-wider">Pod / Item</div>
              {months.map(m => (
                <div key={m} className="px-1 py-1.5 text-center text-xs font-semibold text-[#9CA3AF] uppercase tracking-wider">
                  {monthLabel(m)}
                </div>
              ))}
              <div className="px-1 py-1.5 text-center text-xs font-semibold text-[#9CA3AF] uppercase tracking-wider">FY</div>
            </div>

            {/* Pod sections */}
            {state.pods.map(pod => {
              const revenueRows = buildRevenueRows(
                pod, state.revenueItems, state.allocations, state.allocStatuses,
                state.manualItems, state.planRevCells, months
              )
              const costRows = buildCostRows(pod, state.costItems, state.costCells, months)

              return (
                <PodSection
                  key={pod.id}
                  pod={pod}
                  pods={state.pods}
                  months={months}
                  revenueRows={revenueRows}
                  costRows={costRows}
                  onSaveManualAmount={(itemId, month, status, amount) =>
                    saveManualCellAmount(itemId, month, status, amount)}
                  onSaveManualStatus={(itemId, month, amount, status) =>
                    saveManualCellStatus(itemId, month, amount, status)}
                  onSaveAllocStatus={(itemId, month, status) =>
                    saveAllocStatus(itemId, month, status)}
                  onSaveAllocAmount={(itemId, month, status, amount) =>
                    saveAllocCellAmount(itemId, month, status, amount)}
                  onSaveCostAmount={(itemId, month, status, amount) =>
                    saveCostCellAmount(itemId, month, status, amount)}
                  onSaveCostStatus={(itemId, month, amount, status) =>
                    saveCostCellStatus(itemId, month, amount, status)}
                  onAddRevenue={(client, project, podId, cells) =>
                    addManualItem(podId, client, project, cells)}
                  onEditRevenue={(rowId, client, project, podId, cells) =>
                    editManualItem(rowId, client, project, podId, cells)}
                  onDeleteRevenue={rowId => deleteManualItem(rowId)}
                  onEditSyncedRevenue={rowId => setEditingSyncedId(rowId)}
                  onAddCost={(category, comment, podId, cells) =>
                    addCostItem(podId, category, comment, cells)}
                  onEditCost={(rowId, category, comment, podId, cells) =>
                    editCostItem(rowId, category, comment, podId, cells)}
                  onDeleteCost={rowId => deleteCostItem(rowId)}
                />
              )
            })}

            {/* Summary */}
            <SummarySection
              allRevenueRows={allRevenueRows}
              allCostRows={allCostRows}
              targets={state.targets}
              months={months}
              onSaveTarget={(month, amount) => saveTarget(month, amount)}
            />
          </div>
        </div>
      </div>

      {/* Synced item edit modal */}
      {editingSyncedId && (() => {
        const item = state.revenueItems.find(i => i.id === editingSyncedId)
        if (!item) return null
        const allocRows = state.allocations
          .filter(a => a.revenue_item_id === editingSyncedId)
          .map(a => ({ month: a.month.slice(0, 7), amount: String(Math.round(a.amount / 1000)) }))
          .sort((a, b) => a.month.localeCompare(b.month))
        return (
          <ItemModal
            mode="synced"
            displayName={item.client_name ?? '—'}
            subtitle={[
              item.rep_name,
              item.amount != null ? `${Math.round(item.amount / 1000)} kSEK` : null,
              item.type === 'booking' ? 'Booked' : 'FC',
              item.event_date ? new Date(item.event_date).toLocaleDateString('sv-SE') : null,
            ].filter(Boolean).join(' · ')}
            pods={state.pods}
            initialPodId={item.pod_id ?? null}
            initialRows={allocRows}
            referenceKSEK={item.amount != null ? Math.round(item.amount / 1000) : undefined}
            initialNotes={item.notes ?? ''}
            onClose={() => setEditingSyncedId(null)}
            onSave={async ({ podId, rows, notes }) => {
              await supabase.from('revenue_allocations').delete().eq('revenue_item_id', editingSyncedId)
              if (rows.length > 0) {
                await supabase.from('revenue_allocations').insert(
                  rows.map(r => ({ revenue_item_id: editingSyncedId, month: r.month, amount: r.amount }))
                )
              }
              const updates: Record<string, unknown> = {}
              if (notes !== (item.notes ?? '')) updates.notes = notes || null
              if (podId !== (item.pod_id ?? null)) updates.pod_id = podId
              if (Object.keys(updates).length > 0) {
                await supabase.from('revenue_items').update(updates).eq('id', editingSyncedId)
              }
              setEditingSyncedId(null)
              await load()
            }}
          />
        )
      })()}
    </div>
  )
}
