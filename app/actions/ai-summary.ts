'use server'

import Anthropic from '@anthropic-ai/sdk'
import { createServerSupabase } from '@/lib/supabase-server'

export interface AISummaryInput {
  currentMonth: string
  months: string[]
  revenueABByMonth: number[]
  forecastByMonth:  number[]
  costsByMonth:     number[]
  topClients: {
    name: string
    abTotal:   number
    fTotal:    number
    currentAB: number
    currentF:  number
  }[]
}

export interface AISummaryResult {
  summary:     string
  generatedAt: string
}

export interface AIYearlyInput {
  months:           string[]
  revenueABByMonth: number[]
  forecastByMonth:  number[]
  costsByMonth:     number[]
  topClients: {
    name:    string
    abTotal: number
    fTotal:  number
  }[]
  fyYear: string
  fyEnd:  string
}

// Fiscal quarters: Q1 Aug–Oct, Q2 Nov–Jan, Q3 Feb–Apr, Q4 May–Jul
function getFiscalQuarter(month: string): 1 | 2 | 3 | 4 {
  const m = parseInt(month.slice(5, 7), 10)
  if (m >= 8 && m <= 10) return 1
  if (m >= 11 || m === 1) return 2
  if (m >= 2 && m <= 4)  return 3
  return 4
}

// Returns the ISO date (YYYY-MM-DD) of the Monday of the current week
function currentWeekMonday(): string {
  const today = new Date()
  const day   = today.getDay()               // 0=Sun … 6=Sat
  const diff  = day === 0 ? -6 : 1 - day    // back to Monday
  const mon   = new Date(today)
  mon.setDate(today.getDate() + diff)
  return mon.toISOString().slice(0, 10)
}

export async function getAISummary(input: AISummaryInput, force = false): Promise<AISummaryResult> {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) throw new Error('ANTHROPIC_API_KEY not configured')

  const weekKey  = currentWeekMonday()
  const supabase = await createServerSupabase()

  if (!force) {
    const { data } = await supabase
      .from('ai_summaries')
      .select('summary, generated_at')
      .eq('month', weekKey)
      .maybeSingle()
    if (data) return { summary: data.summary, generatedAt: data.generated_at }
  }

  const { currentMonth, months, revenueABByMonth, forecastByMonth, costsByMonth, topClients } = input

  const fmt   = (n: number) => Math.round(n / 1000).toLocaleString('sv-SE')
  const mName = (iso: string) => new Date(iso + 'T12:00:00').toLocaleString('en-SE', { month: 'short' })

  const currentIdx        = months.findIndex(m => m >= currentMonth)
  const curRevAB          = currentIdx >= 0 ? revenueABByMonth[currentIdx] : 0
  const curFC             = currentIdx >= 0 ? forecastByMonth[currentIdx]  : 0
  const curCosts          = currentIdx >= 0 ? costsByMonth[currentIdx]     : 0
  const curMargin         = curRevAB - curCosts
  const curMarginPct      = curRevAB > 0 ? Math.round((curMargin / curRevAB) * 100) : 0
  const activeClientCount = topClients.filter(c => c.currentAB > 0).length
  const monthName         = new Date(currentMonth + 'T12:00:00').toLocaleString('en-SE', { month: 'long', year: 'numeric' })

  const currentQ    = getFiscalQuarter(currentMonth)
  const qMonths     = months.filter(m => getFiscalQuarter(m) === currentQ)
  const qRevAB      = qMonths.reduce((s, m) => s + (revenueABByMonth[months.indexOf(m)] ?? 0), 0)
  const qFC         = qMonths.reduce((s, m) => s + (forecastByMonth[months.indexOf(m)]  ?? 0), 0)
  const qCosts      = qMonths.reduce((s, m) => s + (costsByMonth[months.indexOf(m)]     ?? 0), 0)
  const qEnd        = qMonths[qMonths.length - 1]
  const qMonthsLeft = qMonths.filter(m => m > currentMonth).length
  const qEndName    = qEnd ? mName(qEnd) : ''

  const fyRevAB     = revenueABByMonth.reduce((s, v) => s + v, 0)
  const fyFC        = forecastByMonth.reduce((s, v)  => s + v, 0)
  const fyLastMonth = months[months.length - 1]
  const fyYear      = fyLastMonth ? fyLastMonth.slice(0, 4) : String(new Date().getFullYear())
  const fyEnd       = `31 Jul ${fyYear}`

  const clientLines = topClients
    .filter(c => c.currentAB + c.currentF > 0)
    .slice(0, 8)
    .map(c => `  ${c.name}: ${fmt(c.currentAB)} A+B this month`)
    .join('\n')

  const prompt = `You are Allie, aSAP's AI and concise CFO assistant for Algorithma, a Swedish consulting firm. Fiscal year ends ${fyEnd}.

Reply with exactly this format — no other text, no markdown bold (**), no backticks:
Line 1: a single sharp tagline about this month's financial health (honest, direct)
Line 2: • [revenue: ${fmt(curRevAB)} kSEK A+B — strong or light?]
Line 3: • [costs: ${fmt(curCosts)} kSEK vs ≤2200 kSEK benchmark]
Line 4: • [margin: ${curMarginPct}% vs >20% benchmark — good, concern, or alarm]
Line 5: • [client mix: ${activeClientCount} active clients — concentration risk or healthy spread]
Line 6: • [Q${currentQ} outlook: ${qMonthsLeft} month${qMonthsLeft !== 1 ? 's' : ''} left ending ${qEndName} — ${fmt(qRevAB)} kSEK confirmed, ${fmt(qFC)} kSEK pipeline; on track?]
Line 7: • [FY end (${fyEnd}): ${fmt(fyRevAB)} kSEK confirmed + ${fmt(fyFC)} kSEK pipeline = ${fmt(fyRevAB + fyFC)} kSEK total; honest year-end read]

Plain text only. No bold. No bullet symbols other than •.

Current month (${monthName}):
  Revenue A+B: ${fmt(curRevAB)} kSEK  |  Pipeline FC: ${fmt(curFC)} kSEK
  Costs: ${fmt(curCosts)} kSEK (≤2200 benchmark)  |  Margin: ${fmt(curMargin)} kSEK / ${curMarginPct}% (>20% benchmark)
  Active clients: ${activeClientCount}

Q${currentQ} (ends ${qEndName}, ${qMonthsLeft} month${qMonthsLeft !== 1 ? 's' : ''} remaining):
  Confirmed A+B: ${fmt(qRevAB)} kSEK  |  Pipeline FC: ${fmt(qFC)} kSEK  |  Costs: ${fmt(qCosts)} kSEK

Full year to ${fyEnd}:
  Confirmed A+B: ${fmt(fyRevAB)} kSEK  |  Pipeline FC: ${fmt(fyFC)} kSEK  |  Total: ${fmt(fyRevAB + fyFC)} kSEK

Client breakdown (this month):
${clientLines || '  (no data)'}`

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
    .upsert({ month: weekKey, summary, generated_at: generatedAt }, { onConflict: 'month' })

  return { summary, generatedAt }
}

