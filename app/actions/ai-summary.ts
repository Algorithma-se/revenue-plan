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
    abTotal:   number   // A+B SEK across the FY
    fTotal:    number   // Forecast SEK across the FY
    currentAB: number   // A+B SEK this month
    currentF:  number   // Forecast SEK this month
  }[]
}

export interface AISummaryResult {
  summary:     string
  generatedAt: string   // ISO timestamp
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

  const currentIdx   = months.findIndex(m => m >= currentMonth)
  const curRevAB     = currentIdx >= 0 ? revenueABByMonth[currentIdx] : 0
  const curFC        = currentIdx >= 0 ? forecastByMonth[currentIdx]  : 0
  const curCosts     = currentIdx >= 0 ? costsByMonth[currentIdx]     : 0
  const curMargin    = curRevAB - curCosts
  const curMarginPct = curRevAB > 0 ? Math.round((curMargin / curRevAB) * 100) : 0

  const activeClientCount = topClients.filter(c => c.currentAB > 0).length

  const monthName = new Date(currentMonth + 'T12:00:00').toLocaleString('en-SE', { month: 'long', year: 'numeric' })

  const clientLines = topClients
    .filter(c => c.currentAB + c.currentF > 0)
    .slice(0, 8)
    .map(c => `  ${c.name}: ${fmt(c.currentAB)} A+B this month, ${fmt(c.abTotal)} FY A+B`)
    .join('\n')

  const prompt = `You are a concise CFO assistant for Algorithma, a Swedish consulting firm. Write a 3-sentence executive summary for the CURRENT MONTH ONLY.

Benchmarks: margin above 20% is healthy; below 20% is a concern. Monthly costs at or below 2200 kSEK is good. Client diversification (many active clients) reduces concentration risk.

Focus on: (1) this month's revenue, cost level vs. 2200 kSEK, and margin vs. 20% — state clearly whether each is good or a concern; (2) client mix — number of active clients this month, any concentration risk worth flagging; (3) if pipeline (FC) is material, one brief note on near-term visibility. Use kSEK. Be direct and specific. Do not mention targets or plans. Do not summarize the full year.

Current month (${monthName}):
  Revenue A+B: ${fmt(curRevAB)} kSEK
  Pipeline FC: ${fmt(curFC)} kSEK
  Costs: ${fmt(curCosts)} kSEK (benchmark: ≤2200 kSEK)
  Margin: ${fmt(curMargin)} kSEK / ${curMarginPct}% (benchmark: >20%)
  Active clients this month (A+B > 0): ${activeClientCount}

Client breakdown (this month A+B / FY A+B in kSEK):
${clientLines || '  (no client data)'}`

  const client = new Anthropic({ apiKey: key })

  const message = await client.messages.create({
    model:      'claude-haiku-4-5-20251001',
    max_tokens: 250,
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
