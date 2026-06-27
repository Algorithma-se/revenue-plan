'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { getFiscalMonths, fyLabel, currentFyStart, monthLabel } from '@/lib/plan-utils'
import { codesFor } from '@/lib/budget-accounts'
import type { AccountDef } from '@/lib/budget-accounts'
import { BudgetCell } from '@/components/budget/BudgetCell'
import {
  getBudgetScenarios, createBudgetScenario, renameBudgetScenario,
  deleteBudgetScenario, getBudgetData, addBudgetLine, deleteBudgetLine,
  upsertBudgetCell,
} from '@/app/actions/budget'
import type { BudgetScenario, BudgetLine, BudgetCells } from '@/app/actions/budget'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Pod { id: string; name: string; sort: number }

type SectionKind = { kind: 'platform' } | { kind: 'pod'; pod: Pod } | { kind: 'leadership' }

// ─── Helpers ──────────────────────────────────────────────────────────────────

function kFmt(v: number) { return v === 0 ? '—' : Math.round(v / 1000).toLocaleString('sv-SE') }
function pct(n: number, d: number) { return d === 0 ? null : Math.round((n / d) * 100) }
function pctStr(n: number, d: number) { const p = pct(n, d); return p == null ? '—' : `${p}%` }
function pctCls(n: number, d: number) {
  const p = pct(n, d)
  if (p == null) return 'text-[#9CA3AF]'
  if (p >= 30)   return 'text-[#16A34A]'
  if (p >= 0)    return 'text-[#D97706]'
  return 'text-[#DC2626]'
}

function sumLines(lineIds: string[], cells: BudgetCells, months: readonly string[]): Record<string, number> {
  return Object.fromEntries(months.map(m => [
    m, lineIds.reduce((s, id) => s + (cells[id]?.[m] ?? 0), 0),
  ]))
}

const BADGE: Record<string, string> = {
  platform:   'bg-[#2563EB]',
  services:   'bg-[#7C3AED]',
  leadership: 'bg-[#6B7280]',
}

// ─── Add-row inline form ───────────────────────────────────────────────────────

