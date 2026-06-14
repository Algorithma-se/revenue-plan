'use client'

import { useEffect, useState } from 'react'
import type { Invoice } from '@/types/database'
import { submitForBLApproval, getPreviousBLInvoices, type PreviousBLInvoice } from '@/app/actions/bl'

interface Props {
  invoice: Invoice
  onDone:  (updated: Partial<Invoice>) => void
  onClose: () => void
}

export function BLSubmitModal({ invoice, onDone, onClose }: Props) {
  const [lineDesc,      setLineDesc]      = useState(invoice.bl_line_desc      ?? '')
  const [invNumber,     setInvNumber]     = useState(invoice.invoice_number)
  const [issueDate,     setIssueDate]     = useState(invoice.issue_date)
  const [dueDate,       setDueDate]       = useState(invoice.due_date)
  const [amountKSEK,    setAmountKSEK]    = useState(Math.round(invoice.amount_sek / 1000))
  const [excludeVat,    setExcludeVat]    = useState(invoice.exclude_vat)
  const [notes,         setNotes]         = useState(invoice.notes ?? '')
  const [yourRef,       setYourRef]       = useState(invoice.bl_your_reference ?? '')
  const [ourRef,        setOurRef]        = useState(invoice.bl_our_reference  ?? '')
  const [poNumber,      setPoNumber]      = useState(invoice.bl_po_number      ?? '')
  const [marking,       setMarking]       = useState(invoice.bl_marking        ?? '')

  const [submitting,    setSubmitting]    = useState(false)
  const [error,         setError]         = useState<string | null>(null)
  const [prevInvoices,  setPrevInvoices]  = useState<PreviousBLInvoice[]>([])
  const [prevOpen,      setPrevOpen]      = useState(false)

  useEffect(() => {
    if (!invoice.client_name) return
    getPreviousBLInvoices(invoice.client_name).then(data => {
      const filtered = data.filter(p => p.id !== invoice.id)
      setPrevInvoices(filtered)
      if (filtered.length > 0) setPrevOpen(true)
    })
  }, [invoice.client_name, invoice.id])

  function applyPrevious(prev: PreviousBLInvoice) {
    if (prev.bl_line_desc)      setLineDesc(prev.bl_line_desc)
    if (prev.bl_your_reference) setYourRef(prev.bl_your_reference)
    if (prev.bl_our_reference)  setOurRef(prev.bl_our_reference)
    if (prev.bl_po_number)      setPoNumber(prev.bl_po_number)
    if (prev.bl_marking)        setMarking(prev.bl_marking)
    setPrevOpen(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!lineDesc.trim()) { setError('Invoice line description is required'); return }
    setError(null)
    setSubmitting(true)
    const result = await submitForBLApproval(invoice.id, {
      lineDesc:      lineDesc.trim(),
      invoiceNumber: invNumber,
      issueDate,
      dueDate,
      amountSek:     amountKSEK * 1000,
      excludeVat,
      notes,
      yourReference: yourRef,
      ourReference:  ourRef,
      poNumber,
      marking,
    })
    setSubmitting(false)
    if (result.error) { setError(result.error); return }
    onDone({
      bl_status:          'pending',
      bl_line_desc:       lineDesc.trim(),
      invoice_number:     invNumber,
      issue_date:         issueDate,
      due_date:           dueDate,
      amount_sek:         amountKSEK * 1000,
      exclude_vat:        excludeVat,
      notes,
      bl_your_reference:  yourRef  || null,
      bl_our_reference:   ourRef   || null,
      bl_po_number:       poNumber || null,
      bl_marking:         marking  || null,
    })
  }

  const labelCls = 'block text-[10px] font-semibold text-[#9CA3AF] uppercase tracking-wider mb-1'
  const inputCls = 'w-full px-3 py-2 text-sm text-[#0F0F0F] bg-[#F9F9F8] border border-[#EBEBEB] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#61b5cc] focus:border-transparent transition-all'
  const sectionCls = 'pt-4 border-t border-[#F3F4F6]'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-start justify-between px-6 pt-6 pb-4 border-b border-[#F3F4F6] flex-shrink-0">
          <div>
            <h2 className="text-base font-bold text-[#0F0F0F]">Send to Björn Lundén</h2>
            <p className="text-xs text-[#9CA3AF] mt-0.5">{invoice.client_name ?? '—'} · #{invoice.invoice_number}</p>
          </div>
          <button onClick={onClose} className="text-[#9CA3AF] hover:text-[#6B7280] mt-0.5 ml-4 flex-shrink-0">
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        {/* Scrollable body */}
        <form onSubmit={handleSubmit} className="overflow-y-auto flex-1">
          <div className="px-6 py-5 space-y-4">

            {/* Previous invoices panel */}
            {prevInvoices.length > 0 && (
              <div className="rounded-xl border border-[#E5E7EB] overflow-hidden">
                <button
                  type="button"
                  onClick={() => setPrevOpen(o => !o)}
                  className="w-full flex items-center justify-between px-4 py-2.5 bg-[#F9F9F8] hover:bg-[#F3F4F6] transition-colors text-left"
                >
                  <span className="text-xs font-medium text-[#374151]">
                    Re-use from previous invoice
                    <span className="ml-1.5 text-[#9CA3AF] font-normal">({prevInvoices.length} recent)</span>
                  </span>
                  <svg viewBox="0 0 16 16" fill="currentColor" className={`w-3.5 h-3.5 text-[#9CA3AF] transition-transform ${prevOpen ? 'rotate-180' : ''}`}>
                    <path d="M8 11L2 5h12z"/>
                  </svg>
                </button>
                {prevOpen && (
                  <div className="divide-y divide-[#F3F4F6]">
                    {prevInvoices.map(prev => (
                      <div key={prev.id} className="flex items-center justify-between px-4 py-2.5 gap-3">
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-[#0F0F0F] truncate">#{prev.invoice_number}</p>
                          <p className="text-[11px] text-[#9CA3AF] truncate mt-0.5">
                            {prev.issue_date}
                            {prev.bl_your_reference && <> · {prev.bl_your_reference}</>}
                            {prev.bl_po_number && <> · PO {prev.bl_po_number}</>}
                            {prev.bl_line_desc && <> · <span className="italic">{prev.bl_line_desc.slice(0, 40)}{prev.bl_line_desc.length > 40 ? '…' : ''}</span></>}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => applyPrevious(prev)}
                          className="flex-shrink-0 text-[11px] font-medium text-[#61b5cc] hover:text-[#4fa0b8] transition-colors whitespace-nowrap"
                        >
                          Use
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Re-submission notice */}
            {invoice.bl_status && (
              <div className={`text-xs px-3 py-2 rounded-xl border ${
                invoice.bl_status === 'rejected'
                  ? 'bg-[#FFF1F2] border-[#FECDD3] text-[#DC2626]'
                  : invoice.bl_status === 'approved'
                  ? 'bg-[#F0FDF4] border-[#BBF7D0] text-[#15803D]'
                  : 'bg-[#FFFBEB] border-[#FDE68A] text-[#B45309]'
              }`}>
                {invoice.bl_status === 'rejected' && (
                  <>Previously rejected{invoice.bl_reject_reason ? `: "${invoice.bl_reject_reason}"` : ''}. Update the details below and re-submit.</>
                )}
                {invoice.bl_status === 'approved' && (
                  <>Previously approved (BL #{invoice.bl_invoice_id}). Re-submitting will create a new draft request.</>
                )}
                {invoice.bl_status === 'pending' && (
                  <>Currently pending approval. Re-submitting will update the details and reset to pending.</>
                )}
              </div>
            )}

            {/* Line description */}
            <div>
              <label className={labelCls}>Invoice line description *</label>
              <textarea
                value={lineDesc}
                onChange={e => setLineDesc(e.target.value)}
                rows={2}
                placeholder="e.g. Consulting services — June 2026 capacity (160 h)"
                className={`${inputCls} resize-none`}
                required
              />
            </div>

            {/* Invoice # and amount */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Invoice #</label>
                <input value={invNumber} onChange={e => setInvNumber(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Amount (kSEK)</label>
                <input
                  type="number"
                  value={amountKSEK}
                  onChange={e => setAmountKSEK(Number(e.target.value))}
                  className={`${inputCls} [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none`}
                />
              </div>
            </div>

            {/* Dates */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Invoice date</label>
                <input type="date" value={issueDate} onChange={e => setIssueDate(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Due date</label>
                <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className={inputCls} />
              </div>
            </div>

            {/* VAT toggle */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                role="switch"
                aria-checked={excludeVat}
                onClick={() => setExcludeVat(v => !v)}
                className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${excludeVat ? 'bg-[#9CA3AF]' : 'bg-[#61b5cc]'}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${excludeVat ? 'translate-x-0' : 'translate-x-4'}`} />
              </button>
              <span className="text-xs text-[#6B7280]">{excludeVat ? 'No VAT (foreign client)' : 'VAT 25% applies'}</span>
            </div>

            {/* References section */}
            <div className={sectionCls}>
              <p className="text-[10px] font-semibold text-[#9CA3AF] uppercase tracking-wider mb-3">References</p>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>Your reference (Er referens)</label>
                    <input
                      value={yourRef}
                      onChange={e => setYourRef(e.target.value)}
                      placeholder="Client contact person"
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Our reference (Vår referens)</label>
                    <input
                      value={ourRef}
                      onChange={e => setOurRef(e.target.value)}
                      placeholder="Algorithma contact person"
                      className={inputCls}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>PO number</label>
                    <input
                      value={poNumber}
                      onChange={e => setPoNumber(e.target.value)}
                      placeholder="Purchase order #"
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Marking (Märkning)</label>
                    <input
                      value={marking}
                      onChange={e => setMarking(e.target.value)}
                      placeholder="Cost centre / project code"
                      className={inputCls}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Notes */}
            <div className={sectionCls}>
              <label className={labelCls}>Notes</label>
              <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional notes" className={inputCls} />
            </div>

            {error && (
              <p className="text-xs text-[#DC2626] bg-[#FFF1F2] border border-[#FECDD3] rounded-xl px-3 py-2">{error}</p>
            )}
          </div>
        </form>

        {/* Footer */}
        <div className="flex gap-2 px-6 py-4 border-t border-[#F3F4F6] flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="py-2 px-4 text-sm font-medium text-[#6B7280] border border-[#E5E7EB] rounded-xl hover:bg-[#F9F9F8] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="flex-1 py-2 text-sm font-medium text-white bg-[#0F0F0F] rounded-xl hover:bg-[#374151] transition-colors disabled:opacity-40 flex items-center justify-center gap-2"
          >
            {submitting ? (
              <><div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Submitting…</>
            ) : 'Submit for approval'}
          </button>
        </div>
      </div>
    </div>
  )
}
