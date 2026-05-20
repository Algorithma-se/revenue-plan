'use server'

import Anthropic from '@anthropic-ai/sdk'

export interface AISummaryInput {
  currentMonth: string              // 'YYYY-MM-01'
  months: string[]
  revenueABByMonth: number[]        // A+B revenue in SEK
  forecastByMonth: number[]         // F-only revenue in SEK
  costsByMonth: number[]
  targetsByMonth: number[]
}

export async function getAISummary(input: AISummaryInput): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) throw new Error('ANTHROPIC_API_KEY not configured')

  const client = new Anthropic({ apiKey: key })

  const { currentMonth, months, revenueABByMonth, forecastByMonth, costsByMonth, targetsByMonth } = input

  const fmt = (n: number) => Math.round(n / 1000).toLocaleString('sv-SE')

  const currentIdx = months.findIndex(m => m >= currentMonth)
  const pastMonths = months.slice(0, Math.max(0, currentIdx))
  const futureMonths = months.slice(currentIdx)

  // Determine quarter (Q1 = Aug-Oct, Q2 = Nov-Jan, Q3 = Feb-Apr, Q4 = May-Jul for FY)
  const curMonth = new Date(currentMonth + 'T12:00:00')
  const monthNum = curMonth.getMonth() + 1
  const quarterMonths = monthNum >= 8  ? months.filter(m => { const n = new Date(m+'T12:00:00').getMonth()+1; return n >= 8 && n <= 10 })
                      : monthNum >= 11 ? months.filter(m => { const n = new Date(m+'T12:00:00').getMonth()+1; return n >= 11 || n <= 1 })
                      : monthNum >= 2  ? months.filter(m => { const n = new Date(m+'T12:00:00').getMonth()+1; return n >= 2 && n <= 4 })
                      :                  months.filter(m => { const n = new Date(m+'T12:00:00').getMonth()+1; return n >= 5 && n <= 7 })

  const qRevAB = quarterMonths.reduce((s, m) => {
    const i = months.indexOf(m)
    return s + (i >= 0 ? revenueABByMonth[i] : 0)
  }, 0)
  const qTarget = quarterMonths.reduce((s, m) => {
    const i = months.indexOf(m)
    return s + (i >= 0 ? targetsByMonth[i] : 0)
  }, 0)
  const qCosts = quarterMonths.reduce((s, m) => {
    const i = months.indexOf(m)
    return s + (i >= 0 ? costsByMonth[i] : 0)
  }, 0)

  const fyRevAB    = revenueABByMonth.reduce((s, v) => s + v, 0)
  const fyForecast = forecastByMonth.reduce((s, v) => s + v, 0)
  const fyTarget   = targetsByMonth.reduce((s, v) => s + v, 0)
  const fyCosts    = costsByMonth.reduce((s, v) => s + v, 0)
  const fyTotal    = fyRevAB + fyForecast

  const curRevAB  = currentIdx >= 0 ? revenueABByMonth[currentIdx] : 0
  const curTarget = currentIdx >= 0 ? targetsByMonth[currentIdx] : 0
  const curFC     = currentIdx >= 0 ? forecastByMonth[currentIdx] : 0

  const monthNames = months.map(m => new Date(m + 'T12:00:00').toLocaleString('en-SE', { month: 'short', year: '2-digit' }))

  const lines = [
    `Current month (${monthNames[currentIdx] ?? currentMonth}): A+B ${fmt(curRevAB)} kSEK, Forecast ${fmt(curFC)} kSEK, Target ${fmt(curTarget)} kSEK`,
    `Quarter A+B total: ${fmt(qRevAB)} kSEK vs target ${fmt(qTarget)} kSEK, costs ${fmt(qCosts)} kSEK`,
    `Full year A+B: ${fmt(fyRevAB)} kSEK, +Forecast: ${fmt(fyTotal)} kSEK, Target: ${fmt(fyTarget)} kSEK, Costs: ${fmt(fyCosts)} kSEK`,
    pastMonths.length > 0
      ? `Past months actuals: ${pastMonths.map((m, i) => `${monthNames[months.indexOf(m)]} ${fmt(revenueABByMonth[months.indexOf(m)])}`).join(', ')}`
      : '',
  ].filter(Boolean).join('\n')

  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 220,
    messages: [{
      role: 'user',
      content: `You are a concise CFO assistant for Algorithma, a Swedish consulting firm. Analyze this financial data and write a 3-sentence executive summary. Sentence 1: current month vs plan. Sentence 2: quarter outlook. Sentence 3: full-year projection and key risk or highlight. Use kSEK numbers. Be direct and specific.\n\n${lines}`,
    }],
  })

  const block = message.content[0]
  if (block.type !== 'text') throw new Error('Unexpected response type')
  return block.text
}
