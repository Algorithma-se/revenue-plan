'use client'

import { useEffect, useState } from 'react'
import { getAISummary, getAIYearlySummary } from '@/app/actions/ai-summary'
import type { AISummaryResult, AIYearlyInput } from '@/app/actions/ai-summary'
import type { RevenueRow, CostRow } from '@/types/database'
import { sumCells, sumByStatus } from '@/lib/plan-utils'

const MONTH_CACHE_KEY  = 'alg-ai-summary-v1'
const YEARLY_CACHE_KEY = 'alg-ai-yearly-summary-v1'

function getMondayKey(): string {
  const today = new Date()
  const day   = today.getDay()
  const diff  = day === 0 ? -6 : 1 - day
  const mon   = new Date(today)
  mon.setDate(today.getDate() + diff)
  return mon.toISOString().slice(0, 10)
}

function readLocalCache(key: string): AISummaryResult | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const { weekKey, result } = JSON.parse(raw)
    return weekKey === getMondayKey() ? result : null
  } catch { return null }
}

function writeLocalCache(key: string, result: AISummaryResult) {
  try {
    localStorage.setItem(key, JSON.stringify({ weekKey: getMondayKey(), result }))
  } catch {}
}

function buildMonthInput(
  allRevenueRows: RevenueRow[],
  allCostRows: CostRow[],
  months: readonly string[],
) {
  const today        = new Date()
  const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`

  const topClients = allRevenueRows
    .filter(r => r.client_name)
    .map(r => {
      const currentCell = r.cells[currentMonth]
      return {
        name:      r.client_name!,
        abTotal:   months.reduce((s, m) => {
          const cell = r.cells[m]
          return s + (cell && (cell.status === 'A' || cell.status === 'B') ? cell.amount : 0)
        }, 0),
        fTotal:    months.reduce((s, m) => {
          const cell = r.cells[m]
          return s + (cell && cell.status === 'F' ? cell.amount : 0)
        }, 0),
        currentAB: currentCell && (currentCell.status === 'A' || currentCell.status === 'B') ? currentCell.amount : 0,
        currentF:  currentCell && currentCell.status === 'F' ? currentCell.amount : 0,
      }
    })
    .filter(c => c.abTotal + c.fTotal > 0)
    .sort((a, b) => (b.abTotal + b.fTotal) - (a.abTotal + a.fTotal))
    .slice(0, 8)

  return {
    currentMonth,
    months:           [...months],
    revenueABByMonth: months.map(m => sumByStatus(allRevenueRows, m, ['A', 'B'])),
    forecastByMonth:  months.map(m => sumByStatus(allRevenueRows, m, ['F'])),
    costsByMonth:     months.map(m => sumCells(allCostRows, m)),
    topClients,
  }
}

function buildYearlyInput(
  allRevenueRows: RevenueRow[],
  allCostRows: CostRow[],
  months: readonly string[],
): AIYearlyInput {
  const topClients = allRevenueRows
    .filter(r => r.client_name)
    .map(r => ({
      name:    r.client_name!,
      abTotal: months.reduce((s, m) => {
        const cell = r.cells[m]
        return s + (cell && (cell.status === 'A' || cell.status === 'B') ? cell.amount : 0)
      }, 0),
      fTotal: months.reduce((s, m) => {
        const cell = r.cells[m]
        return s + (cell && cell.status === 'F' ? cell.amount : 0)
      }, 0),
    }))
    .filter(c => c.abTotal + c.fTotal > 0)
    .sort((a, b) => (b.abTotal + b.fTotal) - (a.abTotal + a.fTotal))
    .slice(0, 8)

  const fyLastMonth = months[months.length - 1] ?? ''
  const fyYear      = fyLastMonth ? fyLastMonth.slice(0, 4) : String(new Date().getFullYear())
  const fyEnd       = `31 Jul ${fyYear}`

  return {
    months:           [...months],
    revenueABByMonth: months.map(m => sumByStatus(allRevenueRows, m, ['A', 'B'])),
    forecastByMonth:  months.map(m => sumByStatus(allRevenueRows, m, ['F'])),
    costsByMonth:     months.map(m => sumCells(allCostRows, m)),
    topClients,
    fyYear,
    fyEnd,
  }
}

function parseSummary(text: string): { tagline: string | null; bullets: string[] } | null {
  const lines   = text.split('\n').map(l => l.trim()).filter(Boolean)
  const bullets = lines.filter(l => l.startsWith('• '))
  if (bullets.length === 0) return null
  const tagline = lines.find(l => !l.startsWith('• ')) ?? null
  return { tagline, bullets: bullets.map(l => l.slice(2)) }
}

function deriveStatus(allRevenueRows: RevenueRow[], allCostRows: CostRow[]) {
  const today        = new Date()
  const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`
  const rev          = sumByStatus(allRevenueRows, currentMonth, ['A', 'B'])
  const costs        = sumCells(allCostRows, currentMonth)
  if (rev === 0) return null
  const pct = Math.round(((rev - costs) / rev) * 100)
  return pct >= 20
    ? { label: 'On track',     dot: 'bg-[#16A34A]', pill: 'text-[#16A34A] bg-[#F0FDF4] border border-[#BBF7D0]' }
    : pct >= 0
    ? { label: 'Watch',        dot: 'bg-[#D97706]', pill: 'text-[#B45309] bg-[#FFFBEB] border border-[#FDE68A]' }
    : { label: 'Below target', dot: 'bg-[#DC2626]', pill: 'text-[#DC2626] bg-[#FFF1F2] border border-[#FECDD3]' }
}