function AddRowForm({ codes, onAdd, onCancel }: {
  codes:    AccountDef[]
  onAdd:    (code: string, label: string) => Promise<void>
  onCancel: () => void
}) {
  const [code,  setCode]  = useState(codes[0]?.code ?? '')
  const [label, setLabel] = useState('')
  const [busy,  setBusy]  = useState(false)

  async function submit() {
    if (!label.trim() || busy) return
    setBusy(true)
    await onAdd(code, label.trim())
    setBusy(false)
  }

  return (
    <tr className="bg-[#F0F7FF]">
      <td className="pl-4 pr-1 py-1.5">
        <select value={code} onChange={e => setCode(e.target.value)}
          className="text-xs border border-[#D1D5DB] rounded px-1 py-0.5 bg-white text-[#374151] outline-none focus:border-[#61b5cc]">
          {codes.map(c => (
            <option key={c.code} value={c.code}>{c.code} – {c.name}</option>
          ))}
        </select>
      </td>
      <td className="px-1 py-1.5" colSpan={2}>
        <input
          autoFocus
          value={label}
          onChange={e => setLabel(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') onCancel() }}
          placeholder="Label (client, description…)"
          className="w-full text-xs border border-[#D1D5DB] rounded px-2 py-0.5 bg-white outline-none focus:border-[#61b5cc] ring-1 ring-transparent focus:ring-[#61b5cc]"
        />
      </td>
      <td className="px-1 py-1.5 text-right" colSpan={2}>
        <div className="flex items-center justify-end gap-1.5">
          <button onClick={submit} disabled={busy || !label.trim()}
            className="px-2 py-0.5 rounded bg-[#2563EB] text-white text-xs font-medium disabled:opacity-40 hover:bg-[#1D4ED8] transition-colors">
            Add
          </button>
          <button onClick={onCancel} className="px-2 py-0.5 rounded text-xs text-[#6B7280] hover:bg-[#F3F4F6] transition-colors">
            Cancel
          </button>
        </div>
      </td>
    </tr>
  )
}

// ─── Line row ────────────────────────────────────────────────────────────────

function LineRow({ line, months, cells, onSave, onDelete }: {
  line:     BudgetLine
  months:   readonly string[]
  cells:    Record<string, number>
  onSave:   (lineId: string, month: string, amount: number) => Promise<void>
  onDelete: (lineId: string) => Promise<void>
}) {
  const total = months.reduce((s, m) => s + (cells[m] ?? 0), 0)
  return (
    <tr className="border-b border-[#F3F4F6] hover:bg-[#FAFAFA] group transition-colors">
      <td className="pl-4 pr-1 py-0.5">
        <span className="inline-block text-[9px] font-bold text-[#9CA3AF] bg-[#F3F4F6] border border-[#E5E7EB] rounded px-1 py-0.5 tabular-nums">
          {line.account_code}
        </span>
      </td>
      <td className="px-2 py-0.5 min-w-[160px]">
        <span className="text-xs text-[#374151]">{line.label}</span>
      </td>
      {months.map(m => (
        <td key={m} className="px-0 py-0 min-w-[52px]">
          <BudgetCell
            amount={cells[m] ?? 0}
            onSave={v => onSave(line.id, m, v)}
          />
        </td>
      ))}
      <td className="px-2 py-0">
        <div className="flex items-center justify-end gap-1 min-h-[36px]">
          <span className={`text-xs font-semibold tabular-nums ${total === 0 ? 'text-[#D1D5DB]' : 'text-[#111827]'}`}>
            {kFmt(total)}
          </span>
          <button
            onClick={() => onDelete(line.id)}
            className="opacity-0 group-hover:opacity-100 ml-1 p-0.5 rounded text-[#D1D5DB] hover:text-[#DC2626] hover:bg-[#FEF2F2] transition-colors"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </td>
    </tr>
  )
}

// ─── Line group (Revenue or Cost) ─────────────────────────────────────────────

function LineGroup({ groupLabel, lines, months, cells, onSave, onDelete, validCodes, onAdd }: {
  groupLabel: string
  lines:      BudgetLine[]
  months:     readonly string[]
  cells:      BudgetCells
  onSave:     (lineId: string, month: string, amount: number) => Promise<void>
  onDelete:   (lineId: string) => Promise<void>
  validCodes: AccountDef[]
  onAdd:      (code: string, label: string) => Promise<void>
}) {
  const [adding, setAdding] = useState(false)

  const subtotal = sumLines(lines.map(l => l.id), cells, months)
  const fyTotal  = months.reduce((s, m) => s + (subtotal[m] ?? 0), 0)

  return (
    <>
      <tr>
        <td colSpan={months.length + 3} className="pl-4 pt-2 pb-0.5">
          <span className="text-[9px] font-bold text-[#9CA3AF] uppercase tracking-widest">{groupLabel}</span>
        </td>
      </tr>

      {lines.map(line => (
        <LineRow key={line.id} line={line} months={months}
          cells={cells[line.id] ?? {}} onSave={onSave} onDelete={onDelete} />
      ))}

      {adding && (
        <AddRowForm codes={validCodes}
          onAdd={async (code, label) => { await onAdd(code, label); setAdding(false) }}
          onCancel={() => setAdding(false)} />
      )}

      <tr>
        <td colSpan={months.length + 3} className="pl-4 pb-1.5 pt-0.5">
          <button onClick={() => setAdding(true)}
            className="text-[10px] text-[#9CA3AF] hover:text-[#2563EB] transition-colors flex items-center gap-0.5">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Add {groupLabel.toLowerCase()} row
          </button>
        </td>
      </tr>

      {(lines.length > 0 || fyTotal > 0) && (
        <tr className="bg-[#F9FAFB] border-t border-[#E5E7EB]">
          <td colSpan={2} className="pl-4 pr-2 py-1.5 text-[10px] font-bold text-[#6B7280] uppercase tracking-widest">
            {groupLabel} subtotal
          </td>
          {months.map(m => (
            <td key={m} className="px-1 py-1.5 text-right text-xs font-semibold text-[#374151] tabular-nums">
              {kFmt(subtotal[m] ?? 0)}
            </td>
          ))}
          <td className="px-2 py-1.5 text-right text-xs font-bold text-[#111827] tabular-nums">
            {kFmt(fyTotal)}
          </td>
        </tr>
      )}
    </>
  )
}

// ─── Section card ────────────────────────────────────────────────────────────

function SectionCard({ section, label, badge, badgeClass, months, lines, cells, fyStart, scenarioId, podId = null, onLinesChange, onSave }: {
  section:       'platform' | 'services' | 'leadership'
  label:         string
  badge:         string
  badgeClass:    string
  months:        readonly string[]
  lines:         BudgetLine[]
  cells:         BudgetCells
  fyStart:       number
  scenarioId:    string
  podId?:        string | null
  onLinesChange: (lines: BudgetLine[]) => void
  onSave:        (lineId: string, month: string, amount: number) => Promise<void>
}) {
  const revLines  = lines.filter(l => l.line_type === 'revenue')
  const costLines = lines.filter(l => l.line_type === 'cost')
  const revCodes  = codesFor(section, 'revenue')
  const costCodes = codesFor(section, 'cost')

  const revByMonth  = sumLines(revLines.map(l => l.id), cells, months)
  const costByMonth = sumLines(costLines.map(l => l.id), cells, months)
  const marginByMonth = Object.fromEntries(months.map(m => [m, (revByMonth[m] ?? 0) - (costByMonth[m] ?? 0)]))

  const totalRev    = months.reduce((s, m) => s + (revByMonth[m] ?? 0), 0)
  const totalCost   = months.reduce((s, m) => s + (costByMonth[m] ?? 0), 0)
  const totalMargin = totalRev - totalCost

  async function handleAdd(type: 'revenue' | 'cost', code: string, label: string) {
    const newLine = await addBudgetLine(scenarioId, fyStart, {
      segment: section, pod_id: podId, account_code: code, line_type: type, label,
    })
    onLinesChange([...lines, newLine])
  }

  async function handleDelete(lineId: string) {
    await deleteBudgetLine(lineId)
    onLinesChange(lines.filter(l => l.id !== lineId))
  }

  return (
    <div className="bg-white rounded-2xl border border-[#E5E7EB] shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-[#F3F4F6]">
        <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-bold text-white ${badgeClass}`}>
          {badge}
        </span>
        <span className="text-sm font-semibold text-[#0F0F0F]">{label}</span>
        {totalRev > 0 && (
          <div className="ml-auto flex items-center gap-4">
            <div className="text-right">
              <p className="text-[10px] text-[#9CA3AF] uppercase tracking-widest">Revenue</p>
              <p className="text-xs font-semibold text-[#374151] tabular-nums">{kFmt(totalRev)}</p>
            </div>
            <div className="w-px h-6 bg-[#E5E7EB]" />
            <div className="text-right">
              <p className="text-[10px] text-[#9CA3AF] uppercase tracking-widest">Margin</p>
              <p className={`text-xs font-semibold tabular-nums ${pctCls(totalMargin, totalRev)}`}>
                {pctStr(totalMargin, totalRev)}
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-[#F9FAFB]">
              <th className="pl-4 pr-1 py-2 text-left w-16">
                <span className="text-[10px] font-bold text-[#9CA3AF] uppercase tracking-widest">Code</span>
              </th>
              <th className="px-2 py-2 text-left min-w-[160px]">
                <span className="text-[10px] font-bold text-[#9CA3AF] uppercase tracking-widest">Description</span>
              </th>
              {months.map(m => (
                <th key={m} className="px-1 py-2 text-right min-w-[52px]">
                  <span className="text-[10px] font-bold text-[#9CA3AF] uppercase tracking-widest">{monthLabel(m)}</span>
                </th>
              ))}
              <th className="px-2 py-2 text-right min-w-[64px]">
                <span className="text-[10px] font-bold text-[#9CA3AF] uppercase tracking-widest">FY</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {revCodes.length > 0 && (
              <LineGroup
                groupLabel="Revenue"
                lines={revLines}
                months={months}
                cells={cells}
                onSave={onSave}
                onDelete={handleDelete}
                validCodes={revCodes}
                onAdd={(code, label) => handleAdd('revenue', code, label)}
              />
            )}
            <LineGroup
              groupLabel="Costs"
              lines={costLines}
              months={months}
              cells={cells}
              onSave={onSave}
              onDelete={handleDelete}
              validCodes={costCodes}
              onAdd={(code, label) => handleAdd('cost', code, label)}
            />
            {/* Margin row */}
            {revCodes.length > 0 && (revLines.length > 0 || costLines.length > 0) && (
              <tr className="bg-[#F9FAFB] border-t border-[#E5E7EB]">
                <td colSpan={2} className="pl-4 pr-2 py-2 text-[10px] font-bold text-[#9CA3AF] uppercase tracking-widest">
                  {section === 'platform' ? 'Software Gross Margin' : 'Service Margin'}
                </td>
                {months.map(m => (
                  <td key={m} className={`px-1 py-2 text-right text-xs font-semibold tabular-nums ${pctCls(marginByMonth[m] ?? 0, revByMonth[m] ?? 0)}`}>
                    {pctStr(marginByMonth[m] ?? 0, revByMonth[m] ?? 0)}
                  </td>
                ))}
                <td className={`px-2 py-2 text-right text-xs font-bold tabular-nums ${pctCls(totalMargin, totalRev)}`}>
                  {pctStr(totalMargin, totalRev)}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function BudgetPage() {
  const [fyStart,    setFyStart]    = useState(currentFyStart)
  const [pods,       setPods]       = useState<Pod[]>([])
  const [scenarios,  setScenarios]  = useState<BudgetScenario[]>([])
  const [activeId,   setActiveId]   = useState<string | null>(null)
  const [lines,      setLines]      = useState<BudgetLine[]>([])
  const [cells,      setCells]      = useState<BudgetCells>({})
  const [loading,    setLoading]    = useState(true)
  const [creating,   setCreating]   = useState(false)
  const [newName,    setNewName]    = useState('')
  const [renameId,   setRenameId]   = useState<string | null>(null)
  const [renameName, setRenameName] = useState('')
  const [dropOpen,   setDropOpen]   = useState(false)

  const months = getFiscalMonths(fyStart)

  // Load pods once
  useEffect(() => {
    supabase.from('pods').select('id, name, sort').order('sort')
      .then(({ data }) => setPods((data ?? []) as Pod[]))
  }, [])

  const loadScenarios = useCallback(async () => {
    setLoading(true)
    const list = await getBudgetScenarios(fyStart)
    setScenarios(list)
    if (list.length > 0 && !list.find(s => s.id === activeId)) {
      setActiveId(list[0].id)
    } else if (list.length === 0) {
      setActiveId(null); setLines([]); setCells({}); setLoading(false)
    }
  }, [fyStart]) // eslint-disable-line react-hooks/exhaustive-deps

  const loadData = useCallback(async (id: string) => {
    setLoading(true)
    const { lines: l, cells: c } = await getBudgetData(id)
    setLines(l); setCells(c); setLoading(false)
  }, [])

  useEffect(() => { loadScenarios() }, [loadScenarios])
  useEffect(() => { if (activeId) loadData(activeId) }, [activeId, loadData])

  async function handleCreate() {
    if (!newName.trim()) return
    const s = await createBudgetScenario(newName.trim(), fyStart)
    setScenarios(prev => [...prev, s]); setActiveId(s.id); setNewName(''); setCreating(false)
  }

  async function handleRename() {
    if (!renameId || !renameName.trim()) return
    await renameBudgetScenario(renameId, renameName.trim())
    setScenarios(prev => prev.map(s => s.id === renameId ? { ...s, name: renameName.trim() } : s))
    setRenameId(null); setRenameName('')
  }

  async function handleDelete(id: string) {
    await deleteBudgetScenario(id)
    const rem = scenarios.filter(s => s.id !== id)
    setScenarios(rem); if (activeId === id) setActiveId(rem[0]?.id ?? null)
  }

  async function handleSave(lineId: string, month: string, amount: number) {
    await upsertBudgetCell(lineId, month, amount)
    setCells(prev => ({ ...prev, [lineId]: { ...(prev[lineId] ?? {}), [month]: amount } }))
  }

  function linesForSection(segment: 'platform' | 'services' | 'leadership', podId?: string | null) {
    if (segment === 'services')  return lines.filter(l => l.segment === 'services' && l.pod_id === podId)
    return lines.filter(l => l.segment === segment)
  }

  // Summary
  const summary = useMemo(() => {
    const platRevIds  = lines.filter(l => l.segment === 'platform'   && l.line_type === 'revenue').map(l => l.id)
    const platCostIds = lines.filter(l => l.segment === 'platform'   && l.line_type === 'cost').map(l => l.id)
    const svcRevIds   = lines.filter(l => l.segment === 'services'   && l.line_type === 'revenue').map(l => l.id)
    const svcCostIds  = lines.filter(l => l.segment === 'services'   && l.line_type === 'cost').map(l => l.id)
    const ldCostIds   = lines.filter(l => l.segment === 'leadership' && l.line_type === 'cost').map(l => l.id)

    return months.map(m => {
      const platRev  = platRevIds .reduce((s, id) => s + (cells[id]?.[m] ?? 0), 0)
      const platCost = platCostIds.reduce((s, id) => s + (cells[id]?.[m] ?? 0), 0)
      const svcRev   = svcRevIds  .reduce((s, id) => s + (cells[id]?.[m] ?? 0), 0)
      const svcCost  = svcCostIds .reduce((s, id) => s + (cells[id]?.[m] ?? 0), 0)
      const ldCost   = ldCostIds  .reduce((s, id) => s + (cells[id]?.[m] ?? 0), 0)
      const totalRev = platRev + svcRev
      const grossProfit = totalRev - platCost - svcCost
      return { m, totalRev, grossProfit, ldCost, ebit: grossProfit - ldCost }
    })
  }, [lines, cells, months])

  const totals = summary.reduce((a, r) => ({
    totalRev:    a.totalRev    + r.totalRev,
    grossProfit: a.grossProfit + r.grossProfit,
    ldCost:      a.ldCost      + r.ldCost,
    ebit:        a.ebit        + r.ebit,
  }), { totalRev: 0, grossProfit: 0, ldCost: 0, ebit: 0 })

  const activeScenario = scenarios.find(s => s.id === activeId)

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">

      {/* Header */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <h1 className="text-xl font-bold text-[#0F0F0F]">Budget</h1>
        <div className="flex items-center gap-1 ml-1">
          <button onClick={() => setFyStart(y => y - 1)} className="p-1 rounded text-[#9CA3AF] hover:text-[#374151] hover:bg-[#F3F4F6] transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
          </button>
          <span className="text-sm font-semibold text-[#374151] tabular-nums">{fyLabel(fyStart)}</span>
          <button onClick={() => setFyStart(y => y + 1)} className="p-1 rounded text-[#9CA3AF] hover:text-[#374151] hover:bg-[#F3F4F6] transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
          </button>
        </div>

        {scenarios.length > 0 && (
          <div className="relative">
            <button onClick={() => setDropOpen(o => !o)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#E5E7EB] text-sm text-[#374151] hover:bg-[#F9FAFB] transition-colors">
              <span>{activeScenario?.name ?? '—'}</span>
              <svg className="w-3.5 h-3.5 text-[#9CA3AF]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
            </button>
            {dropOpen && (
              <>
                <div className="fixed inset-0 z-20" onClick={() => setDropOpen(false)} />
                <div className="absolute left-0 top-full mt-1 z-30 bg-white border border-[#E5E7EB] rounded-xl shadow-lg py-1 min-w-[200px]">
                  {scenarios.map(s => (
                    <div key={s.id} className="flex items-center group">
                      <button onClick={() => { setActiveId(s.id); setDropOpen(false) }}
                        className={`flex-1 text-left px-4 py-2 text-sm transition-colors ${s.id === activeId ? 'text-[#2563EB] font-semibold bg-[#EFF6FF]' : 'text-[#374151] hover:bg-[#F9FAFB]'}`}>
                        {s.id === renameId ? (
                          <input autoFocus value={renameName} onChange={e => setRenameName(e.target.value)}
                            onBlur={handleRename}
                            onKeyDown={e => { if (e.key === 'Enter') handleRename(); if (e.key === 'Escape') setRenameId(null) }}
                            onClick={e => e.stopPropagation()}
                            className="w-full outline-none bg-transparent" />
                        ) : s.name}
                      </button>
                      {s.id !== renameId && (
                        <div className="flex gap-0.5 pr-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={e => { e.stopPropagation(); setRenameId(s.id); setRenameName(s.name) }}
                            className="p-1 rounded text-[#9CA3AF] hover:text-[#374151] hover:bg-[#F3F4F6]">
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536M9 11l6-6 3 3-6 6H9v-3z" /></svg>
                          </button>
                          <button onClick={e => { e.stopPropagation(); if (confirm(`Delete "${s.name}"?`)) handleDelete(s.id) }}
                            className="p-1 rounded text-[#9CA3AF] hover:text-[#DC2626] hover:bg-[#FEF2F2]">
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M9 7V4h6v3M4 7h16" /></svg>
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {creating ? (
          <div className="flex items-center gap-1.5">
            <input autoFocus value={newName} onChange={e => setNewName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') { setCreating(false); setNewName('') } }}
              placeholder="Scenario name…"
              className="px-3 py-1.5 rounded-lg border border-[#61b5cc] ring-1 ring-[#61b5cc] text-sm outline-none w-44" />
            <button onClick={handleCreate} className="px-3 py-1.5 rounded-lg bg-[#2563EB] text-white text-sm font-medium hover:bg-[#1D4ED8] transition-colors">Create</button>
            <button onClick={() => { setCreating(false); setNewName('') }} className="px-3 py-1.5 rounded-lg text-[#6B7280] text-sm hover:bg-[#F3F4F6] transition-colors">Cancel</button>
          </div>
        ) : (
          <button onClick={() => setCreating(true)}
            className="px-3 py-1.5 rounded-lg border border-dashed border-[#D1D5DB] text-sm text-[#6B7280] hover:border-[#9CA3AF] hover:text-[#374151] hover:bg-[#F9FAFB] transition-colors">
            + New scenario
          </button>
        )}
      </div>

      {!loading && scenarios.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <p className="text-[#374151] font-semibold mb-1">No budget scenarios yet</p>
          <p className="text-sm text-[#9CA3AF] mb-4">Create your first scenario to start budgeting {fyLabel(fyStart)}</p>
          <button onClick={() => setCreating(true)} className="px-4 py-2 rounded-xl bg-[#2563EB] text-white text-sm font-medium hover:bg-[#1D4ED8] transition-colors">+ New scenario</button>
        </div>
      )}

      {loading && activeId && (
        <div className="space-y-4">{[1,2,3].map(i => <div key={i} className="bg-white rounded-2xl border border-[#E5E7EB] h-40 animate-pulse" />)}</div>
      )}

      {!loading && activeId && (
        <div className="space-y-4">

          {/* AOS Platform */}
          <SectionCard
            section="platform" label="AOS Platform" badge="P" badgeClass="bg-[#2563EB]"
            months={months} lines={linesForSection('platform')} cells={cells}
            fyStart={fyStart} scenarioId={activeId}
            onLinesChange={updated => setLines(prev => [...prev.filter(l => l.segment !== 'platform'), ...updated])}
            onSave={handleSave}
          />

          {/* FDE Pods */}
          {pods.map(pod => (
            <SectionCard
              key={pod.id}
              section="services" label={pod.name} badge="S" badgeClass="bg-[#7C3AED]"
              months={months} lines={linesForSection('services', pod.id)} cells={cells}
              fyStart={fyStart} scenarioId={activeId} podId={pod.id}
              onLinesChange={updated => setLines(prev => [
                ...prev.filter(l => !(l.segment === 'services' && l.pod_id === pod.id)),
                ...updated,
              ])}
              onSave={handleSave}
            />
          ))}

          {/* Leadership */}
          <SectionCard
            section="leadership" label="Leadership" badge="L" badgeClass="bg-[#6B7280]"
            months={months} lines={linesForSection('leadership')} cells={cells}
            fyStart={fyStart} scenarioId={activeId}
            onLinesChange={updated => setLines(prev => [...prev.filter(l => l.segment !== 'leadership'), ...updated])}
            onSave={handleSave}
          />

          {/* Summary */}
          {lines.length > 0 && (
            <div className="bg-white rounded-2xl border border-[#E5E7EB] shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-[#F3F4F6]">
                <span className="text-sm font-semibold text-[#0F0F0F]">Summary</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-[#F9FAFB]">
                      <th className="pl-4 pr-1 py-2 w-16" /><th className="px-2 py-2 text-left min-w-[160px]" />
                      {months.map(m => (
                        <th key={m} className="px-1 py-2 text-right min-w-[52px]">
                          <span className="text-[10px] font-bold text-[#9CA3AF] uppercase tracking-widest">{monthLabel(m)}</span>
                        </th>
                      ))}
                      <th className="px-2 py-2 text-right min-w-[64px]">
                        <span className="text-[10px] font-bold text-[#9CA3AF] uppercase tracking-widest">FY</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {([
                      { label: 'Total Revenue',  key: 'totalRev'    as const },
                      { label: 'Gross Profit',   key: 'grossProfit' as const },
                      { label: 'Leadership',     key: 'ldCost'      as const },
                    ]).map(({ label, key }) => (
                      <tr key={key} className="border-b border-[#F3F4F6]">
                        <td colSpan={2} className="pl-4 pr-2 py-1.5 text-xs text-[#374151] font-medium">{label}</td>
                        {summary.map(r => (
                          <td key={r.m} className="px-1 py-1.5 text-right text-xs tabular-nums text-[#374151]">{kFmt(r[key])}</td>
                        ))}
                        <td className="px-2 py-1.5 text-right text-xs font-semibold tabular-nums text-[#111827]">{kFmt(totals[key])}</td>
                      </tr>
                    ))}
                    <tr className="bg-[#F9FAFB] border-t border-[#E5E7EB]">
                      <td colSpan={2} className="pl-4 pr-2 py-2 text-xs font-bold text-[#111827]">EBIT / OPM%</td>
                      {summary.map(r => (
                        <td key={r.m} className={`px-1 py-2 text-right text-xs font-semibold tabular-nums ${pctCls(r.ebit, r.totalRev)}`}>
                          {kFmt(r.ebit)}
                          {r.totalRev > 0 && <span className="block text-[10px] opacity-70">{pctStr(r.ebit, r.totalRev)}</span>}
                        </td>
                      ))}
                      <td className={`px-2 py-2 text-right text-xs font-bold tabular-nums ${pctCls(totals.ebit, totals.totalRev)}`}>
                        {kFmt(totals.ebit)}
                        {totals.totalRev > 0 && <span className="block text-[10px] opacity-70">{pctStr(totals.ebit, totals.totalRev)}</span>}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
