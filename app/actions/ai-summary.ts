'use server'

import Anthropic from '@anthropic-ai/sdk'

export interface AISummaryInput {
  currentMonth: string              // 'YYYY-MM-01'
  months: string[]
  revenueABByMonth: number[]        // A+B (confirmed+booked) in SEK
  forecastByMonth:  number[]        // F-only in SEK
  costsByMonth:     number[]
  topClients: {
    name: string
    abTotal: number   // A+B SEK across the FY
    fTotal:  number   // Forecast SEK across the FY
  }[]
}

export async function getAISummary(input: AISummaryInput): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) throw new Error('ANTHROPIC_API_KEY not configured')

  const client = new Anthropic({ apiKey: key })

  const { currentMonth, months, revenueABByMonth, forecastByMonth, costsByMonth, topClients } = input

  const fmt = (n: number) => Math.round(n / 1000).toLocaleString('sv-SE')

  const currentIdx    = months.findIndex(m => m >= currentMonth)
  const curRevAB      = currentIdx >= 0 ? revenueABByMonth[currentIdx] : 0
  const curFC         = currentIdx >= 0 ? forecastByMonth[currentIdx]  : 0
  const curCosts      = currentIdx >= 0 ? costsByMonth[currentIdx]     : 0
  const curMargin     = curRevAB - curCosts
  const curMarginPct  = curRevAB > 0 ? Math.round((curMargin / curRevAB) * 100) : 0

  const fyRevAB      = revenueABByMonth.reduce((s, v) => s + v, 0)
  const fyForecast   = forecastByMonth.reduce((s, v) => s + v, 0)
  const fyTotal      = fyRevAB + fyForecast
  const fyCosts      = costsByMonth.reduce((s, v) => s + v, 0)
  const fyMargin     = fyRevAB - fyCosts
  const fyMarginPct  = fyRevAB > 0 ? Math.round((fyMargin / fyRevAB) * 100) : 0

  const monthNames = months.map(m =>
    new Date(m + 'T12:00:00').toLocaleString('en-SE', { month: 'short', year: '2-digit' })
  )

  const clientLines = topClients
    .slice(0, 8)
    .map(c => `  ${c.name}: ${fmt(c.abTotal)} A+B, ${fmt(c.fTotal)} FC`)
    .join('\n')

  const lines = [
    `Current month (${monthNames[currentIdx] ?? currentMonth}): A+B revenue ${fmt(curRevAB)} kSEK, costs ${fmt(curCosts)} kSEK, margin ${fmt(curMargin)} kSEK (${curMarginPct}%)${curFC > 0 ? `, pipeline FC ${fmt(curFC)} kSEK` : ''}`,
    `Full year A+B confirmed: ${fmt(fyRevAB)} kSEK, +Forecast: ${fmt(fyTotal)} kSEK, costs: ${fmt(fyCosts)} kSEK, margin: ${fmt(fyMargin)} kSEK (${fyMarginPct}%)`,
    topClients.length > 0 ? `Top clients by FY revenue (A+B / Forecast kSEK):\n${clientLines}` : '',
  ].filter(Boolean).join('\n')

  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 250,
    messages: [{
      role: 'user',
      content: `You are a concise CFO assistant for Algorithma, a Swedish consulting firm. Write a 3-sentence executive summary. Focus on: (1) current-month profitability and margin health, (2) revenue concentration and client mix — highlight dependency risks or positive diversification, (3) full-year outlook based on confirmed and booked revenue. Use kSEK figures. Be direct and specific. Do not compare to any plan or target.\n\n${lines}`,
    }],
  })

  const block = message.content[0]
  if (block.type !== 'text') throw new Error('Unexpected response type')
  return block.text
}
