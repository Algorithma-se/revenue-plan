'use server'

import Anthropic from '@anthropic-ai/sdk'
import { createServerSupabase } from '@/lib/supabase-server'

export interface AISummaryInput {
  currentMonth: string              // 'YYYY-MM-01'
  months: string[]
  revenueABByMonth: number[]        // A+B (confirmed+booked) in SEK
  forecastByMonth:  number[]        // F-only in SEK
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
  generatedAt: string   // ISO timestamp
}

// Fiscal quarters: Q1 Aug–Oct, Q2 Nov–Jan, Q3 Feb–Apr, Q4 May–Jul
function getFiscalQuarter(month: string): 1 | 2 | 3 | 4 {
  const m = parseInt(month.slice(5, 7), 10)
  if (m >= 8 && m <= 10) return 1
  if (m >= 11 || m === 1) return 2
  if (m >= 2 && m <= 4)  return 3
  return 4
}

export async function getAISummary(input: AISummaryInput, force = false): Promise<AISummaryResult> {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) throw new Error('ANTHROPIC_API_KEY not configured')

  const today    = new Date()
  const monthKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`

  const supabase = await createServerSupabase()

  if (!force) {
    const { data } = await supabase
      .from('ai_summaries')
      .select('summary, generated_at')
      .eq('month', monthKey)
      .maybeSingle()
    if (data) return { summary: data.summary, generatedAt: data.generated_at }
  }

  const { currentMonth, months, revenueABByMonth, forecastByMonth, costsByMonth, topClients } = input

  const fmt = (n: number) => Math.round(n / 1000).toLocaleString('sv-SE')
  const mName = (iso: string) => new Date(iso + 'T12:00:00').toLocaleString('en-SE', { month: 'short' })

  // ── Current month ────────────────────────────────────────────────────────────
  const currentIdx        = months.findIndex(m => m >= currentMonth)
  const curRevAB          = currentIdx >= 0 ? revenueABByMonth[currentIdx] : 0
  const curFC             = currentIdx >= 0 ? forecastByMonth[currentIdx]  : 0
  const curCosts          = currentIdx >= 0 ? costsByMonth[currentIdx]     : 0
  const curMargin         = curRevAB - curCosts
  const curMarginPct      = curRevAB > 0 ? Math.round((curMargin / curRevAB) * 100) : 0
  const activeClientCount = topClients.filter(c => c.currentAB > 0).length
  const monthName         = new Date(currentMonth + 'T12:00:00').toLocaleString('en-SE', { month: 'long', year: 'numeric' })

  // ── Current quarter ──────────────────────────────────────────────────────────
  const currentQ     = getFiscalQuarter(currentMonth)
  const qMonths      = months.filter(m => getFiscalQuarter(m) === currentQ)
  const qRevAB       = qMonths.reduce((s, m, i) => s + (revenueABByMonth[months.indexOf(m)] ?? 0), 0)
  const qFC          = qMonths.reduce((s, m)    => s + (forecastByMonth[months.indexOf(m)]  ?? 0), 0)
  const qCosts       = qMonths.reduce((s, m)    => s + (costsByMonth[months.indexOf(m)]     ?? 0), 0)
  const qEnd         = qMonths[qMonths.length - 1]
  const qMonthsLeft  = qMonths.filter(m => m > currentMonth).length
  const qEndName     = qEnd ? mName(qEnd) : ''

  // ── Full fiscal year ─────────────────────────────────────────────────────────
  const fyRevAB    = revenueABByMonth.reduce((s, v) => s + v, 0)
  const fyFC       = forecastByMonth.reduce((s, v)  => s + v, 0)
  const fyLastMonth = months[months.length - 1]  // always Jul
  const fyYear     = fyLastMonth ? fyLastMonth.slice(0, 4) : String(today.getFullYear())
  const fyEnd      = `31 Jul ${fyYear}`

  // ── Client lines ─────────────────────────────────────────────────────────────
  const clientLines = topClients
    .filter(c => c.currentAB + c.currentF > 0)
    .slice(0, 8)
    .map(c => `  ${c.name}: ${fmt(c.currentAB)} A+B this month`)
    .join('\n')

  const prompt = `You are a concise CFO assistant for Algorithma, a Swedish consulting firm. Fiscal year ends ${fyEnd}.

Reply with exactly this format — no other text, no markdown bold (**), no backticks:
Line 1: a single sharp tagline about this month's financial health (honest, direct)
Line 2: • [revenue: ${fmt(curRevAB)} kSEK A+B — strong or light?]
Line 3: • [costs: ${fmt(curCosts)} kSEK vs ≤2200 kSEK benchmark]
Line 4: • [margin: ${curMarginPct}% vs >20% benchmark — good, concern, or alarm]
Line 5: • [client mix: ${activeClientCount} active clients — concentration risk or healthy spread]
Line 6: • [Q${currentQ} outlook: ${qMonthsLeft} month${qMonthsLeft !== 1 ? 's' : ''} left ending ${qEndName} — ${fmt(qRevAB)} kSEK confirmed, ${fmt(qFC)} kSEK pipeline; is the quarter on track?]
Line 7: • [FY end (${fyEnd}): ${fmt(fyRevAB)} kSEK confirmed + ${fmt(fyFC)} kSEK pipeline = ${fmt(fyRevAB + fyFC)} kSEK total; brief honest read on year-end]

Plain text only. No bold. No bullet symbols other than •. Be direct and specific.

Current month (${monthName}):
  Revenue A+B: ${fmt(curRevAB)} kSEK  |  Pipeline FC: ${fmt(curFC)} kSEK
  Costs: ${fmt(curCosts)} kSEK (benchmark ≤2200)  |  Margin: ${fmt(curMargin)} kSEK / ${curMarginPct}% (benchmark >20%)
  Active clients: ${activeClientCount}

Q${currentQ} (ends ${qEndName}, ${qMonthsLeft} month${qMonthsLeft !== 1 ? 's' : ''} remaining):
  Confirmed A+B: ${fmt(qRevAB)} kSEK  |  Pipeline FC: ${fmt(qFC)} kSEK  |  Costs: ${fmt(qCosts)} kSEK

Full year to ${fyEnd}:
  Confirmed A+B: ${fmt(fyRevAB)} kSEK  |  Pipeline FC: ${fmt(fyFC)} kSEK  |  Total: ${fmt(fyRevAB + fyFC)} kSEK

Client breakdown (this month A+B kSEK):
${clientLines || '  (no client data)'}`

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
    .upsert({ month: monthKey, summary, generated_at: generatedAt }, { onConflict: 'month' })

  return { summary, generatedAt }
}
