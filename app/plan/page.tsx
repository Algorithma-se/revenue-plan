'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import {
  FISCAL_MONTHS, monthLabel, buildRevenueRows, buildCostRows,
  sumCells, sumAllMonths, sumByStatus, fmtKSEK, computeCB1,
} from '@/lib/plan-utils'
import type {
  Pod, RevenueItem, RevenueAllocation, PlanAllocationStatus,
  ManualRevenueItem, PlanRevenueCell, CostItem, PlanCostCell,
  PlanTarget, RevenueRow, CostRow, PlanStatus,
} from '@/types/database'
import { PodSection } from '@/components/plan/PodSection'
import { SummarySection } from '@/components/plan/SummarySection'

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
  const [state, setState]   = useState<PlanState | null>(null)
  const [loading, setLoading] = useState(true)

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

  async function addManualItem(podId: string, clientName: string) {
    const { data } = await supabase
      .from('manual_revenue_items')
      .insert({ pod_id: podId, client_name: clientName, sort: Date.now() })
      .select()
      .single()
    if (data) setState(s => s ? ({ ...s, manualItems: [...s.manualItems, data as ManualRevenueItem] }) : s)
  }

  async function addCostItem(podId: string, category: string) {
    const { data } = await supabase
      .from('cost_items')
      .insert({ pod_id: podId, category, sort: Date.now() })
      .select()
      .single()
    if (data) setState(s => s ? ({ ...s, costItems: [...s.costItems, data as CostItem] }) : s)
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
    buildRevenueRows(pod, state.revenueItems, state.allocations, state.allocStatuses, state.manualItems, state.planRevCells)
  )
  const allCostRows: CostRow[] = state.pods.flatMap(pod =>
    buildCostRows(pod, state.costItems, state.costCells)
  )

  return (
    <div className="min-h-screen bg-[#F9F9F8]">
      <div className="px-4 py-6 max-w-none">

        {/* Title */}
        <div className="mb-6">
          <h1 className="text-xl font-bold text-[#0F0F0F] tracking-tight">
            Algorithma monthly reporting
          </h1>
          <p className="text-xs text-[#9CA3AF] mt-0.5">Income statement (kSEK) · FY 25/26</p>
        </div>

        {/* Grid */}
        <div className="overflow-x-auto">
          <div style={{ minWidth: '1100px' }}>

            {/* Month header */}
            <div className="grid mb-1" style={{ gridTemplateColumns: '200px repeat(12, 76px) 80px' }}>
              <div className="px-2 py-1.5 text-xs font-semibold text-[#9CA3AF] uppercase tracking-wider">Pod / Item</div>
              {FISCAL_MONTHS.map(m => (
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
                state.manualItems, state.planRevCells
              )
              const costRows = buildCostRows(pod, state.costItems, state.costCells)

              return (
                <PodSection
                  key={pod.id}
                  pod={pod}
                  revenueRows={revenueRows}
                  costRows={costRows}
                  onSaveManualAmount={(itemId, month, status, amount) =>
                    saveManualCellAmount(itemId, month, status, amount)}
                  onSaveManualStatus={(itemId, month, amount, status) =>
                    saveManualCellStatus(itemId, month, amount, status)}
                  onSaveAllocStatus={(itemId, month, status) =>
                    saveAllocStatus(itemId, month, status)}
                  onSaveCostAmount={(itemId, month, status, amount) =>
                    saveCostCellAmount(itemId, month, status, amount)}
                  onSaveCostStatus={(itemId, month, amount, status) =>
                    saveCostCellStatus(itemId, month, amount, status)}
                  onAddRevenue={name => addManualItem(pod.id, name)}
                  onAddCost={cat => addCostItem(pod.id, cat)}
                />
              )
            })}

            {/* Summary */}
            <SummarySection
              allRevenueRows={allRevenueRows}
              allCostRows={allCostRows}
              targets={state.targets}
              onSaveTarget={(month, amount) => saveTarget(month, amount)}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
