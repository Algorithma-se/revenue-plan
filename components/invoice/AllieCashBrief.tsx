'use client'

import { useEffect, useState } from 'react'
import { getAICashBrief } from '@/app/actions/cash'
import type { CashBriefInput } from '@/app/actions/cash'
import type { AISummaryResult } from '@/app/actions/ai-summary'

const CACHE_KEY = 'alg-cash-brief-v3'

function getMondayKey(): string {
  const today = new Date()
  const day   = today.getDay()
  const diff  = day === 0 ? -6 : 1 - day
  const mon   = new Date(today)
  mon.setDate(today.getDate() + diff)
  return mon.toISOString().slice(0, 10)
}

function readCache(): AISummaryResult | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const { weekKey, result } = JSON.parse(raw)
    return weekKey === getMondayKey() ? result : null
  } catch { return null }
}

function writeCache(result: AISummaryResult) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ weekKey: getMondayKey(), result }))
  } catch {}
}

function parseSummary(text: string): { tagline: string | null; bullets: string[] } | null {
  const lines   = text.split('\n').map(l => l.trim()).filter(Boolean)
  const bullets = lines.filter(l => l.startsWith('• '))
  if (bullets.length === 0) return null
  const tagline = lines.find(l => !l.startsWith('• ')) ?? null
  return { tagline, bullets: bullets.map(l => l.slice(2)) }
}

interface Props {
  input: CashBriefInput
}

export function AllieCashBrief({ input }: Props) {
  const [open,         setOpen]         = useState(false)
  const [result,       setResult]       = useState<AISummaryResult | null>(null)
  const [loading,      setLoading]      = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  const [error,        setError]        = useState(false)

  useEffect(() => {
    if (!open || result || loading) return
    let cancelled = false

    const local = readCache()
    if (local) { setResult(local); return }

    setLoading(true)
    getAICashBrief(input)
      .then(r => {
        if (!cancelled) { writeCache(r); setResult(r); setLoading(false) }
      })
      .catch(() => { if (!cancelled) { setError(true); setLoading(false) } })

    return () => { cancelled = true }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleRegenerate(e: React.MouseEvent) {
    e.stopPropagation()
    setRegenerating(true)
    setError(false)
    try {
      const r = await getAICashBrief(input, true)
      writeCache(r)
      setResult(r)
    } catch {
      setError(true)
    } finally {
      setRegenerating(false)
    }
  }

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', year: 'numeric' })

  const parsed = result ? parseSummary(result.summary) : null

  return (
    <div className="bg-white rounded-2xl border border-[#E5E7EB] overflow-hidden shadow-sm">
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

        <span className="text-[10px] font-bold text-[#64748B] uppercase tracking-widest">Allie&apos;s cash brief</span>

        {result && (
          <span className="text-[10px] text-[#D1D5DB] ml-auto mr-1">
            Generated {fmtDate(result.generatedAt)}
          </span>
        )}

        <button
          onClick={handleRegenerate}
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

      {open && (
        <div className="px-5 py-4">
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
          ) : null}
        </div>
      )}
    </div>
  )
}
