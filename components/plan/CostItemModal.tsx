'use client'

import { useRef, useState } from 'react'
import type { Pod, CostRow } from '@/types/database'

interface MonthRow {
  month: string   // 'YYYY-MM'
  amount: string  // kSEK
}

export function CostItemModal({
  mode,
  pods,
  defaultPodId,
  editRow,
  onClose,
  onSave,
  onDelete,
}: {
  mode: 'add' | 'edit'
  pods: Pod[]
  defaultPodId?: string | null
  editRow?: CostRow
  onClose: () => void
  onSave: (category: string, comment: string | null, podId: string | null, cells: { month: string; amount: number }[]) => Promise<void>
  onDelete?: () => Promise<void>
}) {
  const [category, setCategory] = useState(editRow?.category ?? '')
  const [comment, setComment]   = useState(editRow?.comment ?? '')
  const [podId, setPodId]       = useState<string | null>(editRow?.pod_id ?? defaultPodId ?? null)
  const [rows, setRows]         = useState<MonthRow[]>(() => {
    if (!editRow) return []
    return Object.entries(editRow.cells)
      .filter(([_, c]) => c.amount > 0)
      .map(([month, c]) => ({ month: month.slice(0, 7), amount: String(Math.round(c.amount / 1000)) }))
      .sort((a, b) => a.month.localeCompare(b.month))
  })
  const [saving, setSaving]     = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const categoryRef             = useRef<HTMLInputElement>(null)

  async function handleSave() {
    if (!category.trim()) { setError('Category is required.'); categoryRef.current?.focus(); return }
    setSaving(true)
    setError(null)
    try {
      const validRows = rows
        .filter(r => r.month && r.amount && parseFloat(r.amount) > 0)
        .map(r => ({ month: r.month + '-01', amount: Math.round(parseFloat(r.amount) * 1000) }))
      await onSave(category.trim(), comment.trim() || null, podId, validRows)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save.')
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!onDelete) return
    if (!confirm('Delete this cost item? This cannot be undone.')) return
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
          <div className="flex-1 min-w-0 mr-3 flex gap-3">
            <div className="flex-1">
              <label className="text-xs font-semibold text-[#6B7280] uppercase tracking-wide mb-1 block">Category *</label>
              <input
                ref={categoryRef}
                type="text"
                value={category}
                onChange={e => setCategory(e.target.value)}
                placeholder="Cost category"
                autoFocus
                className={`${inp} w-full`}
              />
            </div>
            <div className="flex-1">
              <label className="text-xs font-semibold text-[#6B7280] uppercase tracking-wide mb-1 block">Comment</label>
              <input
                type="text"
                value={comment}
                onChange={e => setComment(e.target.value)}
                placeholder="Optional"
                className={`${inp} w-full`}
              />
            </div>
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
        <p className="text-xs font-semibold text-[#6B7280] uppercase tracking-wide mb-2">Monthly amounts (kSEK)</p>
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

        {error && (
          <p className="text-xs text-[#E11D48] bg-[#FFF1F2] border border-[#FECDD3] rounded-xl px-3 py-2 mb-3">{error}</p>
        )}

        <div className="flex gap-2">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-40 transition-all"
            style={{ background: 'linear-gradient(135deg, #65deff 0%, #61b5cc 100%)' }}
          >
            {saving ? (mode === 'add' ? 'Adding…' : 'Saving…') : (mode === 'add' ? 'Add item' : 'Save')}
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm font-medium text-[#6B7280] bg-white border border-[#EBEBEB] hover:border-[#D1D5DB] transition-all"
          >
            Cancel
          </button>
          {mode === 'edit' && onDelete && (
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="ml-auto px-4 py-2 rounded-xl text-sm font-medium text-[#E11D48] bg-white border border-[#FECDD3] hover:bg-[#FFF1F2] disabled:opacity-40 transition-all"
            >
              {deleting ? 'Deleting…' : 'Delete'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
