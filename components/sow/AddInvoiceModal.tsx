'use client'

import { useMemo, useState } from 'react'
import type { InvoiceDraft } from '@/types/database'

interface Props {
  existingCount:    number
  paymentTermsDays: number
  clientExcludeVat: boolean
  onAdd:            (drafts: InvoiceDraft[]) => void
  onClose:          () => void
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso + 'T12:00:00')
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

function addMonths(iso: string, months: number): string {
  const d = new Date(iso + 'T12:00:00')
  d.setMonth(d.getMonth() + months)
  return d.toISOString().slice(0, 10)
}

function makeNum(base: number, idx: number): string {
  return `${new Date().getFullYear()}-INV-${String(base + idx + 1).padStart(3, '0')}`
}

const FREQ_OPTIONS = [
  { label: 'Monthly',    months: 1  },
  { label: 'Quarterly',  months: 3  },
  { label: 'Every 2 months', months: 2 },
]

export function AddInvoiceModal({ existingCount, paymentTermsDays, clientExcludeVat, onAdd, onClose }: Props) {
  const today = new Date().toISOString().slice(0, 10)

  const [type,      setType]      = useState<'once' | 'recurring'>('once')
  const [issueDate, setIssueDate] = useState(today)
  const [dueDate,   setDueDate]   = useState(paymentTermsDays > 0 ? addDays(today, paymentTermsDays) : today)
  const [amountK,   setAmountK]   = useState('')
  const [label,     setLabel]     = useState('')
  const [freqIdx,   setFreqIdx]   = useState(0)
  const [count,     setCount]     = useState(3)

  function handleIssueDateChange(val: string) {
    setIssueDate(val)
    if (paymentTermsDays > 0 && val) setDueDate(addDays(val, paymentTermsDays))
  }

  const freq = FREQ_OPTIONS[freqIdx]

  const preview = useMemo((): InvoiceDraft[] => {
    if (!issueDate || !amountK) return []
    const amtSek = Math.round(parseFloat(amountK) * 1000)
    if (isNaN(amtSek) || amtSek <= 0) return []

    if (type === 'once') {
      return [{
        invoice_number:  makeNum(existingCount, 0),
        issue_date:      issueDate,
        due_date:        dueDate,
        amount_sek:      amtSek,
        payment_trigger: 'date',
        milestone_label: label,
        status:          'draft',
        notes:           '',
        exclude_vat:     clientExcludeVat,
      }]
    }

    return Array.from({ length: count }, (_, i) => {
      const issue = i === 0 ? issueDate : addMonths(issueDate, i * freq.months)
      const due   = paymentTermsDays > 0 ? addDays(issue, paymentTermsDays) : addMonths(issue, freq.months)
      return {
        invoice_number:  makeNum(existingCount, i),
        issue_date:      issue,
        due_date:        due,
        amount_sek:      amtSek,
        payment_trigger: 'date',
        milestone_label: label,
        status:          'draft',
        notes:           '',
        exclude_vat:     clientExcludeVat,
      }
    })
  }, [type, issueDate, dueDate, amountK, label, freqIdx, count, existingCount, paymentTermsDays])

  const canAdd = preview.length > 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#F3F4F6] flex-shrink-0">
          <h2 className="text-sm font-bold text-[#0F0F0F]">Add invoice</h2>
          <button onClick={onClose} className="text-[#9CA3AF] hover:text-[#6B7280] transition-colors">
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">

          {/* Type toggle */}
          <div className="flex gap-2">
            {(['once', 'recurring'] as const).map(t => (
              <button
                key={t}
                onClick={() => setType(t)}
                className={`flex-1 py-2 text-sm font-medium rounded-xl border transition-colors ${
                  type === t
                    ? 'bg-[#0F0F0F] text-white border-[#0F0F0F]'
                    : 'border-[#E5E7EB] text-[#6B7280] hover:border-[#9CA3AF]'
                }`}
              >
                {t === 'once' ? 'One-off' : 'Recurring'}
              </button>
            ))}
          </div>

          {/* Issue date + Amount */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-semibold text-[#9CA3AF] uppercase tracking-wider mb-1">
                {type === 'recurring' ? 'First issue date' : 'Issue date'}
              </label>
              <input
                type="date"
                value={issueDate}
                onChange={e => handleIssueDateChange(e.target.value)}
                className="w-full text-sm px-2.5 py-1.5 border border-[#E5E7EB] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#61b5cc]"
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-[#9CA3AF] uppercase tracking-wider mb-1">
                Amount (kSEK)
              </label>
              <input
                type="number"
                value={amountK}
                onChange={e => setAmountK(e.target.value)}
                placeholder="e.g. 500"
                min="0"
                className="w-full text-sm px-2.5 py-1.5 border border-[#E5E7EB] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#61b5cc]"
              />
            </div>
          </div>

          {/* Label */}
          <div>
            <label className="block text-[10px] font-semibold text-[#9CA3AF] uppercase tracking-wider mb-1">
              Label / milestone (optional)
            </label>
            <input
              type="text"
              value={label}
              onChange={e => setLabel(e.target.value)}
              placeholder="e.g. Monthly retainer May"
              className="w-full text-sm px-2.5 py-1.5 border border-[#E5E7EB] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#61b5cc]"
            />
          </div>

          {/* Due date — one-off only */}
          {type === 'once' && (
            <div>
              <label className="block text-[10px] font-semibold text-[#9CA3AF] uppercase tracking-wider mb-1">
                Due date{paymentTermsDays > 0 && <span className="ml-1 font-normal normal-case">— Net {paymentTermsDays} auto-calculated</span>}
              </label>
              <input
                type="date"
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
                className="w-full text-sm px-2.5 py-1.5 border border-[#E5E7EB] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#61b5cc]"
              />
            </div>
          )}

          {/* Recurring options */}
          {type === 'recurring' && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-semibold text-[#9CA3AF] uppercase tracking-wider mb-1">Frequency</label>
                  <select
                    value={freqIdx}
                    onChange={e => setFreqIdx(Number(e.target.value))}
                    className="w-full text-sm px-2.5 py-1.5 border border-[#E5E7EB] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#61b5cc]"
                  >
                    {FREQ_OPTIONS.map((f, i) => (
                      <option key={i} value={i}>{f.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-[#9CA3AF] uppercase tracking-wider mb-1">Number of invoices</label>
                  <input
                    type="number"
                    value={count}
                    onChange={e => setCount(Math.max(1, Math.min(36, Number(e.target.value))))}
                    min="1"
                    max="36"
                    className="w-full text-sm px-2.5 py-1.5 border border-[#E5E7EB] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#61b5cc]"
                  />
                </div>
              </div>

              {/* Preview */}
              {preview.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold text-[#9CA3AF] uppercase tracking-wider mb-2">Preview</p>
                  <div className="border border-[#E5E7EB] rounded-xl overflow-hidden max-h-44 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-[#F8FAFC] border-b border-[#E5E7EB]">
                          <th className="px-3 py-2 text-left text-[10px] font-semibold text-[#9CA3AF]">#</th>
                          <th className="px-3 py-2 text-left text-[10px] font-semibold text-[#9CA3AF]">Issue</th>
                          <th className="px-3 py-2 text-left text-[10px] font-semibold text-[#9CA3AF]">Due</th>
                          <th className="px-3 py-2 text-right text-[10px] font-semibold text-[#9CA3AF]">kSEK</th>
                        </tr>
                      </thead>
                      <tbody>
                        {preview.map((p, i) => (
                          <tr key={i} className={`${i < preview.length - 1 ? 'border-b border-[#F3F4F6]' : ''}`}>
                            <td className="px-3 py-1.5 font-mono text-[#374151]">{p.invoice_number}</td>
                            <td className="px-3 py-1.5 text-[#374151] tabular-nums">{p.issue_date}</td>
                            <td className="px-3 py-1.5 text-[#374151] tabular-nums">{p.due_date}</td>
                            <td className="px-3 py-1.5 text-right text-[#374151] tabular-nums">
                              {Math.round(p.amount_sek / 1000).toLocaleString('sv-SE')}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-6 py-4 border-t border-[#F3F4F6] flex-shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-[#6B7280] border border-[#E5E7EB] rounded-xl hover:bg-[#F9F9F8] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => { onAdd(preview); onClose() }}
            disabled={!canAdd}
            className="flex-1 py-2 text-sm font-medium text-white bg-[#0F0F0F] rounded-xl hover:bg-[#374151] transition-colors disabled:opacity-40"
          >
            {type === 'recurring' && preview.length > 1
              ? `Add ${preview.length} invoices`
              : 'Add invoice'}
          </button>
        </div>
      </div>
    </div>
  )
}
