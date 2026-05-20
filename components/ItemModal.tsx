'use client'

import { useRef, useState } from 'react'
import type { Pod } from '@/types/database'

export interface ItemModalSaveData {
  podId:      string | null
  rows:       { month: string; amount: number }[]  // month: 'YYYY-MM-01', amount in SEK
  notes:      string
  clientName?: string
  project?:   string | null
}

export function ItemModal({
  mode,
  // synced mode — read-only display header
  displayName,
  subtitle,
  // manual mode — editable header fields
  initialClientName,
  initialProject,
  // shared
  pods,
  initialPodId,
  initialRows,       // month: 'YYYY-MM', amount in kSEK
  referenceKSEK,     // for "allocated / remaining" bar (in kSEK)
  initialNotes,
  onClose,
  onSave,
  onDelete,
}: {
  mode:               'synced' | 'manual'
  displayName?:       string
  subtitle?:          string
  initialClientName?: string
  initialProject?:    string
  pods:               Pod[]
  initialPodId:       string | null
  initialRows:        { month: string; amount: string }[]
  referenceKSEK?:     number
  initialNotes?:      string
  onClose:  () => void
  onSave:   (data: ItemModalSaveData) => Promise<void>
  onDelete?: () => Promise<void>
}) {
  const [rows, setRows]         = useState(initialRows)
  const [podId, setPodId]       = useState<string | null>(initialPodId)
  const [notes, setNotes]       = useState(initialNotes ?? '')
  const [clientName, setClient] = useState(initialClientName ?? '')
  const [project, setProject]   = useState(initialProject ?? '')
  const [saving, setSaving]     = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const clientRef               = useRef<HTMLInputElement>(null)

  const allocatedKSEK = rows.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0)
  const remainingKSEK = referenceKSEK != null ? referenceKSEK - allocatedKSEK : null

  async function save() {
    if (mode === 'manual' && !clientName.trim()) {
      setError('Client name is required.')
      clientRef.current?.focus()
      return
    }
    setSaving(true)
    setError(null)
    try {
      const validRows = rows
        .filter(r => r.month && r.amount && parseFloat(r.amount) > 0)
        .map(r => ({ month: r.month + '-01', amount: Math.round(parseFloat(r.amount) * 1000) }))
      await onSave({
        podId,
        rows: validRows,
        notes,
        ...(mode === 'manual' ? { clientName: clientName.trim(), project: project.trim() || null } : {}),
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save')
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!onDelete) return
    if (!confirm('Remove this item? This cannot be undone.')) return
    setDeleting(true)
    try {
      await onDelete()
    } catch {
      setDeleting(false)
      setError('Failed to delete.')
    }
  }

  const inp = "bg-[#F9F9F8] border border-[#EBEBEB] rounded-lg px-2.5 py-1.5 text-sm text-[#0F0F0F] focus:outline-none focus:ring-2 focus:ring-[#61b5cc] focus:border-transparent transition-all"

  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl border border-[#EBEBEB] p-6 w-full max-w-lg shadow-2xl shadow-black/10 max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-5">
          <div className="flex-1 min-w-0 mr-3">
            {mode === 'synced' ? (
              <>
                <h2 className="text-sm font-semibold text-[#0F0F0F]">{displayName ?? '—'}</h2>
                {subtitle && <p className="text-xs text-[#6B7280] mt-0.5">{subtitle}</p>}
              </>
            ) : (
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="text-xs font-semibold text-[#6B7280] uppercase tracking-wide mb-1 block">Client *</label>
                  <input
                    ref={clientRef}
                    type="text"
                    value={clientName}
                    onChange={e => setClient(e.target.value)}
                    placeholder="Client name"
                    autoFocus
                    className={`${inp} w-full`}
                  />
                </div>
                <div className="flex-1">
                  <label className="text-xs font-semibold text-[#6B7280] uppercase tracking-wide mb-1 block">Project</label>
                  <input
                    type="text"
                    value={project}
                    onChange={e => setProject(e.target.value)}
                    placeholder="Optional"
                    className={`${inp} w-full`}
                  />
                </div>
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-[#9CA3AF] hover:text-[#0F0F0F] hover:bg-[#F9F9F8] transition-colors flex-shrink-0"
          >
            <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L8 6.586l2.293-2.293a1 1 0 111.414 1.414L9.414 8l2.293 2.293a1 1 0 01-1.414 1.414L8 9.414l-2.293 2.293a1 1 0 01-1.414-1.414L6.586 8 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        {/* Pod */}
        <div className="mb-4">
          <label className="text-xs font-semibold text-[#6B7280] uppercase tracking-wide mb-1 block">Pod</label>
          <select
            value={podId ?? ''}
            onChange={e => setPodId(e.target.value || null)}
            className={`${inp} w-full`}
          >
            <option value="">No pod</option>
            {pods.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>

        {/* Month rows */}
        <p className="text-xs font-semibold text-[#6B7280] uppercase tracking-wide mb-2">Monthly allocation (kSEK)</p>
        <div className="space-y-2 mb-3">
          {rows.length === 0 && (
            <p className="text-xs text-[#9CA3AF] py-1">No months added yet.</p>
          )}
          {rows.map((row, idx) => (
            <div key={idx} className="flex gap-2 items-center">
              <input
                type="month"
                value={row.month}
                onChange={e => setRows(r => r.map((x, i) => i === idx ? { ...x, month: e.target.value } : x))}
                className={`${inp} flex-1`}
              />
              <input
                type="number"
                min={0}
                step="any"
                placeholder="kSEK"
                value={row.amount}
                onChange={e => setRows(r => r.map((x, i) => i === idx ? { ...x, amount: e.target.value } : x))}
                className={`${inp} flex-1 text-right`}
              />
              <button
                onClick={() => setRows(r => r.filter((_, i) => i !== idx))}
                className="text-[#D1D5DB] hover:text-[#EF4444] transition-colors p-1 flex-shrink-0"
              >
                <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L8 6.586l2.293-2.293a1 1 0 111.414 1.414L9.414 8l2.293 2.293a1 1 0 01-1.414 1.414L8 9.414l-2.293 2.293a1 1 0 01-1.414-1.414L6.586 8 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
          ))}
        </div>

        <button
          onClick={() => setRows(r => [...r, { month: '', amount: '' }])}
          className="text-sm text-[#61b5cc] hover:text-[#4a9ab8] font-medium flex items-center gap-1 mb-4 transition-colors"
        >
          <span className="text-base leading-none">+</span> Add month
        </button>

        {/* Running total — only when a reference amount is provided */}
        {referenceKSEK != null && referenceKSEK > 0 && rows.some(r => r.amount) && (
          <div className="bg-[#F9F9F8] rounded-xl px-3 py-2.5 mb-4 flex items-center justify-between">
            <span className="text-xs text-[#6B7280]">
              Allocated: <span className="font-semibold text-[#0F0F0F]">{allocatedKSEK.toLocaleString('sv-SE')} kSEK</span>
            </span>
            <span className={`text-xs font-medium ${
              remainingKSEK === 0 ? 'text-[#16A34A]' : remainingKSEK! < 0 ? 'text-[#EF4444]' : 'text-[#6B7280]'
            }`}>
              {remainingKSEK === 0
                ? '✓ Fully allocated'
                : remainingKSEK! > 0
                  ? `${remainingKSEK!.toLocaleString('sv-SE')} kSEK remaining`
                  : `${Math.abs(remainingKSEK!).toLocaleString('sv-SE')} kSEK over`}
            </span>
          </div>
        )}

        {/* Notes */}
        <textarea
          rows={2}
          placeholder="Notes…"
          value={notes}
          onChange={e => setNotes(e.target.value)}
          className={`${inp} w-full resize-none mb-4`}
        />

        {error && (
          <p className="text-xs text-[#E11D48] bg-[#FFF1F2] border border-[#FECDD3] rounded-xl px-3 py-2 mb-3">{error}</p>
        )}

        <div className="flex gap-2">
          <button
            onClick={save}
            disabled={saving}
            className="px-4 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-40 transition-all"
            style={{ background: 'linear-gradient(135deg, #65deff 0%, #61b5cc 100%)' }}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm font-medium text-[#6B7280] bg-white border border-[#EBEBEB] hover:border-[#D1D5DB] transition-all"
          >
            Cancel
          </button>
          {onDelete && (
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="ml-auto px-4 py-2 rounded-xl text-sm font-medium text-[#E11D48] bg-white border border-[#FECDD3] hover:bg-[#FFF1F2] disabled:opacity-40 transition-all"
            >
              {deleting ? 'Removing…' : mode === 'synced' ? 'Remove item' : 'Delete'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
