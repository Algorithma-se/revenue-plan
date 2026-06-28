'use server'

import { createAdminSupabase } from '@/lib/supabase-admin'
import { getFiscalMonths } from '@/lib/plan-utils'

export interface BudgetScenario {
  id:         string
  name:       string
  fy_start:   number
  is_default: boolean
  created_at: string
}

export interface BudgetLine {
  id:           string
  scenario_id:  string
  segment:      'platform' | 'services' | 'leadership'
  pod_id:       string | null
  pod_name:     string | null
  account_code: string
  line_type:    'revenue' | 'cost'
  label:        string
  sort:         number
}

// keyed by budget_line_id → month (YYYY-MM-01) → amount in SEK
export type BudgetCells = Record<string, Record<string, number>>

export async function getBudgetScenarios(fyStart: number): Promise<BudgetScenario[]> {
  const supabase = await createAdminSupabase()
  const { data, error } = await supabase
    .from('budget_scenarios')
    .select('*')
    .eq('fy_start', fyStart)
    .order('created_at', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []) as BudgetScenario[]
}

export async function createBudgetScenario(name: string, fyStart: number): Promise<BudgetScenario> {
  const supabase = await createAdminSupabase()
  const { data: scenario, error } = await supabase
    .from('budget_scenarios')
    .insert({ name, fy_start: fyStart })
    .select()
    .single()
  if (error) throw new Error(error.message)
  return scenario as BudgetScenario
}

export async function renameBudgetScenario(id: string, name: string): Promise<void> {
  const supabase = await createAdminSupabase()
  const { error } = await supabase.from('budget_scenarios').update({ name }).eq('id', id)
  if (error) throw new Error(error.message)
}

