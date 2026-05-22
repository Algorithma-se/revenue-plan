'use client'

import type { InvoiceDraft, Invoice, PaymentTrigger, InvoiceStatus } from '@/types/database'
import { InvoiceStatusBadge } from './InvoiceStatusBadge'

interface Props {
  drafts:        InvoiceDraft[]
  savedInvoices: Invoice[]
  contractValueSek: number | null
  onChange:      (drafts: InvoiceDraft[]) => void
  onStatusChange:(invoiceId: string, status: InvoiceStatus, paidDate: string | null) => void
}

export function InvoiceTable({ drafts, savedInvoices, contractValueSek, onChange, onStatusChange }: Props) {
  const idMap = new Map(savedInvoices.map(i => [i.invoice_number, i]))

  function update(idx: number, patch: Partial<InvoiceDraft>) {
    onChange(drafts.map((d, i) => i === idx ? { ...d, ...patch } : d))
  }

  function addRow() {
    const year = new Date().getFullYear()
    const num  = String(drafts.length + 1).padStart(3, '0')
    onChange([...drafts, {
      invoice_number: `${year}-INV-${num}`,
      issue_date:     '',
      due_date:       '',
      amount_sek:     0,
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

  return (
    <div>
      <div className="overflow-x-auto rounded-xl border border-[#E5E7EB]">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-[#F8FAFC] border-b border-[#E5E7EB]">
              <th className="px-3 py-2 text-left font-semibold text-[#64748B]">#</th>
              <th className="px-3 py-2 text-left font-semibold text-[#64748B]">Issue date</th>
              <th className="px-3 py-2 text-left font-semibold text-[#64748B]">Due date</th>
              <th className="px-3 py-2 text-right font-semibold text-[#64748B]">Amount kSEK</th>
              <th className="px-3 py-2 text-left font-semibold text-[#64748B]">Trigger</th>
              <th className="px-3 py-2 text-left font-semibold text-[#64748B]">Milestone</th>
              <th className="px-3 py-2 text-left font-semibold text-[#64748B]">Status</th>
              <th className="px-3 py-2 text-left font-semibold text-[#64748B]">Notes</th>
              <th className="px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {drafts.map((d, i) => {
              const saved = idMap.get(d.invoice_number)
              return (
                <tr key={i} className="border-b border-[#F3F4F6] last:border-0 hover:bg-[#F9FAFB]">
                  <td className="px-3 py-1.5">
                    <input
                      value={d.invoice_number}
                      onChange={e => update(i, { invoice_number: e.target.value })}
                      className="w-28 text-xs border border-transparent focus:border-[#E5E7EB] rounded px-1 py-0.5 bg-transparent focus:bg-white"
                    />
                  </td>
                  <td className="px-3 py-1.5">
                    <input
                      type="date"
                      value={d.issue_date}
                      onChange={e => update(i, { issue_date: e.target.value })}
                      className="text-xs border border-transparent focus:border-[#E5E7EB] rounded px-1 py-0.5 bg-transparent focus:bg-white"
                    />
                  </td>
                  <td className="px-3 py-1.5">
                    <input
                      type="date"
                      value={d.due_date}
                      onChange={e => update(i, { due_date: e.target.value })}
                      className="text-xs border border-transparent focus:border-[#E5E7EB] rounded px-1 py-0.5 bg-transparent focus:bg-white"
                    />
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    <input
                      type="number"
                      value={d.amount_sek ? Math.round(d.amount_sek / 1000) : ''}
                      onChange={e => update(i, { amount_sek: Number(e.target.value) * 1000 })}
                      className="w-20 text-right text-xs border border-transparent focus:border-[#E5E7EB] rounded px-1 py-0.5 bg-transparent focus:bg-white"
                      placeholder="0"
                    />
                  </td>
                  <td className="px-3 py-1.5">
                    <select
                      value={d.payment_trigger}
                      onChange={e => update(i, { payment_trigger: e.target.value as PaymentTrigger })}
                      className="text-xs border border-transparent focus:border-[#E5E7EB] rounded px-1 py-0.5 bg-transparent focus:bg-white"
                    >
                      <option value="date">Date</option>
                      <option value="milestone">Milestone</option>
                    </select>
                  </td>
                  <td className="px-3 py-1.5">
                    {d.payment_trigger === 'milestone' && (
                      <input
                        value={d.milestone_label}
                        onChange={e => update(i, { milestone_label: e.target.value })}
                        placeholder="Milestone label"
                        className="text-xs border border-transparent focus:border-[#E5E7EB] rounded px-1 py-0.5 bg-transparent focus:bg-white w-32"
                      />
                    )}
                  </td>
                  <td className="px-3 py-1.5">
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
                  <td className="px-3 py-1.5">
                    <input
                      value={d.notes}
                      onChange={e => update(i, { notes: e.target.value })}
                      placeholder="Optional notes"
                      className="text-xs border border-transparent focus:border-[#E5E7EB] rounded px-1 py-0.5 bg-transparent focus:bg-white w-36"
                    />
                  </td>
                  <td className="px-2 py-1.5">
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
      </div>

      <div className="flex items-center justify-between mt-3">
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
