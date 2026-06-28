'use client'

import { useEffect, useState } from 'react'
import {
  getBudgetScenarios, getScenarioAnalysis, runScenarioAnalysis,
} from '@/app/actions/budget'
import type { BudgetScenario, ScenarioAnalysis, AnalysisSection } from '@/app/actions/budget'
import { fyLabel } from '@/lib/plan-utils'

interface Props {
  open:    boolean
  onClose: () => void
  fyStart: number
}

function fmt(n: number) {
  return Math.round(n / 1000).toLocaleString('sv-SE')
}

function varCls(actual: number, budget: number, type: 'rev' | 'cost') {
  if (budget === 0 && actual === 0) return 'text-[#9CA3AF]'
  const good = type === 'rev' ? actual >= budget : actual <= budget
  return good ? 'text-[#16A34A]' : 'text-[#DC2626]'
}

function varStr(actual: number, budget: number) {
  const diff = actual - budget
  if (diff === 0) return '—'
  return (diff > 0 ? '+' : '') + fmt(diff)
}

function shortDate(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString('en-SE', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export function AnalysisModal({ open, onClose, fyStart }: Props) {
  const [scenarios,       setScenarios]       = useState<BudgetScenario[]>([])
  const [selectedId,      setSelectedId]      = useState<string | null>(null)
  const [analysis,        setAnalysis]        = useState<ScenarioAnalysis | null>(null)
  const [loadingCheck,    setLoadingCheck]    = useState(false)
  const [running,         setRunning]         = useState(false)
  const [error,           setError]           = useState<string | null>(null)

  // Load scenarios on open
  useEffect(() => {
    if (!open) return
    getBudgetScenarios(fyStart).then(list => {
      setScenarios(list)
      if (list.length > 0) setSelectedId(list[0].id)
    })
  }, [open, fyStart])

  // Check for stored analysis when selected scenario changes
  useEffect(() => {
    if (!selectedId) return
    setAnalysis(null)
    setError(null)
    setLoadingCheck(true)
    getScenarioAnalysis(selectedId, fyStart)
      .then(a => setAnalysis(a))
      .catch(() => setError('Failed to load stored analysis'))
      .finally(() => setLoadingCheck(false))
  }, [selectedId, fyStart])

  // Close on Escape
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  async function handleRun() {
    if (!selectedId) return
    setRunning(true)
    setError(null)
    try {
      const result = await runScenarioAnalysis(selectedId, fyStart)
      setAnalysis(result)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Analysis failed')
    } finally {
      setRunning(false)
    }
  }

  if (!open) return null

  const selectedScenario = scenarios.find(s => s.id === selectedId)

  return (
    <div className="fixed inset-0 z-50 bg-[#F3F4F6] flex flex-col">

      {/* Top bar */}
      <div className="flex items-center gap-4 px-8 py-3 border-b border-[#E5E7EB] bg-white shrink-0 flex-wrap">
        <span className="text-[#9CA3AF] text-sm font-medium whitespace-nowrap">
          Budget Analysis · {fyLabel(fyStart)}
        </span>

        {/* Scenario picker */}
        {scenarios.length > 0 && (
          <select
            value={selectedId ?? ''}
            onChange={e => setSelectedId(e.target.value)}
            className="text-sm border border-[#E5E7EB] rounded-lg px-2.5 py-1 text-[#374151] bg-white focus:outline-none focus:ring-2 focus:ring-[#61b5cc]/40"
          >
            {scenarios.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        )}

        {/* Generated timestamp */}
        {analysis && (
          <span className="text-[#9CA3AF] text-xs whitespace-nowrap">
            Generated {shortDate(analysis.generatedAt)}
          </span>
        )}

        <div className="ml-auto flex items-center gap-2">
          {/* Re-run / Run button */}
          {selectedId && (
            <button
              onClick={handleRun}
              disabled={running || loadingCheck}
              className="px-3 py-1.5 rounded-lg text-sm font-medium border border-[#E5E7EB] text-[#374151] hover:bg-[#F9F9F8] disabled:opacity-40 transition-colors"
            >
              {running ? 'Analysing…' : analysis ? 'Re-run' : 'Run analysis'}
            </button>
          )}

          {/* Close */}
          <button
            onClick={onClose}
            className="text-[#9CA3AF] hover:text-[#374151] text-sm px-3 py-1 rounded-lg hover:bg-[#F3F4F6] transition-colors"
          >
            Exit ×
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto px-8 py-8 max-w-4xl mx-auto w-full">

        {loadingCheck && (
          <div className="flex items-center justify-center py-24 text-[#9CA3AF] text-sm">
            Checking for stored analysis…
          </div>
        )}

        {error && (
          <div className="mb-6 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
            {error}
          </div>
        )}

        {!loadingCheck && !analysis && !running && !error && selectedId && (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <p className="text-[#6B7280] text-sm text-center max-w-sm">
              No analysis found for <strong>{selectedScenario?.name ?? '—'}</strong> in {fyLabel(fyStart)}.
              Run one to compare YTD P&amp;L actuals against this scenario.
            </p>
            <button
              onClick={handleRun}
              disabled={running}
              className="px-5 py-2 rounded-xl bg-[#61b5cc] text-white text-sm font-medium hover:bg-[#4fa3bb] disabled:opacity-40 transition-colors"
            >
              {running ? 'Analysing…' : 'Run analysis'}
            </button>
          </div>
        )}

        {running && (
          <div className="flex items-center justify-center py-24 text-[#9CA3AF] text-sm">
            Allie is analysing your YTD performance…
          </div>
        )}

        {!running && analysis && (
          <div className="space-y-8">

            {/* Comparison table */}
            <div className="bg-white rounded-2xl border border-[#EBEBEB] shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-[#F3F4F6]">
                <h2 className="text-sm font-semibold text-[#0F0F0F]">YTD Comparison — {selectedScenario?.name}</h2>
                <p className="text-xs text-[#9CA3AF] mt-0.5">All amounts in kSEK · A+B actuals from P&amp;L</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-[#F9FAFB] text-[#6B7280]">
                      <th className="text-left px-6 py-2.5 font-medium">Section</th>
                      <th className="text-right px-4 py-2.5 font-medium">Bud rev</th>
                      <th className="text-right px-4 py-2.5 font-medium">Act rev</th>
                      <th className="text-right px-4 py-2.5 font-medium">Rev var</th>
                      <th className="text-right px-4 py-2.5 font-medium">Bud cost</th>
                      <th className="text-right px-4 py-2.5 font-medium">Act cost</th>
                      <th className="text-right px-6 py-2.5 font-medium">Cost var</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F3F4F6]">
                    {analysis.sections.map((s: AnalysisSection) => (
                      <tr key={s.key} className="hover:bg-[#F9FAFB]">
                        <td className="px-6 py-3 font-medium text-[#0F0F0F] whitespace-nowrap">{s.name}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-[#374151]">{s.budgetRev > 0 ? fmt(s.budgetRev) : '—'}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-[#374151]">{s.actualRev > 0 ? fmt(s.actualRev) : '—'}</td>
                        <td className={`px-4 py-3 text-right tabular-nums font-medium ${varCls(s.actualRev, s.budgetRev, 'rev')}`}>{varStr(s.actualRev, s.budgetRev)}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-[#374151]">{s.budgetCost > 0 ? fmt(s.budgetCost) : '—'}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-[#374151]">{s.actualCost > 0 ? fmt(s.actualCost) : '—'}</td>
                        <td className={`px-6 py-3 text-right tabular-nums font-medium ${varCls(s.actualCost, s.budgetCost, 'cost')}`}>{varStr(s.actualCost, s.budgetCost)}</td>
                      </tr>
                    ))}
                    {/* Total row */}
                    {(() => {
                      const tot = analysis.sections.reduce(
                        (acc: { bRev: number; aRev: number; bCost: number; aCost: number }, s: AnalysisSection) => ({
                          bRev:  acc.bRev  + s.budgetRev,
                          aRev:  acc.aRev  + s.actualRev,
                          bCost: acc.bCost + s.budgetCost,
                          aCost: acc.aCost + s.actualCost,
                        }),
                        { bRev: 0, aRev: 0, bCost: 0, aCost: 0 },
                      )
                      return (
                        <tr className="bg-[#F9FAFB] font-semibold">
                          <td className="px-6 py-3 text-[#0F0F0F]">Total</td>
                          <td className="px-4 py-3 text-right tabular-nums text-[#374151]">{fmt(tot.bRev)}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-[#374151]">{fmt(tot.aRev)}</td>
                          <td className={`px-4 py-3 text-right tabular-nums font-semibold ${varCls(tot.aRev, tot.bRev, 'rev')}`}>{varStr(tot.aRev, tot.bRev)}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-[#374151]">{fmt(tot.bCost)}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-[#374151]">{fmt(tot.aCost)}</td>
                          <td className={`px-6 py-3 text-right tabular-nums font-semibold ${varCls(tot.aCost, tot.bCost, 'cost')}`}>{varStr(tot.aCost, tot.bCost)}</td>
                        </tr>
                      )
                    })()}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Headline */}
            <div className="bg-white rounded-2xl border border-[#EBEBEB] shadow-sm px-6 py-5">
              <p className="text-sm font-semibold text-[#0F0F0F] leading-relaxed">{analysis.headline}</p>
            </div>

            {/* Per-section narratives */}
            <div className="bg-white rounded-2xl border border-[#EBEBEB] shadow-sm px-6 py-5">
              <h3 className="text-xs font-semibold text-[#6B7280] uppercase tracking-wide mb-4">Section insights</h3>
              <div className="space-y-4">
                {analysis.sections.filter((s: AnalysisSection) => s.narrative).map((s: AnalysisSection) => (
                  <div key={s.key}>
                    <p className="text-xs font-semibold text-[#374151] mb-1">{s.name}</p>
                    <p className="text-sm text-[#6B7280] leading-relaxed">{s.narrative}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="bg-white rounded-2xl border border-[#EBEBEB] shadow-sm px-6 py-5">
              <h3 className="text-xs font-semibold text-[#6B7280] uppercase tracking-wide mb-4">Recommended actions</h3>
              <ol className="space-y-3">
                {analysis.actions.map((a, i) => (
                  <li key={i} className="flex gap-3 text-sm text-[#374151]">
                    <span className="w-5 h-5 rounded-full bg-[#EFF6FF] text-[#2563EB] text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                    {a}
                  </li>
                ))}
              </ol>
            </div>

            {/* Scenario adjustments */}
            {analysis.adjustments.length > 0 && (
              <div className="bg-white rounded-2xl border border-[#EBEBEB] shadow-sm px-6 py-5">
                <h3 className="text-xs font-semibold text-[#6B7280] uppercase tracking-wide mb-4">Scenario adjustments</h3>
                <ul className="space-y-3">
                  {analysis.adjustments.map((a, i) => (
                    <li key={i} className="text-sm text-[#374151]">
                      <span className="font-medium text-[#0F0F0F]">{a.section}</span>
                      {' — '}
                      {a.suggestion}
                    </li>
                  ))}
                </ul>
              </div>
            )}

          </div>
        )}

      </div>
    </div>
  )
}
