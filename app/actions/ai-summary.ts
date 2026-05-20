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

  const currentIdx        = months.findIndex(m => m >= currentMonth)
  const curRevAB          = currentIdx >= 0 ? revenueABByMonth[currentIdx] : 0
  const curFC             = currentIdx >= 0 ? forecastByMonth[currentIdx]  : 0
  const curCosts          = currentIdx >= 0 ? costsByMonth[currentIdx]     : 0
  const curMargin         = curRevAB - curCosts
  const curMarginPct      = curRevAB > 0 ? Math.round((curMargin / curRevAB) * 100) : 0
  const activeClientCount = topClients.filter(c => c.currentAB > 0).length

  const monthName = new Date(currentMonth + 'T12:00:00').toLocaleString('en-SE', { month: 'long', year: 'numeric' })

  const clientLines = topClients
    .filter(c => c.currentAB + c.currentF > 0)
    .slice(0, 8)
    .map(c => `  ${c.name}: ${fmt(c.currentAB)} A+B this month`)
    .join('\n')

  const prompt = `You are a concise CFO assistant for Algorithma, a Swedish consulting firm.

Reply with exactly this format — no other text, no markdown bold (**), no backticks:
Line 1: a single sharp tagline sentence about this month's financial health (honest, direct)
Line 2: • [revenue: amount and whether it looks strong or light]
Line 3: • [costs: amount vs 2200 kSEK benchmark — good if ≤2200, concern if above]
Line 4: • [margin: ${curMarginPct}% vs 20% benchmark — good if ≥20%, concern if below, alarm if negative]
Line 5: • [client mix: ${activeClientCount} active clients — comment on concentration risk or healthy diversification]
${curFC > 0 ? 'Line 6: • [pipeline: FC amount and near-term visibility comment]' : ''}

Plain text only. No bold. No bullet symbols other than the • character. Current month only.

Current month (${monthName}):
  Revenue A+B: ${fmt(curRevAB)} kSEK
  Pipeline FC: ${fmt(curFC)} kSEK
  Costs: ${fmt(curCosts)} kSEK (benchmark: ≤2200 kSEK)
  Margin: ${fmt(curMargin)} kSEK / ${curMarginPct}% (benchmark: >20%)
  Active clients this month: ${activeClientCount}

Client breakdown (this month A+B kSEK):
${clientLines || '  (no client data)'}`

  const client = new Anthropic({ apiKey: key })

  const message = await client.messages.create({
    model:      'claude-haiku-4-5-20251001',
    max_tokens: 300,
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
