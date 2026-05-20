export interface RevenueItem {
  id: string
  source_id: string
  type: 'forecast' | 'booking'
  client_name: string | null
  rep_name: string | null
  amount: number | null
  rag_status: string | null
  event_date: string | null
  synced_at: string
  notes: string | null
  start_month: string | null  // 'YYYY-MM-DD'
  end_month: string | null    // 'YYYY-MM-DD'
  pod_id: string | null
  status: 'active' | 'processed'
  plan_manual_item_id: string | null
}

export interface RevenueAllocation {
  id: string
  revenue_item_id: string
  month: string   // 'YYYY-MM-DD' — always first of month
  amount: number
  created_at: string
}

// ─── Plan types ───────────────────────────────────────────────────────────────

export type PlanStatus = 'A' | 'B' | 'F'

export const FISCAL_MONTHS = [
  '2025-08-01', '2025-09-01', '2025-10-01', '2025-11-01', '2025-12-01',
  '2026-01-01', '2026-02-01', '2026-03-01', '2026-04-01', '2026-05-01',
  '2026-06-01', '2026-07-01',
] as const

export type FiscalMonth = typeof FISCAL_MONTHS[number]

export interface Pod {
  id: string
  name: string
  sort: number
}

export interface ManualRevenueItem {
  id: string
  pod_id: string | null
  client_name: string
  project: string | null
  sort: number
  created_at: string
}

export interface PlanRevenueCell {
  id: string
  manual_revenue_item_id: string
  month: string
  amount: number
  status: PlanStatus
}

export interface PlanAllocationStatus {
  id: string
  revenue_item_id: string
  month: string
  status: PlanStatus
}

export interface CostItem {
  id: string
  pod_id: string | null
  category: string
  comment: string | null
  sort: number
  created_at: string
}

export interface PlanCostCell {
  id: string
  cost_item_id: string
  month: string
  amount: number
  status: PlanStatus
}

export interface PlanTarget {
  month: string
  revenue_target: number
  margin_target: number
}

// ─── Derived view types used in /plan ─────────────────────────────────────────

export interface RevenueRow {
  kind: 'manual'
  id: string
  client_name: string | null
  project: string | null
  pod_id: string | null
  cells: Record<string, { amount: number; status: PlanStatus }>
}

export interface CostRow {
  id: string
  pod_id: string | null
  category: string
  comment: string | null
  sort: number
  cells: Record<string, { amount: number; status: PlanStatus }>
}

export interface PodPlanData {
  pod: Pod
  revenueRows: RevenueRow[]
  costRows: CostRow[]
}
