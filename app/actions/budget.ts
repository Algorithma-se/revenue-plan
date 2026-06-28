'use server'

import Anthropic from '@anthropic-ai/sdk'
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

// ─── Excel Import ─────────────────────────────────────────────────────────────

export interface ImportRow {
  segment:     'platform' | 'services' | 'leadership'
  podId:       string | null
  accountCode: string
  lineType:    'revenue' | 'cost'
  label:       string
  amounts:     Record<string, number> // month (YYYY-MM-01) → kSEK value from Excel
}

export type ImportResult =
  | { ok: true;  scenarioId: string; linesImported: number }
  | { ok: false; error: string }

export async function importBudgetScenario(
  name:    string,
  fyStart: number,
  rows:    ImportRow[],
): Promise<ImportResult> {
  const supabase = await createAdminSupabase()

  const { data: scenario, error: sErr } = await supabase
    .from('budget_scenarios')
    .insert({ name, fy_start: fyStart })
    .select()
    .single()
  if (sErr || !scenario) return { ok: false, error: sErr?.message ?? 'Failed to create scenario' }

  const scenarioId = scenario.id

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const { data: line, error: lErr } = await supabase
      .from('budget_lines')
      .insert({
        scenario_id:  scenarioId,
        segment:      row.segment,
        pod_id:       row.podId,
        account_code: row.accountCode || (row.lineType === 'revenue' ? '3400' : '4400'),
        line_type:    row.lineType,
        label:        row.label,
        sort:         i,
      })
      .select('id')
      .single()
    if (lErr || !line) continue

    const cells = Object.entries(row.amounts)
      .filter(([, v]) => v !== 0)
      .map(([month, v]) => ({ budget_line_id: line.id, month, amount: Math.round(v * 1000) }))

    if (cells.length > 0) {
      await supabase.from('budget_cells').insert(cells)
    }
  }

  return { ok: true, scenarioId, linesImported: rows.length }
}

// ─── Scenario Analysis (AI) ───────────────────────────────────────────────────

export interface AnalysisSection {
  key:        string
  name:       string
  budgetRev:  number
  actualRev:  number
  budgetCost: number
  actualCost: number
  narrative:  string
}

export interface ScenarioAdjustment {
  key:      string              // podKey — matches budget line key scheme
  name:     string
  lineType: 'revenue' | 'cost'
  pct:      number              // % change for remaining FY months, e.g. -20
  reason:   string
}

export interface ScenarioAnalysis {
  headline:            string
  sections:            AnalysisSection[]
  actions:             string[]
  adjustments:         { section: string; suggestion: string }[]
  scenarioAdjustments: ScenarioAdjustment[]
  generatedAt:         string
}

// In Next.js 16, expected errors must be returned as values, not thrown.
// Throwing from a server action triggers the RSC error boundary on the client.
export type AnalysisResult =
  | { ok: true;  data: ScenarioAnalysis }
  | { ok: false; error: string }

export async function getScenarioAnalysis(
  scenarioId: string,
  fyStart:    number,
): Promise<ScenarioAnalysis | null> {
  try {
    const supabase = await createAdminSupabase()
    const { data } = await supabase
      .from('scenario_analyses')
      .select('headline, sections, actions, adjustments, scenario_adjustments, generated_at')
      .eq('scenario_id', scenarioId)
      .eq('fy_start', fyStart)
      .maybeSingle()
    if (!data) return null
    return {
      headline:            data.headline,
      sections:            data.sections,
      actions:             data.actions,
      adjustments:         data.adjustments,
      scenarioAdjustments: data.scenario_adjustments ?? [],
      generatedAt:         data.generated_at,
    }
  } catch {
    return null
  }
}

function extractJson(text: string): string {
  // Strip markdown code fences if present
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fenceMatch) return fenceMatch[1].trim()
  // Try to find first { … } block
  const start = text.indexOf('{')
  const end   = text.lastIndexOf('}')
  if (start !== -1 && end > start) return text.slice(start, end + 1)
  return text.trim()
}

