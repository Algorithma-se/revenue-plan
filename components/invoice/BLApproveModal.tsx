'use client'

import { useState } from 'react'
import type { Invoice } from '@/types/database'
import { approveBLInvoice, rejectBLInvoice } from '@/app/actions/bl'

interface Props {
  invoice:   Invoice
  isStub?:   boolean
  onDone:    (updated: Partial<Invoice>) => void
  onClose:   () => void
}

export function BLApproveModal({ invoice, isStub = true, onDone, onClose }: Props) {
  const [rejecting,  setRejecting]  = useState(false)
  const [reason,     setReason]     = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error,      setError]      = useState<string | null>(null)

  const kSEK = Math.round(invoice.amount_sek / 1000).toLocaleString('sv-SE')

  async function handleApprove() {
    setError(null)
    setSubmitting(true)
    const result = await approveBLInvoice(invoice.id)
    setSubmitting(false)
    if (result.error) { setError(result.error); return }
    onDone({ bl_status: 'approved' })
  }

  async function handleReject() {
    if (!reason.trim()) { setError('Please enter a rejection reason'); return }
    setError(null)
    setSubmitting(true)
    const result = await rejectBLInvoice(invoice.id, reason.trim())
    setSubmitting(false)
    if (result.error) { setError(result.error); return }
    onDone({ bl_status: 'rejected', bl_reject_reason: reason.trim() })
  }

  const rowCls  = 'flex items-start gap-3 py-2 border-b border-[#F3F4F6] last:border-0'
  const keyCls  = 'text-[11px] text-[#9CA3AF] w-28 flex-shrink-0 pt-0.5'
  const valCls  = 'text-sm text-[#0F0F0F]'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">

        <div className="flex items-start justify-between px-6 pt-6 pb-4 border-b border-[#F3F4F6]">
          <div>
            <h2 className="text-base font-bold text-[#0F0F0F]">Review for BL approval</h2>
            <p className="text-xs text-[#9CA3AF] mt-0.5">{invoice.client_name ?? '—'} · #{invoice.invoice_number}</p>
          </div>
          <button onClick={onClose} className="text-[#9CA3AF] hover:text-[#6B7280] mt-0.5 ml-4 flex-shrink-0">
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-4">
          <div className="bg-[#F9F9F8] rounded-xl p-4 space-y-0 mb-4 max-h-64 overflow-y-auto">
            <div className={rowCls}>
              <span className={keyCls}>Line description</span>
              <span className={`${valCls} font-medium`}>{invoice.bl_line_desc ?? <span className="text-[#9CA3AF] italic">Not set</span>}</span>
            </div>
            <div className={rowCls}>
              <span className={keyCls}>Invoice #</span>
              <span className={valCls}>{invoice.invoice_number}</span>
            </div>
            <div className={rowCls}>
              <span className={keyCls}>Amount</span>
              <span className={valCls}>{kSEK} kSEK{invoice.exclude_vat ? ' (no VAT)' : ' + VAT 25%'}</span>
            </div>
            <div className={rowCls}>
              <span className={keyCls}>Invoice date</span>
              <span className={valCls}>{invoice.issue_date}</span>
            </div>
            <div className={rowCls}>
              <span className={keyCls}>Due date</span>
              <span className={valCls}>{invoice.due_date}</span>
            </div>
            {invoice.bl_your_reference && (
              <div className={rowCls}>
                <span className={keyCls}>Er referens</span>
                <span className={valCls}>{invoice.bl_your_reference}</span>
              </div>
            )}
            {invoice.bl_our_reference && (
              <div className={rowCls}>
                <span className={keyCls}>Vår referens</span>
                <span className={valCls}>{invoice.bl_our_reference}</span>
              </div>
            )}
            {invoice.bl_po_number && (
              <div className={rowCls}>
                <span className={keyCls}>PO number</span>
                <span className={valCls}>{invoice.bl_po_number}</span>
              </div>
            )}
            {invoice.bl_marking && (
              <div className={rowCls}>
                <span className={keyCls}>Märkning</span>
                <span className={valCls}>{invoice.bl_marking}</span>
              </div>
            )}
            {invoice.notes && (
              <div className={rowCls}>
                <span className={keyCls}>Notes</span>
                <span className={`${valCls} text-xs`}>{invoice.notes}</span>
              </div>
            )}
          </div>

          {isStub && (
            <div className="text-xs text-[#B45309] bg-[#FFFBEB] border border-[#FDE68A] rounded-xl px-3 py-2 mb-4">
              BL credentials not configured — approval will be simulated (stub mode).
            </div>
          )}

          {rejecting ? (
            <div className="space-y-3">
              <div>
                <label className="block text-[10px] font-semibold text-[#9CA3AF] uppercase tracking-wider mb-1">Rejection reason</label>
                <input
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  placeholder="e.g. Wrong amount, missing milestone details…"
                  autoFocus
                  className="w-full px-3 py-2 text-sm text-[#0F0F0F] bg-[#F9F9F8] border border-[#EBEBEB] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#DC2626] focus:border-transparent transition-all"
                />
              </div>
              {error && (
                <p className="text-xs text-[#DC2626] bg-[#FFF1F2] border border-[#FECDD3] rounded-xl px-3 py-2">{error}</p>
              )}
              <div className="flex gap-2">
                <button
                  onClick={() => { setRejecting(false); setError(null) }}
                  className="py-2 px-4 text-sm font-medium text-[#6B7280] border border-[#E5E7EB] rounded-xl hover:bg-[#F9F9F8] transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={handleReject}
                  disabled={submitting || !reason.trim()}
                  className="flex-1 py-2 text-sm font-medium text-white bg-[#DC2626] rounded-xl hover:bg-[#B91C1C] transition-colors disabled:opacity-40 flex items-center justify-center gap-2"
                >
                  {submitting ? (
                    <><div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Rejecting…</>
                  ) : 'Confirm rejection'}
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {error && (
                <p className="text-xs text-[#DC2626] bg-[#FFF1F2] border border-[#FECDD3] rounded-xl px-3 py-2">{error}</p>
              )}
              <div className="flex gap-2">
                <button
                  onClick={() => setRejecting(true)}
                  disabled={submitting}
                  className="py-2 px-4 text-sm font-medium text-[#DC2626] border border-[#FECDD3] rounded-xl hover:bg-[#FFF1F2] transition-colors disabled:opacity-40"
                >
                  Reject
                </button>
                <button
                  onClick={handleApprove}
                  disabled={submitting}
                  className="flex-1 py-2 text-sm font-medium text-white bg-[#16A34A] rounded-xl hover:bg-[#15803D] transition-colors disabled:opacity-40 flex items-center justify-center gap-2"
                >
                  {submitting ? (
                    <><div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Approving…</>
                  ) : isStub ? 'Approve → Create draft in BL (stub)' : 'Approve → Create draft in BL'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
