import type {
  Pod, RevenueItem, RevenueAllocation, PlanAllocationStatus,
  ManualRevenueItem, PlanRevenueCell, CostItem, PlanCostCell,
  PlanStatus, RevenueRow, CostRow,
} from '@/types/database'

export const FISCAL_MONTHS = [
  '2025-08-01', '2025-09-01', '2025-10-01', '2025-11-01', '2025-12-01',
  '2026-01-01', '2026-02-01', '2026-03-01', '2026-04-01', '2026-05-01',
  '2026-06-01', '2026-07-01',
] as const

export function getFiscalMonths(fyStart: number): readonly string[] {
  const months: string[] = []
  for (let m = 8; m <= 12; m++) months.push(`${fyStart}-${String(m).padStart(2, '0')}-01`)
  for (let m = 1; m <= 7; m++) months.push(`${fyStart + 1}-${String(m).padStart(2, '0')}-01`)
  return months
}

export function fyLabel(fyStart: number): string {
  return `FY ${String(fyStart).slice(2)}/${String(fyStart + 1).slice(2)}`
}

export function currentFyStart(): number {
  const now = new Date()
  return (now.getMonth() + 1) >= 8 ? now.getFullYear() : now.getFullYear() - 1
}

export function fmtKSEK(v: number): string {
  if (v === 0) return '—'
  return Math.round(v / 1000).toLocaleString('sv-SE')
}

export function monthLabel(isoDate: string): string {
  return new Date(isoDate + 'T12:00:00').toLocaleString('en-SE', { month: 'short' })
}

export function computeCB1(revenue: number, costs: number): number | null {
  if (revenue === 0) return null
  return ((revenue - costs) / revenue) * 100
}

export function cycleStatus(s: PlanStatus): PlanStatus {
  return s === 'F' ? 'B' : s === 'B' ? 'A' : 'F'
}

export function defaultStatus(item: RevenueItem): PlanStatus {
  return item.type === 'booking' ? 'B' : 'F'
}

export function buildRevenueRows(
  pod: Pod,
  revenueItems: RevenueItem[],
  allocations: RevenueAllocation[],
  allocStatuses: PlanAllocationStatus[],
  manualItems: ManualRevenueItem[],
  planRevCells: PlanRevenueCell[],
  months: readonly string[] = FISCAL_MONTHS,
): RevenueRow[] {
  const syncedRows: RevenueRow[] = revenueItems
    .filter(item => item.pod_id === pod.id)
    .map(item => {
      const cells: Record<string, { amount: number; status: PlanStatus }> = {}
      for (const m of months) {
        const alloc = allocations.find(a => a.revenue_item_id === item.id && a.month === m)
        const st    = allocStatuses.find(s => s.revenue_item_id === item.id && s.month === m)
        cells[m] = {
          amount: alloc?.amount ?? 0,
          status: (st?.status as PlanStatus) ?? defaultStatus(item),
        }
      }
      return { kind: 'synced' as const, id: item.id, client_name: item.client_name, project: null, pod_id: pod.id, cells }
    })

  const manualRows: RevenueRow[] = manualItems
    .filter(item => item.pod_id === pod.id)
    .sort((a, b) => a.sort - b.sort)
    .map(item => {
      const cells: Record<string, { amount: number; status: PlanStatus }> = {}
      for (const m of months) {
        const cell = planRevCells.find(c => c.manual_revenue_item_id === item.id && c.month === m)
        cells[m] = { amount: cell?.amount ?? 0, status: cell?.status ?? 'F' }
      }
      return { kind: 'manual' as const, id: item.id, client_name: item.client_name, project: item.project ?? null, pod_id: pod.id, cells }
    })

  return [...syncedRows, ...manualRows]
}

export function buildCostRows(
  pod: Pod,
  costItems: CostItem[],
  costCells: PlanCostCell[],
  months: readonly string[] = FISCAL_MONTHS,
): CostRow[] {
  return costItems
    .filter(item => item.pod_id === pod.id)
    .sort((a, b) => a.sort - b.sort)
    .map(item => {
      const cells: Record<string, { amount: number; status: PlanStatus }> = {}
      for (const m of months) {
        const cell = costCells.find(c => c.cost_item_id === item.id && c.month === m)
        cells[m] = { amount: cell?.amount ?? 0, status: cell?.status ?? 'F' }
      }
      return { id: item.id, pod_id: pod.id, category: item.category, comment: item.comment ?? null, sort: item.sort, cells }
    })
}

export function sumCells(rows: Array<{ cells: Record<string, { amount: number }> }>, month: string): number {
  return rows.reduce((s, r) => s + (r.cells[month]?.amount ?? 0), 0)
}

export function sumAllMonths(
  rows: Array<{ cells: Record<string, { amount: number }> }>,
  months: readonly string[] = FISCAL_MONTHS,
): number {
  return months.reduce((s, m) => s + sumCells(rows, m), 0)
}

export function sumByStatus(
  rows: Array<{ cells: Record<string, { amount: number; status: PlanStatus }> }>,
  month: string,
  statuses: PlanStatus[],
): number {
  return rows.reduce((s, r) => {
    const cell = r.cells[month]
    return s + (cell && statuses.includes(cell.status) ? cell.amount : 0)
  }, 0)
}