export async function runScenarioAnalysis(
  scenarioId: string,
  fyStart:    number,
): Promise<AnalysisResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return { ok: false, error: 'ANTHROPIC_API_KEY not configured' }

  try {
  const supabase = await createAdminSupabase()

  // ── Load data ────────────────────────────────────────────────────────────────
  const [{ lines, cells }, actuals, scenarios, { data: allPods }] = await Promise.all([
    getBudgetData(scenarioId),
    getPodActuals(fyStart),
    getBudgetScenarios(fyStart),
    supabase.from('pods').select('id, name, sort').order('sort'),
  ])

  const podLookup: Record<string, { name: string; sort: number }> =
    Object.fromEntries((allPods ?? []).map((p: { id: string; name: string; sort: number }) => [p.id, { name: p.name, sort: p.sort }]))

  const scenarioName = scenarios.find(s => s.id === scenarioId)?.name ?? 'Unknown'

  // ── YTD months (fiscal months up to and including current month) ─────────────
  const allMonths = getFiscalMonths(fyStart)
  const today     = new Date()
  const todayStr  = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`
  const ytdMonths = allMonths.filter(m => m <= todayStr)

  if (ytdMonths.length === 0) {
    return { ok: false, error: 'No YTD months available — fiscal year has not started yet' }
  }

  // ── Aggregate budget by podKey for YTD months ────────────────────────────────
  const budgetByKey: Record<string, { rev: number; cost: number }> = {}

  for (const line of lines) {
    const key = line.segment === 'services'
      ? (line.pod_id ?? '__no_pod__')
      : `__${line.segment}__`
    if (!budgetByKey[key]) budgetByKey[key] = { rev: 0, cost: 0 }
    const lineTotal = ytdMonths.reduce((s, m) => s + (cells[line.id]?.[m] ?? 0), 0)
    if (line.line_type === 'revenue') budgetByKey[key].rev  += lineTotal
    else                              budgetByKey[key].cost += lineTotal
  }

  // ── Build section list: platform → all service pods (budget + actuals) → leadership ──
  // Start with pods that appear in budget lines
  const podMeta: { id: string; name: string; sort: number }[] = []
  const seenPods = new Set<string>()
  for (const line of lines) {
    if (line.segment === 'services' && line.pod_id && !seenPods.has(line.pod_id)) {
      seenPods.add(line.pod_id)
      const meta = podLookup[line.pod_id]
      podMeta.push({ id: line.pod_id, name: line.pod_name ?? meta?.name ?? line.pod_id, sort: meta?.sort ?? line.sort })
    }
  }
  // Add pods that have P&L actuals but no budget lines in this scenario
  for (const key of Object.keys(actuals)) {
    if (!key.startsWith('__') && !seenPods.has(key)) {
      seenPods.add(key)
      const meta = podLookup[key]
      podMeta.push({ id: key, name: meta?.name ?? key, sort: meta?.sort ?? 999 })
    }
  }
  podMeta.sort((a, b) => a.sort - b.sort)

  const sectionDefs: { key: string; name: string }[] = [
    { key: '__platform__',   name: 'AOS Platform' },
    ...podMeta.map(p => ({ key: p.id, name: p.name })),
    { key: '__leadership__', name: 'Leadership' },
  ]

  const fmt = (n: number) => Math.round(n / 1000).toLocaleString('sv-SE')

  const sections = sectionDefs.map(({ key, name }) => {
    const budget = budgetByKey[key] ?? { rev: 0, cost: 0 }
    const actual = actuals[key] ?? {}
    const actualRev  = ytdMonths.reduce((s, m) => s + (actual[m]?.revA ?? 0) + (actual[m]?.revB ?? 0), 0)
    const actualCost = ytdMonths.reduce((s, m) => s + (actual[m]?.costA ?? 0) + (actual[m]?.costB ?? 0), 0)
    return { key, name, budgetRev: budget.rev, actualRev, budgetCost: budget.cost, actualCost }
  }).filter(s => s.budgetRev + s.budgetCost + s.actualRev + s.actualCost > 0)

  const total = sections.reduce(
    (acc, s) => ({
      budgetRev:  acc.budgetRev  + s.budgetRev,
      actualRev:  acc.actualRev  + s.actualRev,
      budgetCost: acc.budgetCost + s.budgetCost,
      actualCost: acc.actualCost + s.actualCost,
    }),
    { budgetRev: 0, actualRev: 0, budgetCost: 0, actualCost: 0 },
  )

  const fyYear = fyStart + 1
  const fyLabel = `FY${fyStart}/${String(fyYear).slice(2)}`

  const remainingMonths = allMonths.filter(m => m > todayStr)

  function runRatePct(actual: number, budget: number): string {
    if (budget === 0 && actual === 0) return 'n/a'
    if (budget === 0) return 'no budget set'
    const pct = Math.round((actual / budget - 1) * 100)
    return `${Math.round((actual / budget) * 100)}% of budget (${pct >= 0 ? '+' : ''}${pct}% vs plan)`
  }

  const sectionTable = sections.map(s =>
    `  [${s.key}] ${s.name}:\n    Revenue: budget ${fmt(s.budgetRev)} / actual ${fmt(s.actualRev)} kSEK — ${runRatePct(s.actualRev, s.budgetRev)}\n    Costs:   budget ${fmt(s.budgetCost)} / actual ${fmt(s.actualCost)} kSEK — ${runRatePct(s.actualCost, s.budgetCost)}`
  ).join('\n')

  const prompt = `You are Allie, CFO assistant for Algorithma (Swedish tech firm).

Analyse YTD performance vs the "${scenarioName}" budget scenario for ${fyLabel}.
YTD months covered: ${ytdMonths.length} (${ytdMonths[0].slice(0, 7)} to ${ytdMonths[ytdMonths.length - 1].slice(0, 7)}).
Remaining FY months: ${remainingMonths.length}.
All amounts in kSEK (thousands SEK).

Section breakdown (YTD) — showing budget, actual, and YTD run rate:
${sectionTable}

Total: budget rev ${fmt(total.budgetRev)} / actual ${fmt(total.actualRev)} kSEK | budget cost ${fmt(total.budgetCost)} / actual ${fmt(total.actualCost)} kSEK
Total budget EBIT: ${fmt(total.budgetRev - total.budgetCost)} kSEK | actual EBIT: ${fmt(total.actualRev - total.actualCost)} kSEK

Respond with ONLY valid JSON matching this exact schema — no markdown, no extra keys:
{
  "headline": "single sharp sentence on overall YTD performance",
  "sections": [
    { "key": "<copy key from brackets above>", "name": "<section name>", "narrative": "2-3 sentence assessment" }
  ],
  "actions": ["action 1", "action 2", "action 3"],
  "adjustments": [
    { "section": "<section name>", "suggestion": "specific budget adjustment" }
  ],
  "scenarioAdjustments": [
    { "key": "<copy key from brackets above>", "name": "<section name>", "lineType": "revenue or cost", "pct": <integer -80 to 80>, "reason": "one sentence" }
  ]
}

Include one sections entry per section above. Copy keys exactly from the brackets.
actions: top 3 recommended actions, direct and specific.
adjustments: qualitative suggestions per section.
scenarioAdjustments: IMPORTANT — for every section where revenue or cost deviates meaningfully from budget, provide a pct. This pct is applied to ALL months of the year (past and future) to create a realistic revised full-year scenario. Start from the YTD run rate shown above, then use your judgment: if the variance looks structural (ongoing underperformance, persistent cost overrun) use a pct close to the run rate; if it looks like a timing issue or one-off, be more conservative. Include BOTH revenue and cost entries for each affected section. Be bold where the data clearly shows a structural gap.
Be honest and direct. No fluff.`

  const client = new Anthropic({ apiKey })
  const message = await client.messages.create({
    model:      'claude-haiku-4-5-20251001',
    max_tokens: 4096,
    messages:   [{ role: 'user', content: prompt }],
  })

  const block = message.content[0]
  if (block.type !== 'text') return { ok: false, error: 'Unexpected AI response type' }

  let aiResponse: {
    headline:            string
    sections:            { key: string; name: string; narrative: string }[]
    actions:             string[]
    adjustments:         { section: string; suggestion: string }[]
    scenarioAdjustments: { key: string; name: string; lineType: string; pct: number; reason: string }[]
  }
  try {
    aiResponse = JSON.parse(extractJson(block.text))
  } catch {
    return { ok: false, error: `AI returned unexpected format. Raw: ${block.text.slice(0, 300)}` }
  }

  // Merge AI narratives back with the numeric data we computed
  // Match by key first, fall back to name — the AI sees names in the prompt
  const mergedSections: AnalysisSection[] = sections.map(s => {
    const aiSection = aiResponse.sections.find(a => a.key === s.key)
      ?? aiResponse.sections.find(a => a.name === s.name)
    return {
      key:        s.key,
      name:       s.name,
      budgetRev:  s.budgetRev,
      actualRev:  s.actualRev,
      budgetCost: s.budgetCost,
      actualCost: s.actualCost,
      narrative:  aiSection?.narrative ?? '',
    }
  })

  const scenarioAdjustments: ScenarioAdjustment[] = (aiResponse.scenarioAdjustments ?? [])
    .filter(a => typeof a.pct === 'number' && (a.lineType === 'revenue' || a.lineType === 'cost'))
    .map(a => ({
      key:      a.key,
      name:     a.name,
      lineType: a.lineType as 'revenue' | 'cost',
      pct:      Math.max(-80, Math.min(80, Math.round(a.pct))),
      reason:   a.reason ?? '',
    }))

  const parsed: Omit<ScenarioAnalysis, 'generatedAt'> = {
    headline:            aiResponse.headline,
    sections:            mergedSections,
    actions:             aiResponse.actions,
    adjustments:         aiResponse.adjustments,
    scenarioAdjustments,
  }

  const generatedAt = new Date().toISOString()

  await supabase
    .from('scenario_analyses')
    .upsert(
      {
        scenario_id:          scenarioId,
        fy_start:             fyStart,
        headline:             parsed.headline,
        sections:             parsed.sections,
        actions:              parsed.actions,
        adjustments:          parsed.adjustments,
        scenario_adjustments: parsed.scenarioAdjustments,
        generated_at:         generatedAt,
      },
      { onConflict: 'scenario_id,fy_start' },
    )

  return { ok: true, data: { ...parsed, generatedAt } }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Analysis failed' }
  }
}

export type CreateAdjustedResult =
  | { ok: true;  scenarioId: string }
  | { ok: false; error: string }

export async function createAdjustedScenario(
  sourceScenarioId: string,
  fyStart:          number,
  name:             string,
  adjustments:      ScenarioAdjustment[],
): Promise<CreateAdjustedResult> {
  const supabase = await createAdminSupabase()

  // Build lookup by UUID key and by pod name (AI sometimes echoes name instead of UUID)
  const adjByKey:  Record<string, number> = {}
  const adjByName: Record<string, number> = {}
  for (const a of adjustments) {
    adjByKey[`${a.key}:${a.lineType}`]                 = a.pct
    adjByName[`${a.name.toLowerCase()}:${a.lineType}`] = a.pct
  }

  const { lines, cells } = await getBudgetData(sourceScenarioId)
  const { data: podRows } = await supabase.from('pods').select('id, name')
  const podNameById: Record<string, string> = {}
  for (const p of podRows ?? []) podNameById[p.id] = p.name.toLowerCase()

  const allMonths = getFiscalMonths(fyStart)
  const today     = new Date()
  const todayStr  = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`
  const ytdMonths = new Set(allMonths.filter(m => m <= todayStr))

  // YTD run-rate ratio per pod+lineType so past months reflect actuals proportionally
  const actuals = await getPodActuals(fyStart)
  const ytdActualRev:  Record<string, number> = {}
  const ytdActualCost: Record<string, number> = {}
  const ytdBudgRev:    Record<string, number> = {}
  const ytdBudgCost:   Record<string, number> = {}
  for (const [pk, monthData] of Object.entries(actuals)) {
    for (const m of ytdMonths) {
      const a = monthData[m]
      if (a) {
        ytdActualRev[pk]  = (ytdActualRev[pk]  ?? 0) + a.revA + a.revB
        ytdActualCost[pk] = (ytdActualCost[pk] ?? 0) + a.costA + a.costB
      }
    }
  }
  for (const line of lines) {
    const pk = line.segment === 'services' ? (line.pod_id ?? '__no_pod__') : `__${line.segment}__`
    for (const m of ytdMonths) {
      const amt = cells[line.id]?.[m] ?? 0
      if (line.line_type === 'revenue') ytdBudgRev[pk]  = (ytdBudgRev[pk]  ?? 0) + amt
      else                              ytdBudgCost[pk] = (ytdBudgCost[pk] ?? 0) + amt
    }
  }
  function ytdRatio(actual: number, budget: number): number {
    if (budget <= 0) return 1
    return Math.max(0.05, Math.min(5.0, actual / budget))
  }

  const { data: scenario, error: sErr } = await supabase
    .from('budget_scenarios')
    .insert({ name, fy_start: fyStart })
    .select()
    .single()
  if (sErr || !scenario) return { ok: false, error: sErr?.message ?? 'Failed to create scenario' }

  for (let i = 0; i < lines.length; i++) {
    const line    = lines[i]
    const podKey  = line.segment === 'services' ? (line.pod_id ?? '__no_pod__') : `__${line.segment}__`
    const podName = line.segment === 'services'
      ? (line.pod_id ? (podNameById[line.pod_id] ?? '') : '')
      : line.segment

    // Past months: scale by YTD run rate so pod totals match actuals
    // Future months: apply Allie's reasoned pct
    const futurePct  = adjByKey[`${podKey}:${line.line_type}`]
      ?? adjByName[`${podName}:${line.line_type}`]
      ?? 0
    const pastRatio  = line.line_type === 'revenue'
      ? ytdRatio(ytdActualRev[podKey] ?? 0, ytdBudgRev[podKey] ?? 0)
      : ytdRatio(ytdActualCost[podKey] ?? 0, ytdBudgCost[podKey] ?? 0)

    const { data: newLine, error: lErr } = await supabase
      .from('budget_lines')
      .insert({
        scenario_id:  scenario.id,
        segment:      line.segment,
        pod_id:       line.pod_id,
        account_code: line.account_code,
        line_type:    line.line_type,
        label:        line.label,
        sort:         line.sort,
      })
      .select('id')
      .single()
    if (lErr || !newLine) continue

    const sourceCells = cells[line.id] ?? {}
    const newCells = allMonths
      .filter(m => (sourceCells[m] ?? 0) !== 0)
      .map(m => ({
        budget_line_id: newLine.id,
        month:          m,
        amount: ytdMonths.has(m)
          ? Math.round((sourceCells[m] ?? 0) * pastRatio)
          : futurePct !== 0
            ? Math.round((sourceCells[m] ?? 0) * (1 + futurePct / 100))
            : (sourceCells[m] ?? 0),
      }))

    if (newCells.length > 0) await supabase.from('budget_cells').insert(newCells)
  }

  // ── Synthetic lines for actuals with no budget counterpart ───────────────────
  // Track which pod+lineType combinations already have budget lines
  const coveredKeys = new Set<string>()
  for (const line of lines) {
    const pk = line.segment === 'services' ? (line.pod_id ?? '__no_pod__') : `__${line.segment}__`
    coveredKeys.add(`${pk}:${line.line_type}`)
  }

  const ytdArr = [...ytdMonths]
  const remainingArr = allMonths.filter(m => !ytdMonths.has(m))

  for (const [podKey, monthData] of Object.entries(actuals)) {
    // Resolve segment + pod_id from podKey
    let segment: 'platform' | 'services' | 'leadership'
    let pod_id: string | null = null
    let podDisplayName: string

    if (podKey === '__platform__') {
      segment = 'platform'; podDisplayName = 'AOS Platform'
    } else if (podKey === '__leadership__') {
      segment = 'leadership'; podDisplayName = 'Leadership'
    } else {
      segment = 'services'; pod_id = podKey
      podDisplayName = Object.entries(podNameById).find(([id]) => id === podKey)?.[1] ?? podKey
    }

    const podNameLower = podDisplayName.toLowerCase()

    for (const lineType of ['revenue', 'cost'] as const) {
      if (coveredKeys.has(`${podKey}:${lineType}`)) continue

      // Check if there are any actuals for this pod+lineType
      const ytdTotal = ytdArr.reduce((s, m) => {
        const a = monthData[m]
        return s + (a ? (lineType === 'revenue' ? a.revA + a.revB : a.costA + a.costB) : 0)
      }, 0)
      if (ytdTotal === 0) continue

      // Average monthly actual → project into remaining months
      const avgMonthly = ytdArr.length > 0 ? Math.round(ytdTotal / ytdArr.length) : 0
      const futurePct  = adjByKey[`${podKey}:${lineType}`]
        ?? adjByName[`${podNameLower}:${lineType}`]
        ?? 0

      const { data: newLine, error: lErr } = await supabase
        .from('budget_lines')
        .insert({
          scenario_id:  scenario.id,
          segment,
          pod_id,
          account_code: 'actual',
          line_type:    lineType,
          label:        lineType === 'revenue' ? 'Revenue (from actuals)' : 'Costs (from actuals)',
          sort:         999,
        })
        .select('id')
        .single()
      if (lErr || !newLine) continue

      const newCells = [
        // YTD months: use actual amounts directly
        ...ytdArr.map(m => {
          const a = monthData[m]
          const amount = a ? (lineType === 'revenue' ? a.revA + a.revB : a.costA + a.costB) : 0
          return { budget_line_id: newLine.id, month: m, amount }
        }).filter(c => c.amount !== 0),
        // Remaining months: project from avg monthly + Allie's pct
        ...remainingArr.map(m => ({
          budget_line_id: newLine.id,
          month:          m,
          amount:         futurePct !== 0
            ? Math.round(avgMonthly * (1 + futurePct / 100))
            : avgMonthly,
        })).filter(c => c.amount !== 0),
      ]

      if (newCells.length > 0) await supabase.from('budget_cells').insert(newCells)
    }
  }

  return { ok: true, scenarioId: scenario.id }
}
