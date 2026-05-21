'use client'

import { useEffect, useState } from 'react'
import { getAISummary } from '@/app/actions/ai-summary'
import type { AISummaryResult } from '@/app/actions/ai-summary'
import type { RevenueRow, CostRow } from '@/types/database'
import { sumCells, sumByStatus } from '@/lib/plan-utils'

const LOCAL_CACHE_KEY = 'alg-ai-summary-v1'

function getMondayKey(): string {
  const today = new Date()
  const day   = today.getDay()
  const diff  = day === 0 ? -6 : 1 - day
  const mon   = new Date(today)
  mon.setDate(today.getDate() + diff)
  return mon.toISOString().slice(0, 10)
}

function readLocalCache(): AISummaryResult | null {
  try {
    const raw = localStorage.getItem(LOCAL_CACHE_KEY)
    if (!raw) return null
    const { weekKey, result } = JSON.parse(raw)
    return weekKey === getMondayKey() ? result : null
  } catch { return null }
}

function writeLocalCache(result: AISummaryResult) {
  try {
    localStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify({ weekKey: getMondayKey(), result }))
  } catch {}
}

function buildInput(
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

function parseSummary(text: string): { tagline: string | null; bullets: string[] } | null {
  const lines   = text.split('\n').map(l => l.trim()).filter(Boolean)
  const bullets = lines.filter(l => l.startsWith('• '))
  if (bullets.length === 0) return null
  const tagline = lines.find(l => !l.startsWith('• ')) ?? null
  return { tagline, bullets: bullets.map(l => l.slice(2)) }
}

function deriveStatus(allRevenueRows: RevenueRow[], allCostRows: CostRow[], months: readonly string[]) {
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

export function AISummary({
  allRevenueRows, allCostRows, months,
}: {
  allRevenueRows: RevenueRow[]
  allCostRows:    CostRow[]
  months:         readonly string[]
}) {
  const [result, setResult]             = useState<AISummaryResult | null>(null)
  const [loading, setLoading]           = useState(true)
  const [regenerating, setRegenerating] = useState(false)
  const [error, setError]               = useState(false)

  useEffect(() => {
    let cancelled = false

    // Serve from localStorage immediately if same week
    const local = readLocalCache()
    if (local) {
      setResult(local)
      setLoading(false)
      return
    }

    // Otherwise fetch (server checks DB cache, only calls AI on miss)
    getAISummary(buildInput(allRevenueRows, allCostRows, months))
      .then(r => {
        if (!cancelled) {
          writeLocalCache(r)
          setResult(r)
          setLoading(false)
        }
      })
      .catch(() => { if (!cancelled) { setError(true); setLoading(false) } })

    return () => { cancelled = true }
  }, []) // intentionally run once on mount

  async function handleRegenerate() {
    setRegenerating(true)
    setError(false)
    try {
      const r = await getAISummary(buildInput(allRevenueRows, allCostRows, months), true)
      writeLocalCache(r)
      setResult(r)
    } catch {
      setError(true)
    } finally {
      setRegenerating(false)
    }
  }

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', year: 'numeric' })

  const status = deriveStatus(allRevenueRows, allCostRows, months)
  const parsed = result ? parseSummary(result.summary) : null

  return (
    <div className="bg-white rounded-2xl border border-[#EBEBEB] p-4 shadow-sm h-full">

      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <div
          className="w-5 h-5 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: 'linear-gradient(135deg, #65deff 0%, #61b5cc 100%)' }}
        >
          <svg viewBox="0 0 16 16" fill="white" className="w-3 h-3">
            <path d="M11.251.068a.5.5 0 01.227.58L9.677 6.5H13a.5.5 0 01.364.843l-8 8.5a.5.5 0 01-.842-.49L6.323 9.5H3a.5.5 0 01-.364-.843l8-8.5a.5.5 0 01.615-.09z"/>
          </svg>
        </div>
        <span className="text-xs font-bold text-[#6B7280] uppercase tracking-wider">Monthly Status</span>

        {!loading && status && (
          <span className={`flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${status.pill}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
            {status.label}
          </span>
        )}

        {result && !loading && (
          <>
            <span className="text-[10px] text-[#D1D5DB] ml-auto">Generated {fmtDate(result.generatedAt)}</span>
          </>
        )}

        {!loading && (
          <button
            onClick={handleRegenerate}
            disabled={regenerating}
            title="Regenerate summary"
            className={`flex items-center gap-1 text-[10px] text-[#9CA3AF] hover:text-[#6B7280] transition-colors disabled:opacity-40 cursor-pointer ${result ? '' : 'ml-auto'}`}
          >
            <svg
              viewBox="0 0 16 16" fill="currentColor"
              className={`w-3 h-3 ${regenerating ? 'animate-spin' : ''}`}
            >
              <path fillRule="evenodd" d="M8 3a5 5 0 1 0 4.546 2.914.5.5 0 0 1 .908-.417A6 6 0 1 1 8 2v1z"/>
              <path d="M8 4.466V.534a.25.25 0 0 1 .41-.192l2.36 1.966c.12.1.12.284 0 .384L8.41 4.658A.25.25 0 0 1 8 4.466z"/>
            </svg>
          </button>
        )}
      </div>

      {/* Body */}
      {loading ? (
        <div className="space-y-2">
          <div className="h-3.5 bg-[#F3F4F6] rounded-full animate-pulse w-3/4" />
          <div className="h-3 bg-[#F3F4F6] rounded-full animate-pulse w-full mt-3" />
          <div className="h-3 bg-[#F3F4F6] rounded-full animate-pulse w-11/12" />
          <div className="h-3 bg-[#F3F4F6] rounded-full animate-pulse w-full" />
          <div className="h-3 bg-[#F3F4F6] rounded-full animate-pulse w-4/5" />
        </div>
      ) : error ? (
        <p className="text-xs text-[#9CA3AF] italic">AI summary unavailable.</p>
      ) : parsed ? (
        <div className={`transition-opacity ${regenerating ? 'opacity-40' : 'opacity-100'}`}>
          {parsed.tagline && (
            <p className="text-sm text-[#374151] italic mb-2">{parsed.tagline}</p>
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
      ) : (
        <p className={`text-sm text-[#374151] leading-relaxed transition-opacity ${regenerating ? 'opacity-40' : 'opacity-100'}`}>
          {result?.summary}
        </p>
      )}
    </div>
  )
}
