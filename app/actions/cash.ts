'use server'

import Anthropic from '@anthropic-ai/sdk'
import { createServerSupabase } from '@/lib/supabase-server'
import type { AISummaryResult } from '@/app/actions/ai-summary'

export interface CashOutEvent {
  id:         string
  date:       string   // YYYY-MM-DD
  label:      string
  amount_sek: number
  is_inflow:  boolean  // true = manual cash-in (e.g. tax return), false = cash-out
  created_at: string
}

export interface CashBriefMonth {
  month:            string        // YYYY-MM-01
  label:            string        // "Jun 2026"
  cashIn:           number        // SEK — sum of invoice amounts due this month
  cashOut:          number        // SEK — sum of cash_out_events, or P&L estimate
  cashOutConfirmed: boolean       // false = using P&L cost estimate
  net:              number        // cashIn - cashOut
  balance:          number | null // projected or actual bank balance
}

export interface CashBriefInput {
  months: CashBriefMonth[]
}

function currentWeekMonday(): string {
  const today = new Date()
  const day   = today.getDay()
  const diff  = day === 0 ? -6 : 1 - day
  const mon   = new Date(today)
  mon.setDate(today.getDate() + diff)
  return mon.toISOString().slice(0, 10)
}

export async function getCashOutEvents(): Promise<CashOutEvent[]> {
  const supabase = await createServerSupabase()
  const { data, error } = await supabase
    .from('cash_out_events')
    .select('*')
    .order('date', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []) as CashOutEvent[]
}

export async function upsertCashOutEvent(data: {
  id?:        string
  date:       string
  label:      string
  amount_sek: number
  is_inflow?: boolean
}): Promise<CashOutEvent> {
  const supabase = await createServerSupabase()
  const payload: Record<string, unknown> = {
    date:       data.date,
    label:      data.label,
    amount_sek: data.amount_sek,
    is_inflow:  data.is_inflow ?? false,
    updated_at: new Date().toISOString(),
  }
  if (data.id) payload.id = data.id

  const { data: row, error } = await supabase
    .from('cash_out_events')
    .upsert(payload, { onConflict: 'id' })
    .select()
    .single()
  if (error) throw new Error(error.message)
  return row as CashOutEvent
}

export async function deleteCashOutEvent(id: string): Promise<void> {
  const supabase = await createServerSupabase()
  await supabase.from('cash_out_events').delete().eq('id', id)
}

export async function getAICashBrief(input: CashBriefInput, force = false): Promise<AISummaryResult> {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) throw new Error('ANTHROPIC_API_KEY not configured')

  const weekKey  = currentWeekMonday()
  const cacheKey = `cash-brief-3m-${weekKey}`
  const supabase = await createServerSupabase()

  if (!force) {
    const { data } = await supabase
      .from('ai_summaries')
      .select('summary, generated_at')
      .eq('month', cacheKey)
      .maybeSingle()
    if (data) return { summary: data.summary, generatedAt: data.generated_at }
  }

  const fmt = (n: number) => Math.round(n / 1000).toLocaleString('sv-SE')

  const monthLines = input.months.map(m => {
    const est  = m.cashOutConfirmed ? '' : ' ★'
    const net  = m.net >= 0 ? `+${fmt(m.net)}` : `−${fmt(Math.abs(m.net))}`
    const bal  = m.balance != null ? `${fmt(m.balance)} kSEK` : '—'
    const flag = m.balance != null && m.balance < 0 ? ' ← NEGATIVE' : m.net < 0 ? ' ← net negative' : ''
    return `${m.label.padEnd(10)}  in: ${fmt(m.cashIn).padStart(6)} k  out: ${fmt(m.cashOut).padStart(6)} k${est}  net: ${net.padStart(7)} k  balance: ${bal}${flag}`
  }).join('\n')

  const prompt = `You are Allie, aSAP's AI cash flow assistant for Algorithma, a Swedish consulting firm.
★ = cash out is a P&L estimate (no confirmed events entered for that month)

Monthly cash position — 3-month horizon:
${monthLines || '  (no data)'}

Reply with exactly this format — no other text, no markdown bold (**), no backticks:
Line 1: one sharp line on liquidity health across the period shown
Line 2: • [worst month: which month has the lowest / most at-risk balance, and why]
Line 3: • [cash-in risk: months where expected cash in is low, zero, or relying on overdue invoices]
Line 4: • [cash-out gaps: months where cash out exceeds cash in — net negative months]
Line 5: • [recommendation: one concrete action to improve liquidity, or "no action needed"]`

  const client = new Anthropic({ apiKey: key })
  const message = await client.messages.create({
    model:      'claude-haiku-4-5-20251001',
    max_tokens: 400,
    messages:   [{ role: 'user', content: prompt }],
  })

  const block = message.content[0]
  if (block.type !== 'text') throw new Error('Unexpected response type')
  const summary = block.text

  const generatedAt = new Date().toISOString()
  await supabase
    .from('ai_summaries')
    .upsert({ month: cacheKey, summary, generated_at: generatedAt }, { onConflict: 'month' })

  return { summary, generatedAt }
}

export interface RagMonthInput {
  month:    string   // YYYY-MM-01
  label:    string   // "Jun 2026"
  ingoing:  number   // SEK — start of month balance
  cashIn:   number   // SEK
  cashOut:  number   // SEK
  worstCase: number  // ingoing - cashOut (conservative min balance)
  rag:      'red' | 'orange'
}

export async function getRagComments(
  months: RagMonthInput[],
  force = false,
): Promise<Record<string, string>> {
  if (months.length === 0) return {}
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) return {}

  const weekKey  = currentWeekMonday()
  const cacheKey = `rag-comments-${weekKey}`
  const supabase = await createServerSupabase()

  if (!force) {
    const { data } = await supabase
      .from('ai_summaries')
      .select('summary')
      .eq('month', cacheKey)
      .maybeSingle()
    if (data) {
      try { return JSON.parse(data.summary) } catch {}
    }
  }

  const fmt = (n: number) => Math.round(n / 1000).toLocaleString('sv-SE')

  const lines = months.map(m =>
    `${m.label} [${m.rag.toUpperCase()}]: ingoing ${fmt(m.ingoing)}k, out ${fmt(m.cashOut)}k, in ${fmt(m.cashIn)}k → worst case ${fmt(m.worstCase)}k`
  ).join('\n')

  const prompt = `For each at-risk month below, write ONE sharp sentence (max 12 words) naming the specific cash risk. Be direct — no fluff.
Reply ONLY as valid JSON: { "YYYY-MM-01": "sentence", ... }

${lines}`

  const client  = new Anthropic({ apiKey: key })
  const message = await client.messages.create({
    model:      'claude-haiku-4-5-20251001',
    max_tokens: 400,
    messages:   [{ role: 'user', content: prompt }],
  })

  const block = message.content[0]
  if (block.type !== 'text') return {}

  let result: Record<string, string> = {}
  try {
    const cleaned = block.text.trim().replace(/^```json\s*/i, '').replace(/```\s*$/, '')
    result = JSON.parse(cleaned)
  } catch { return {} }

  await supabase
    .from('ai_summaries')
    .upsert({ month: cacheKey, summary: JSON.stringify(result), generated_at: new Date().toISOString() }, { onConflict: 'month' })

  return result
}
