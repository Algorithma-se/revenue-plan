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
  notes: string | null
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

// ─── SOW & Invoice types ───────────────────────────────────────────────────────

export type SowParseStatus  = 'pending' | 'parsing' | 'done' | 'error'
export type SowDocumentType = 'original' | 'amendment' | 'change_request'
export type InvoiceStatus   = 'draft' | 'sent' | 'paid'
export type PaymentTrigger  = 'date' | 'milestone'
export type InvoicingModel = 'milestone' | 'time_and_materials' | 'capacity' | 'fixed_fee'
export type InvoiceTiming  = 'month_end' | 'month_start' | 'specific_date' | 'on_completion'

export interface SowDeliverable {
  label: string
  due_date: string | null
  amount_sek: number | null
  estimated_hours: number | null
  // Richer fields from improved parser:
  invoice_date: string | null       // computed date to issue the invoice
  invoice_timing: InvoiceTiming | null
}

export interface SowMonthlyHours {
  month: string   // "YYYY-MM"
  hours: number
}

export interface SowParsedRaw {
  client_name: string | null
  invoicing_model: InvoicingModel | null
  total_value_sek: number | null
  currency: string | null
  hourly_rate_sek: number | null
  fte_count: number | null
  monthly_fee_sek: number | null
  invoice_timing: InvoiceTiming | null
  start_date: string | null
  end_date: string | null
  payment_terms: string | null
  deliverables: SowDeliverable[]
  monthly_hours: SowMonthlyHours[]
}

export interface SowDocument {
  id: string
  manual_revenue_item_id: string
  document_type: SowDocumentType
  version_number: number
  file_name: string
  file_type: string
  storage_path: string
  file_size_bytes: number | null
  parsed_client_name: string | null
  parsed_total_value_sek: number | null
  parsed_start_date: string | null
  parsed_end_date: string | null
  parsed_payment_terms: string | null
  parsed_deliverables: SowDeliverable[] | null
  parsed_raw: SowParsedRaw | null
  parse_status: SowParseStatus
  parse_error: string | null
  created_at: string
  updated_at: string
}

export type BLStatus = 'pending' | 'approved' | 'rejected'

export interface Invoice {
  id: string
  manual_revenue_item_id: string | null
  sow_document_id: string | null
  invoice_number: string
  issue_date: string
  due_date: string
  amount_sek: number
  payment_trigger: PaymentTrigger
  milestone_label: string | null
  status: InvoiceStatus
  paid_date: string | null
  notes: string | null
  exclude_vat: boolean
  client_name: string | null
  sort: number
  created_at: string
  updated_at: string
  bl_status?:          BLStatus | null
  bl_invoice_id?:      string | null
  bl_line_desc?:       string | null
  bl_reject_reason?:   string | null
  bl_rejected_at?:     string | null
  bl_your_reference?:  string | null
  bl_our_reference?:   string | null
  bl_po_number?:       string | null
  bl_marking?:         string | null
  bl_allie_initiated?:   boolean | null
  payment_terms_days?:   number | null
}

export interface InvoiceDraft {
  id?: string
  invoice_number: string
  issue_date: string
  due_date: string
  amount_sek: number
  payment_trigger: PaymentTrigger
  milestone_label: string
  status: InvoiceStatus
  notes: string
  exclude_vat?: boolean
}

export type SuggestionAction = 'add' | 'modify' | 'remove'
export interface InvoiceSuggestion {
  action: SuggestionAction
  invoice_id?: string
  draft: InvoiceDraft
  reason: string
}

// ─── Derived view types used in /plan ─────────────────────────────────────────

export interface RevenueRow {
  kind: 'manual'
  id: string
  client_name: string | null
  project: string | null
  pod_id: string | null
  notes: string | null
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
