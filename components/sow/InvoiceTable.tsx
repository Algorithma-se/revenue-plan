'use client'

import type { InvoiceDraft, Invoice, InvoiceStatus } from '@/types/database'
import { InvoiceStatusBadge } from './InvoiceStatusBadge'

interface Props {
  drafts:           InvoiceDraft[]
  savedInvoices:    Invoice[]
  contractValueSek: number | null
  onChange:         (drafts: InvoiceDraft[]) => void
  onStatusChange:   (invoiceId: string, status: InvoiceStatus, paidDate: string | null) => void
}

export function InvoiceTable({ drafts, savedInvoices, contractValueSek, onChange, onStatusChange }: Props) {
  const idMap = new Map(savedInvoices.map(i => [i.invoice_number, i]))

  function update(idx: number, patch: Partial<InvoiceDraft>) {
    const fullPatch = { ...patch }
    // Auto-derive payment_trigger from milestone_label presence
    if ('milestone_label' in patch) {
      fullPatch.payment_trigger = patch.milestone_label ? 'milestone' : 'date'
    }
    onChange(drafts.map((d, i) => i === idx ? { ...d, ...fullPatch } : d))
  }

  function addRow() {
    const year = new Date().getFullYear()
    const num  = String(drafts.length + 1).padStart(3, '0')
    onChange([...drafts, {
      invoice_number:  `${year}-INV-${num}`,
      issue_date:      '',
      due_date:        '',
      amount_sek:      0,
      payment_trigger: 'date',
      milestone_label: '',
      status:          'draft',
      notes:           '',
    }])
  }

  function removeRow(idx: number) {
    onChange(drafts.filter((_, i) => i !== idx))
  }

  const total = drafts.reduce((s, d) => s + (d.amount_sek || 0), 0)
  const diff  = contractValueSek != null ? total - contractValueSek : null

  const cellCls = 'px-2 py-1.5'
  const inputCls = 'w-full text-xs border border-transparent focus:border-[#E5E7EB] rounded px-1 py-0.5 bg-transparent focus:bg-white'

  return (
    <div>
      <table className="w-full table-fixed text-xs">
          <colgroup>
            <col className="w-[13%]" /> {/* # */}
            <col className="w-[12%]" /> {/* Issue date */}
            <col className="w-[12%]" /> {/* Due date */}
            <col className="w-[10%]" /> {/* Amount */}
            <col className="w-[20%]" /> {/* Milestone */}
            <col className="w-[11%]" /> {/* Status */}
            <col className="w-[19%]" /> {/* Notes */}
            <col className="w-[3%]"  /> {/* Delete */}
          </colgroup>
          <thead>
            <tr className="bg-[#F8FAFC] border-b border-[#E5E7EB]">
              <th className="px-2 py-2 text-left font-semibold text-[#64748B]">#</th>
              <th className="px-2 py-2 text-left font-semibold text-[#64748B]">Issue date</th>
              <th className="px-2 py-2 text-left font-semibold text-[#64748B]">Due date</th>
              <th className="px-2 py-2 text-right font-semibold text-[#64748B]">kSEK</th>
              <th className="px-2 py-2 text-left font-semibold text-[#64748B]">Milestone</th>
              <th className="px-2 py-2 text-left font-semibold text-[#64748B]">Status</th>
              <th className="px-2 py-2 text-left font-semibold text-[#64748B]">Notes</th>
              <th className="px-1 py-2" />
            </tr>
          </thead>
          <tbody>
            {drafts.map((d, i) => {
              const saved = idMap.get(d.invoice_number)
              return (
                <tr key={i} className="border-b border-[#F3F4F6] last:border-0 hover:bg-[#F9FAFB]">
                  <td className={cellCls}>
                    <input
                      value={d.invoice_number}
                      onChange={e => update(i, { invoice_number: e.target.value })}
                      className={inputCls}
                    />
                  </td>
                  <td className={cellCls}>
                    <input
                      type="date"
                      value={d.issue_date}
                      onChange={e => update(i, { issue_date: e.target.value })}
                      className={inputCls}
                    />
                  </td>
                  <td className={cellCls}>
                    <input
                      type="date"
                      value={d.due_date}
                      onChange={e => update(i, { due_date: e.target.value })}
                      className={inputCls}
                    />
                  </td>
                  <td className={`${cellCls} text-right`}>
                    <input
                      type="number"
                      value={d.amount_sek ? Math.round(d.amount_sek / 1000) : ''}
                      onChange={e => update(i, { amount_sek: Number(e.target.value) * 1000 })}
                      className={`${inputCls} text-right`}
                      placeholder="0"
                    />
                  </td>
                  <td className={cellCls}>
                    <input
                      value={d.milestone_label}
                      onChange={e => update(i, { milestone_label: e.target.value })}
                      placeholder="Milestone label (optional)"
                      className={inputCls}
                    />
                  </td>
                  <td className={cellCls}>
                    {saved ? (
                      <InvoiceStatusBadge
                        invoiceId={saved.id}
                        status={d.status}
                        paidDate={saved.paid_date}
                        onChange={(status, paidDate) => {
                          update(i, { status })
                          onStatusChange(saved.id, status, paidDate)
                        }}
                      />
                    ) : (
                      <span className="text-[#9CA3AF] italic">Save first</span>
                    )}
                  </td>
                  <td className={cellCls}>
                    <input
                      value={d.notes}
                      onChange={e => update(i, { notes: e.target.value })}
                      placeholder="Notes"
                      className={inputCls}
                    />
                  </td>
                  <td className="px-1 py-1.5">
                    <button
                      onClick={() => removeRow(i)}
                      className="text-[#D1D5DB] hover:text-[#DC2626] transition-colors"
                      title="Remove row"
                    >
                      <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                        <path d="M5.5 5.5A.5.5 0 016 6v6a.5.5 0 01-1 0V6a.5.5 0 01.5-.5zm2.5 0a.5.5 0 01.5.5v6a.5.5 0 01-1 0V6a.5.5 0 01.5-.5zm2.5 0a.5.5 0 01.5.5v6a.5.5 0 01-1 0V6a.5.5 0 01.5-.5z" />
                        <path fillRule="evenodd" d="M14.5 3a1 1 0 01-1 1H13v9a2 2 0 01-2 2H5a2 2 0 01-2-2V4h-.5a1 1 0 01-1-1V2a1 1 0 011-1H6a1 1 0 011-1h2a1 1 0 011 1h3.5a1 1 0 011 1v1zM4.118 4L4 4.059V13a1 1 0 001 1h6a1 1 0 001-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z" clipRule="evenodd" />
                      </svg>
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
      </table>

      <div className="flex items-center justify-between px-4 py-3 border-t border-[#F3F4F6]">
        <button
          onClick={addRow}
          className="flex items-center gap-1.5 text-xs text-[#9CA3AF] hover:text-[#2563EB] transition-colors"
        >
          <span className="text-sm font-light">+</span> Add invoice
        </button>
        <div className="text-xs text-[#6B7280]">
          Total: <span className="font-semibold text-[#0F0F0F]">{Math.round(total / 1000).toLocaleString('sv-SE')} kSEK</span>
          {contractValueSek != null && diff !== null && (
            <span className={`ml-2 ${Math.abs(diff) < 1000 ? 'text-[#16A34A]' : 'text-[#D97706]'}`}>
              {diff > 0 ? '+' : ''}{Math.round(diff / 1000).toLocaleString('sv-SE')} vs contract
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