export async function getAIYearlySummary(input: AIYearlyInput, force = false): Promise<AISummaryResult> {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) throw new Error('ANTHROPIC_API_KEY not configured')

  const weekKey  = currentWeekMonday()
  const cacheKey = `fy-${weekKey}`
  const supabase = await createServerSupabase()

  if (!force) {
    const { data } = await supabase
      .from('ai_summaries')
      .select('summary, generated_at')
      .eq('month', cacheKey)
      .maybeSingle()
    if (data) return { summary: data.summary, generatedAt: data.generated_at }
  }

  const { months, revenueABByMonth, forecastByMonth, costsByMonth, topClients, fyYear, fyEnd } = input

  const fmt = (n: number) => Math.round(n / 1000).toLocaleString('sv-SE')

  const fyRevAB   = revenueABByMonth.reduce((s, v) => s + v, 0)
  const fyFC      = forecastByMonth.reduce((s, v)  => s + v, 0)
  const fyCosts   = costsByMonth.reduce((s, v)     => s + v, 0)
  const fyMargin  = fyRevAB + fyFC - fyCosts
  const fyMarginPct = (fyRevAB + fyFC) > 0 ? Math.round((fyMargin / (fyRevAB + fyFC)) * 100) : 0

  const today         = new Date()
  const currentMonth  = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`
  const monthsLeft    = months.filter(m => m > currentMonth).length

  const fyTotal = topClients.reduce((s, c) => s + c.abTotal + c.fTotal, 0)
  const top3Pct = fyTotal > 0
    ? Math.round(topClients.slice(0, 3).reduce((s, c) => s + c.abTotal + c.fTotal, 0) / fyTotal * 100)
    : 0

  const clientLines = topClients
    .slice(0, 6)
    .map(c => `  ${c.name}: ${fmt(c.abTotal)} confirmed + ${fmt(c.fTotal)} pipeline`)
    .join('\n')

  const prompt = `You are Allie, aSAP's AI and concise CFO assistant for Algorithma, a Swedish consulting firm.
Fiscal year ${fyYear} ends ${fyEnd}. Today there are ${monthsLeft} months remaining in the fiscal year.

Reply with exactly this format — no other text, no markdown bold (**), no backticks:
Line 1: a single sharp tagline on whether FY${fyYear} is within reach (honest, direct)
Line 2: • [FY revenue: ${fmt(fyRevAB)} kSEK confirmed A+B + ${fmt(fyFC)} kSEK pipeline = ${fmt(fyRevAB + fyFC)} kSEK total — strong or gap?]
Line 3: • [FY margin: ${fmt(fyCosts)} kSEK costs → ${fyMarginPct}% blended margin including pipeline — healthy?]
Line 4: • [pipeline risk: ${fmt(fyFC)} kSEK F-status over ${monthsLeft} month${monthsLeft !== 1 ? 's' : ''} — conversion confidence]
Line 5: • [client concentration: top 3 = ${top3Pct}% of FY revenue — healthy spread or risk?]
Line 6: • [pace: ${monthsLeft} month${monthsLeft !== 1 ? 's' : ''} remaining — monthly run-rate needed to close the year strong]
Line 7: • [year-end call: honest probability of hitting or missing the fiscal year target]

Plain text only. No bold. No bullet symbols other than •.

Full year to ${fyEnd}:
  Confirmed A+B: ${fmt(fyRevAB)} kSEK  |  Pipeline FC: ${fmt(fyFC)} kSEK  |  Total: ${fmt(fyRevAB + fyFC)} kSEK
  Full-year costs: ${fmt(fyCosts)} kSEK  |  Blended margin: ${fyMarginPct}%
  Months remaining: ${monthsLeft}  |  Top-3 client share: ${top3Pct}%

Client breakdown (full year):
${clientLines || '  (no data)'}`

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