export async function deleteBudgetScenario(id: string): Promise<void> {
  const supabase = await createAdminSupabase()
  const { error } = await supabase.from('budget_scenarios').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

export async function getBudgetData(scenarioId: string): Promise<{
  lines: BudgetLine[]
  cells: BudgetCells
}> {
  const supabase = await createAdminSupabase()

  const { data: rawLines, error: lErr } = await supabase
    .from('budget_lines')
    .select('*, pods(name)')
    .eq('scenario_id', scenarioId)
    .order('sort', { ascending: true })
  if (lErr) throw new Error(lErr.message)

  const lines: BudgetLine[] = (rawLines ?? []).map((l: any) => ({
    id:           l.id,
    scenario_id:  l.scenario_id,
    segment:      l.segment,
    pod_id:       l.pod_id ?? null,
    pod_name:     l.pods?.name ?? null,
    account_code: l.account_code,
    line_type:    l.line_type,
    label:        l.label,
    sort:         l.sort,
  }))

  const lineIds = lines.map(l => l.id)
  if (lineIds.length === 0) return { lines, cells: {} }

  const { data: rawCells, error: cErr } = await supabase
    .from('budget_cells')
    .select('budget_line_id, month, amount')
    .in('budget_line_id', lineIds)
  if (cErr) throw new Error(cErr.message)

  const cells: BudgetCells = {}
  for (const cell of (rawCells ?? [])) {
    if (!cells[cell.budget_line_id]) cells[cell.budget_line_id] = {}
    cells[cell.budget_line_id][cell.month] = cell.amount
  }

  return { lines, cells }
}

export async function addBudgetLine(
  scenarioId: string,
  fyStart:    number,
  data: {
    segment:      'platform' | 'services' | 'leadership'
    pod_id:       string | null
    account_code: string
    line_type:    'revenue' | 'cost'
    label:        string
  },
): Promise<BudgetLine> {
  const supabase = await createAdminSupabase()
  const months = getFiscalMonths(fyStart)

  const { data: line, error: lErr } = await supabase
    .from('budget_lines')
    .insert({ scenario_id: scenarioId, ...data, sort: Date.now() })
    .select('*, pods(name)')
    .single()
  if (lErr) throw new Error(lErr.message)

  // Pre-fill zero cells for all FY months
  const cells = months.map(month => ({ budget_line_id: line.id, month, amount: 0 }))
  await supabase.from('budget_cells').insert(cells)

  return {
    id:           line.id,
    scenario_id:  line.scenario_id,
    segment:      line.segment,
    pod_id:       line.pod_id ?? null,
    pod_name:     (line as any).pods?.name ?? null,
    account_code: line.account_code,
    line_type:    line.line_type,
    label:        line.label,
    sort:         line.sort,
  }
}

export async function deleteBudgetLine(lineId: string): Promise<void> {
  const supabase = await createAdminSupabase()
  const { error } = await supabase.from('budget_lines').delete().eq('id', lineId)
  if (error) throw new Error(error.message)
}

export async function upsertBudgetCell(lineId: string, month: string, amount: number): Promise<void> {
  const supabase = await createAdminSupabase()
  const { error } = await supabase
    .from('budget_cells')
    .upsert({ budget_line_id: lineId, month, amount }, { onConflict: 'budget_line_id,month' })
  if (error) throw new Error(error.message)
}

// podKey → month → { revA, revB, costA, costB } amounts (SEK)
// podKey: pod_id for services items, '__platform__' or '__leadership__' for segment items
export type PodActuals = Record<string, Record<string, {
  revA: number; revB: number; costA: number; costB: number
}>>

export async function getPodActuals(fyStart: number): Promise<PodActuals> {
  const supabase = await createAdminSupabase()
  const months = getFiscalMonths(fyStart)
  const result: PodActuals = {}

  function acc(key: string, month: string, field: 'revA' | 'revB' | 'costA' | 'costB', amount: number) {
    if (!result[key]) result[key] = {}
    if (!result[key][month]) result[key][month] = { revA: 0, revB: 0, costA: 0, costB: 0 }
    result[key][month][field] += amount
  }

  // ── Revenue ────────────────────────────────────────────────────────────────
  const { data: revItems } = await supabase
    .from('manual_revenue_items')
    .select('id, pod_id, segment')

  const revKeyMap: Record<string, string> = {}
  for (const item of (revItems ?? [])) {
    revKeyMap[item.id] = item.segment === 'services'
      ? (item.pod_id ?? '__no_pod__')
      : `__${item.segment}__`
  }

  const revIds = Object.keys(revKeyMap)
  if (revIds.length > 0) {
    const { data: revCells } = await supabase
      .from('plan_revenue_cells')
      .select('manual_revenue_item_id, month, amount, status')
      .in('manual_revenue_item_id', revIds)
      .in('status', ['A', 'B'])
      .in('month', [...months])

    for (const c of (revCells ?? [])) {
      const key = revKeyMap[c.manual_revenue_item_id]
      if (key) acc(key, c.month, c.status === 'A' ? 'revA' : 'revB', c.amount)
    }
  }

  // ── Costs ──────────────────────────────────────────────────────────────────
  const { data: costItems } = await supabase
    .from('cost_items')
    .select('id, pod_id, segment')

  const costKeyMap: Record<string, string> = {}
  for (const item of (costItems ?? [])) {
    costKeyMap[item.id] = item.segment === 'services'
      ? (item.pod_id ?? '__no_pod__')
      : `__${item.segment}__`
  }

  const costIds = Object.keys(costKeyMap)
  if (costIds.length > 0) {
    const { data: costCells } = await supabase
      .from('plan_cost_cells')
      .select('cost_item_id, month, amount, status')
      .in('cost_item_id', costIds)
      .in('status', ['A', 'B'])
      .in('month', [...months])

    for (const c of (costCells ?? [])) {
      const key = costKeyMap[c.cost_item_id]
      if (key) acc(key, c.month, c.status === 'A' ? 'costA' : 'costB', c.amount)
    }
  }

  return result
}
