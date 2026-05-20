'use client'

import { useRef, useState } from 'react'
import { FISCAL_MONTHS, monthLabel } from '@/lib/plan-utils'
import type { PlanStatus } from '@/types/database'

const STATUS_COLORS: Record<PlanStatus, string> = {
  A: 'bg-[#F0FDF4] text-[#16A34A]',
  B: 'bg-[#EFF6FF] text-[#3B82F6]',
  F: 'bg-[#F3F4F6] text-[#6B7280]',
}

function cycleStatus(s: PlanStatus): PlanStatus {
  return s === 'F' ? 'B' : s === 'B' ? 'A' : 'F'
}

interface MonthRow {
  month: string
  amount: string
  status: PlanStatus
}

export function AddRevenueModal({
  onClose,
  onSave,
}: {
  onClose: () => void
  onSave: (client: string, project: string | null, rows: { month: string; amount: number; status: PlanStatus }[]) => Promise<void>
}) {
  const [client,  setClient]  = useState('')
  const [project, setProject] = useState('')
  const [rows, setRows]       = useState<MonthRow[]>(
    FISCAL_MONTHS.map(m => ({ month: m, amount: '', status: 'F' }))
  )
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState<string | null>(null)
  const clientRef = useRef<HTMLInputElement>(null)

  function setAmount(month: string, value: string) {
    setRows(r => r.map(row => row.month === month ? { ...row, amount: value } : row))
  }

  function setStatus(month: string, status: PlanStatus) {
    setRows(r => r.map(row => row.month === month ? { ...row, status } : row))
  }

  async function handleSave() {
    if (!client.trim()) { setError('Client name is required.'); clientRef.current?.focus(); return }
    setSaving(true)
    setError(null)
    try {
      const validRows = rows
        .map(r => ({ month: r.month, amount: parseFloat(r.amount) * 1000, status: r.status }))
        .filter(r => !isNaN(r.amount) && r.amount > 0)
      await onSave(client.trim(), project.trim() || null, validRows)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save. Has the migration been run in Supabase?')
      setSaving(false)
    }
  }

  const input = "bg-[#F9F9F8] border border-[#EBEBEB] rounded-xl px-3 py-2 text-sm text-[#0F0F0F] focus:outline-none focus:ring-2 focus:ring-[#61b5cc] focus:border-transparent transition-all"

  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl border border-[#EBEBEB] p-6 w-full max-w-lg shadow-2xl shadow-black/10 max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-5 flex-shrink-0">
          <h2 className="text-sm font-semibold text-[#0F0F0F]">Add revenue item</h2>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-[#9CA3AF] hover:text-[#0F0F0F] hover:bg-[#F9F9F8] transition-colors"
          >
            <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L8 6.586l2.293-2.293a1 1 0 111.414 1.414L9.414 8l2.293 2.293a1 1 0 01-1.414 1.414L8 9.414l-2.293 2.293a1 1 0 01-1.414-1.414L6.586 8 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        {/* Client + Project */}
        <div className="flex gap-3 mb-5 flex-shrink-0">
          <div className="flex-1">
            <label className="text-xs font-semibold text-[#6B7280] uppercase tracking-wide mb-1 block">Client *</label>
            <input
              ref={clientRef}
              type="text"
              value={client}
              onChange={e => setClient(e.target.value)}
              placeholder="Client name"
              autoFocus
              className={`${input} w-full`}
            />
          </div>
          <div className="flex-1">
            <label className="text-xs font-semibold text-[#6B7280] uppercase tracking-wide mb-1 block">Project</label>
            <input
              type="text"
              value={project}
              onChange={e => setProject(e.target.value)}
              placeholder="Optional"
              className={`${input} w-full`}
            />
          </div>
        </div>

        {/* Month rows */}
        <p className="text-xs font-semibold text-[#6B7280] uppercase tracking-wide mb-2 flex-shrink-0">Monthly allocation (kSEK)</p>
        <div className="overflow-y-auto flex-1 mb-4 space-y-1.5 pr-1">
          {rows.map(row => (
            <div key={row.month} className="flex items-center gap-2">
              <span className="text-xs text-[#6B7280] w-8 flex-shrink-0">{monthLabel(row.month)}</span>
              <input
                type="number"
                min={0}
                placeholder="—"
                value={row.amount}
                onChange={e => setAmount(row.month, e.target.value)}
                className={`${input} flex-1 text-right py-1.5`}
              />
              <button
                tabIndex={-1}
                onClick={() => setStatus(row.month, cycleStatus(row.status))}
                className={`text-[10px] font-bold px-2 py-1 rounded-lg flex-shrink-0 cursor-pointer select-none transition-opacity hover:opacity-70 ${STATUS_COLORS[row.status]}`}
              >
                {row.status}
              </button>
            </div>
          ))}
        </div>

        {error && (
          <p className="text-xs text-[#E11D48] bg-[#FFF1F2] border border-[#FECDD3] rounded-xl px-3 py-2 mb-3 flex-shrink-0">{error}</p>
        )}

        {/* Actions */}
        <div className="flex gap-2 flex-shrink-0">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-40 transition-all"
            style={{ background: 'linear-gradient(135deg, #65deff 0%, #61b5cc 100%)' }}
          >
            {saving ? 'Adding…' : 'Add item'}
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm font-medium text-[#6B7280] bg-white border border-[#EBEBEB] hover:border-[#D1D5DB] transition-all"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
