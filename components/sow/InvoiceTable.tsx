'use client'

import { useState } from 'react'
import type { InvoiceDraft, Invoice, InvoiceStatus } from '@/types/database'
import { InvoiceStatusBadge } from './InvoiceStatusBadge'
import { ChatNotifyModal } from './ChatNotifyModal'
import { AddInvoiceModal } from './AddInvoiceModal'
import { BLSubmitModal } from '@/components/invoice/BLSubmitModal'
import { BLApproveModal } from '@/components/invoice/BLApproveModal'

interface Props {
  drafts:             InvoiceDraft[]
  savedInvoices:      Invoice[]
  contractValueSek:   number | null
  clientName:         string | null
  paymentTermsDays?:  number
  clientExcludeVat?:  boolean
  disableAdd?:        boolean
  blBetaEnabled?:     boolean
  isStubMode?:        boolean
  onChange:           (drafts: InvoiceDraft[]) => void
  onStatusChange:     (invoiceId: string, status: InvoiceStatus, paidDate: string | null) => void
  onBLChange?:        (invoiceId: string, patch: Partial<Invoice>) => void
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso + 'T12:00:00')
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

export function InvoiceTable({ drafts, savedInvoices, contractValueSek, clientName, paymentTermsDays, clientExcludeVat, disableAdd, blBetaEnabled, isStubMode = true, onChange, onStatusChange, onBLChange }: Props) {
  const idMap = new Map(savedInvoices.map(i => [i.invoice_number, i]))
  const [notifyIdx,    setNotifyIdx]    = useState<number | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [blSubmitInvoice,  setBLSubmitInvoice]  = useState<Invoice | null>(null)
  const [blApproveInvoice, setBLApproveInvoice] = useState<Invoice | null>(null)

  function update(idx: number, patch: Partial<InvoiceDraft>) {
    const fullPatch = { ...patch }
    // Auto-derive payment_trigger from milestone_label presence
    if ('milestone_label' in patch) {
      fullPatch.payment_trigger = patch.milestone_label ? 'milestone' : 'date'
    }
    // Auto-calculate due date when issue date changes
    if ('issue_date' in patch && patch.issue_date && paymentTermsDays) {
      fullPatch.due_date = addDays(patch.issue_date, paymentTermsDays)
    }
    onChange(drafts.map((d, i) => i === idx ? { ...d, ...fullPatch } : d))
  }

  function removeRow(idx: number) {
    onChange(drafts.filter((_, i) => i !== idx))
  }

  const total = drafts.reduce((s, d) => s + (d.amount_sek || 0), 0)
  const diff  = contractValueSek != null ? total - contractValueSek : null

  const thCls   = 'px-3 py-2 text-[10px] font-semibold text-[#9CA3AF] uppercase tracking-wider'
  const cellCls = 'px-3 py-1.5'
  const inputCls = 'w-full text-xs border border-transparent focus:border-[#E5E7EB] rounded bg-transparent focus:bg-white px-0 focus:px-1 py-0.5'

  return (
    <div>
      <table className="w-full table-fixed text-xs">
          <colgroup>
            <col className="w-[12%]" /> {/* # */}
            <col className="w-[11%]" /> {/* Issue date */}
            <col className="w-[11%]" /> {/* Due date */}
            <col className="w-[9%]"  /> {/* Amount */}
            <col className="w-[8%]"  /> {/* VAT */}
            <col className={blBetaEnabled ? 'w-[13%]' : 'w-[17%]'} /> {/* Milestone */}
            <col className="w-[11%]" /> {/* Status */}
            <col className={blBetaEnabled ? 'w-[9%]'  : 'w-[16%]'} /> {/* Notes */}
            {blBetaEnabled && <col className="w-[8%]" />} {/* BL */}
            <col className="w-[4%]"  /> {/* Notify */}
            <col className="w-[3%]"  /> {/* Delete */}
          </colgroup>
          <thead>
            <tr className="bg-[#F3F4F6] border-b border-[#E5E7EB]">
              <th className={`${thCls} text-left`}>#</th>
              <th className={`${thCls} text-left`}>Issue date</th>
              <th className={`${thCls} text-left`}>Due date</th>
              <th className={`${thCls} text-right`}>kSEK</th>
              <th className={`${thCls} text-right`} title="VAT amount (25%)">VAT</th>
              <th className={`${thCls} text-left`}>Milestone</th>
              <th className={`${thCls} text-left`}>Status</th>
              <th className={`${thCls} text-left`}>Notes</th>
              {blBetaEnabled && <th className={`${thCls} text-left`}>BL</th>}
              <th className="py-2" />
              <th className="py-2" />
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
                      className="w-full text-xs text-right border border-transparent focus:border-[#E5E7EB] rounded bg-transparent focus:bg-white py-0.5 px-0 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                      placeholder="0"
                    />
                  </td>
                  <td className={`${cellCls} text-right`}>
                    {clientExcludeVat || d.exclude_vat ? (
                      <span className="text-[11px] text-[#9CA3AF]">—</span>
                    ) : d.amount_sek > 0 ? (
                      <span className="text-[11px] text-[#6B7280] tabular-nums">
                        {(Math.round(d.amount_sek * 0.25 / 1000 * 10) / 10).toLocaleString('sv-SE')} k
                      </span>
                    ) : null}
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
                  {blBetaEnabled && (
                    <td className={`${cellCls}`}>
                      {saved ? (() => {
                        const blStatus = saved.bl_status
                        if (!blStatus) {
                          return (
                            <button
                              onClick={() => setBLSubmitInvoice(saved)}
                              title="Send to Björn Lundén"
                              className="text-[#D1D5DB] hover:text-[#0369A1] transition-colors"
                            >
                              <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                                <path d="M8 1a7 7 0 100 14A7 7 0 008 1zm3.5 7.5h-3v3a.5.5 0 01-1 0v-3h-3a.5.5 0 010-1h3v-3a.5.5 0 011 0v3h3a.5.5 0 010 1z"/>
                              </svg>
                            </button>
                          )
                        }
                        return (
                          <div className="flex items-center gap-1 group/bl">
                            {blStatus === 'pending' && (
                              <button
                                onClick={() => setBLApproveInvoice(saved)}
                                title="Pending BL approval — click to review"
                                className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium rounded-full bg-[#FFFBEB] text-[#B45309] hover:bg-[#FDE68A] transition-colors"
                              >
                                Pending
                              </button>
                            )}
                            {blStatus === 'approved' && (
                              <span className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium rounded-full bg-[#F0FDF4] text-[#16A34A]">
                                BL ✓
                              </span>
                            )}
                            {blStatus === 'rejected' && (
                              <span
                                title={saved.bl_reject_reason ?? 'Rejected'}
                                className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium rounded-full bg-[#FFF1F2] text-[#DC2626] cursor-default"
                              >
                                Rejected
                              </span>
                            )}
                            <button
                              onClick={() => setBLSubmitInvoice(saved)}
                              title="Re-submit to BL"
                              className="text-[#D1D5DB] hover:text-[#0369A1] transition-colors opacity-0 group-hover/bl:opacity-100"
                            >
                              <svg viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
                                <path d="M11.534 7h3.932a.25.25 0 01.192.41l-1.966 2.36a.25.25 0 01-.384 0l-1.966-2.36a.25.25 0 01.192-.41zm-11 2h3.932a.25.25 0 00.192-.41L2.692 6.23a.25.25 0 00-.384 0L.342 8.59A.25.25 0 00.534 9z"/>
                                <path fillRule="evenodd" d="M8 3c-1.552 0-2.94.707-3.857 1.818a.5.5 0 11-.771-.636A6.002 6.002 0 0113.917 7H12.9A5.002 5.002 0 008 3zM3.1 9a5.002 5.002 0 008.757 2.182.5.5 0 11.771.636A6.002 6.002 0 012.083 9H3.1z" clipRule="evenodd"/>
                              </svg>
                            </button>
                          </div>
                        )
                      })() : (
                        <span className="text-[#D1D5DB] text-[10px] italic">Save first</span>
                      )}
                    </td>
                  )}
                  <td className="px-1 py-1.5">
                    <button
                      onClick={() => setNotifyIdx(i)}
                      className="text-[#D1D5DB] hover:text-[#61b5cc] transition-colors"
                      title="Notify team"
                    >
                      <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                        <path d="M14 1a1 1 0 011 1v8a1 1 0 01-1 1H4.414A2 2 0 003 11.586l-2 2V2a1 1 0 011-1h12zM2 0a2 2 0 00-2 2v12.793a.5.5 0 00.854.353l2.853-2.853A1 1 0 014.414 12H14a2 2 0 002-2V2a2 2 0 00-2-2H2z"/>
                      </svg>
                    </button>
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

      {showAddModal && (
        <AddInvoiceModal
          existingCount={drafts.length}
          paymentTermsDays={paymentTermsDays ?? 0}
          clientExcludeVat={clientExcludeVat ?? false}
          onAdd={newDrafts => onChange([...drafts, ...newDrafts])}
          onClose={() => setShowAddModal(false)}
        />
      )}

      {notifyIdx !== null && drafts[notifyIdx] && (
        <ChatNotifyModal
          draft={drafts[notifyIdx]}
          saved={idMap.get(drafts[notifyIdx].invoice_number) ?? null}
          clientName={clientName}
          onClose={() => setNotifyIdx(null)}
        />
      )}

      {blSubmitInvoice && (
        <BLSubmitModal
          invoice={blSubmitInvoice}
          onDone={patch => {
            onBLChange?.(blSubmitInvoice.id, patch)
            setBLSubmitInvoice(null)
          }}
          onClose={() => setBLSubmitInvoice(null)}
        />
      )}

      {blApproveInvoice && (
        <BLApproveModal
          invoice={blApproveInvoice}
          isStub={isStubMode}
          onDone={patch => {
            onBLChange?.(blApproveInvoice.id, patch)
            setBLApproveInvoice(null)
          }}
          onClose={() => setBLApproveInvoice(null)}
        />
      )}

      <div className="flex items-center justify-between px-5 py-3 border-t border-[#F3F4F6]">
        {!disableAdd && (
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 text-xs text-[#9CA3AF] hover:text-[#2563EB] transition-colors"
          >
            <span className="text-sm font-light">+</span> Add invoice
          </button>
        )}
        {disableAdd && <span className="text-xs text-[#9CA3AF] italic">Reassign invoices to re-enable editing</span>}
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