interface Props {
  allRevenueRows: RevenueRow[]
  allCostRows:    CostRow[]
  months:         readonly string[]
  scope?:         'month' | 'year'
  sideContent?:   React.ReactNode
}

export function AISummary({ allRevenueRows, allCostRows, months, scope = 'month', sideContent }: Props) {
  const [open,         setOpen]         = useState(false)
  const [result,       setResult]       = useState<AISummaryResult | null>(null)
  const [loading,      setLoading]      = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  const [error,        setError]        = useState(false)

  const cacheKey = scope === 'year' ? YEARLY_CACHE_KEY : MONTH_CACHE_KEY
  const label    = scope === 'year' ? "Allie's year-end view" : "Allie's take"

  // Load when first opened
  useEffect(() => {
    if (!open || result || loading) return
    let cancelled = false

    const local = readLocalCache(cacheKey)
    if (local) { setResult(local); return }

    setLoading(true)
    const fetch = scope === 'year'
      ? getAIYearlySummary(buildYearlyInput(allRevenueRows, allCostRows, months))
      : getAISummary(buildMonthInput(allRevenueRows, allCostRows, months))

    fetch
      .then(r => {
        if (!cancelled) { writeLocalCache(cacheKey, r); setResult(r); setLoading(false) }
      })
      .catch(() => { if (!cancelled) { setError(true); setLoading(false) } })

    return () => { cancelled = true }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleRegenerate() {
    setRegenerating(true)
    setError(false)
    try {
      const r = scope === 'year'
        ? await getAIYearlySummary(buildYearlyInput(allRevenueRows, allCostRows, months), true)
        : await getAISummary(buildMonthInput(allRevenueRows, allCostRows, months), true)
      writeLocalCache(cacheKey, r)
      setResult(r)
    } catch {
      setError(true)
    } finally {
      setRegenerating(false)
    }
  }

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', year: 'numeric' })

  const status = scope === 'month' ? deriveStatus(allRevenueRows, allCostRows) : null
  const parsed = result ? parseSummary(result.summary) : null

  return (
    <div className="bg-white rounded-2xl border border-[#E5E7EB] overflow-hidden shadow-sm">

      {/* Collapsible header */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-5 py-3 bg-[#F8FAFC] border-b border-[#E5E7EB] hover:bg-[#F1F5F9] transition-colors"
      >
        <div
          className="w-5 h-5 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: 'linear-gradient(135deg, #65deff 0%, #61b5cc 100%)' }}
        >
          <svg viewBox="0 0 16 16" fill="white" className="w-3 h-3">
            <path d="M11.251.068a.5.5 0 01.227.58L9.677 6.5H13a.5.5 0 01.364.843l-8 8.5a.5.5 0 01-.842-.49L6.323 9.5H3a.5.5 0 01-.364-.843l8-8.5a.5.5 0 01.615-.09z"/>
          </svg>
        </div>

        <span className="text-[10px] font-bold text-[#64748B] uppercase tracking-widest">{label}</span>

        {status && (
          <span className={`flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${status.pill}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
            {status.label}
          </span>
        )}

        {result && (
          <span className="text-[10px] text-[#D1D5DB] ml-auto mr-1">
            Generated {fmtDate(result.generatedAt)}
          </span>
        )}

        <button
          onClick={e => { e.stopPropagation(); handleRegenerate() }}
          disabled={regenerating || loading}
          title="Regenerate"
          className="text-[#C4C9D4] hover:text-[#6B7280] transition-colors disabled:opacity-40 flex-shrink-0"
        >
          <svg viewBox="0 0 16 16" fill="currentColor" className={`w-3 h-3 ${regenerating ? 'animate-spin' : ''}`}>
            <path fillRule="evenodd" d="M8 3a5 5 0 1 0 4.546 2.914.5.5 0 0 1 .908-.417A6 6 0 1 1 8 2v1z"/>
            <path d="M8 4.466V.534a.25.25 0 0 1 .41-.192l2.36 1.966c.12.1.12.284 0 .384L8.41 4.658A.25.25 0 0 1 8 4.466z"/>
          </svg>
        </button>

        <svg
          viewBox="0 0 16 16" fill="currentColor"
          className={`w-3 h-3 text-[#9CA3AF] transition-transform flex-shrink-0 ${open ? '' : '-rotate-90'}`}
        >
          <path fillRule="evenodd" d="M1.646 4.646a.5.5 0 01.708 0L8 10.293l5.646-5.647a.5.5 0 01.708.708l-6 6a.5.5 0 01-.708 0l-6-6a.5.5 0 010-.708z" clipRule="evenodd" />
        </svg>
      </button>

      {/* Body — only rendered when open */}
      {open && (
        <div className="px-5 py-4">
          <div className="flex flex-col sm:flex-row gap-5">
            <div className="flex-1 min-w-0">
              {loading ? (
                <div className="space-y-2">
                  <div className="h-3.5 bg-[#F3F4F6] rounded-full animate-pulse w-3/4" />
                  <div className="h-3 bg-[#F3F4F6] rounded-full animate-pulse w-full mt-3" />
                  <div className="h-3 bg-[#F3F4F6] rounded-full animate-pulse w-11/12" />
                  <div className="h-3 bg-[#F3F4F6] rounded-full animate-pulse w-full" />
                  <div className="h-3 bg-[#F3F4F6] rounded-full animate-pulse w-4/5" />
                </div>
              ) : error ? (
                <p className="text-xs text-[#9CA3AF] italic">Allie is unavailable right now.</p>
              ) : parsed ? (
                <div className={`transition-opacity ${regenerating ? 'opacity-40' : 'opacity-100'}`}>
                  {parsed.tagline && (
                    <p className="text-sm text-[#374151] italic mb-3">{parsed.tagline}</p>
                  )}
                  <ul className="space-y-1.5">
                    {parsed.bullets.map((b, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-[#374151]">
                        <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-[#61b5cc] flex-shrink-0" />
                        <span className="leading-snug">{b.charAt(0).toUpperCase() + b.slice(1)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : result ? (
                <p className={`text-sm text-[#374151] leading-relaxed transition-opacity ${regenerating ? 'opacity-40' : 'opacity-100'}`}>
                  {result.summary}
                </p>
              ) : null}
            </div>
            {sideContent && (
              <div className="sm:w-72 flex-shrink-0">{sideContent}</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
