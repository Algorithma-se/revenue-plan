'use client'

import { useState } from 'react'
import type { InvoiceStatus, InvoiceDraft } from '@/types/database'
import { updateInvoice } from '@/app/actions/invoices'
import { ChatNotifyModal } from './ChatNotifyModal'

export interface InvoiceEditData {
  id:                       string
  manual_revenue_item_id?:  string | null
  invoice_number:           string
  issue_date:               string
  due_date:                 string
  paid_date?:               string | null
  amount_sek:               number
  payment_trigger:          string
  milestone_label:          string | null
  status:                   string
  notes:                    string | null
  exclude_vat:              boolean
  clientName:               string | null
  project:                  string | null
  bl_status?:               string | null
  bl_invoice_id?:           string | null
  bl_line_desc?:            string | null
  bl_reject_reason?:        string | null
  bl_rejected_at?:          string | null
  bl_your_reference?:       string | null
  bl_our_reference?:        string | null
  bl_po_number?:            string | null
  bl_marking?:              string | null
  bl_allie_initiated?:      boolean | null
}

interface ClientOption { itemId: string; clientName: string | null }

interface Props {
  invoice:           InvoiceEditData
  paymentTermsDays?: number
  clients?:          ClientOption[]   // all revenue items — enables client reassignment
  onSaved:           (updated: InvoiceEditData) => void
  onClose:           () => void
}

const STATUS_OPTIONS: { value: InvoiceStatus; label: string; active: string; inactive: string }[] = [
  { value: 'draft', label: 'Draft', active: 'bg-[#9CA3AF] text-white',  inactive: 'bg-[#F3F4F6] text-[#9CA3AF] hover:bg-[#E5E7EB]' },
  { value: 'sent',  label: 'Sent',  active: 'bg-[#2563EB] text-white',  inactive: 'bg-[#F3F4F6] text-[#9CA3AF] hover:bg-[#E5E7EB]' },
  { value: 'paid',  label: 'Paid',  active: 'bg-[#16A34A] text-white',  inactive: 'bg-[#F3F4F6] text-[#9CA3AF] hover:bg-[#E5E7EB]' },
]

const inputCls = 'w-full text-sm text-[#0F0F0F] bg-[#F9F9F8] border border-[#EBEBEB] rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#61b5cc] focus:border-transparent transition-all'
const labelCls = 'block text-[10px] font-semibold text-[#9CA3AF] uppercase tracking-wider mb-1'

function addDays(iso: string, days: number): string {
  const d = new Date(iso + 'T12:00:00')
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

export function InvoiceEditModal({ invoice, paymentTermsDays, clients, onSaved, onClose }: Props) {
  const [form, setForm] = useState({ ...invoice })
  // Deduplicate client options by name
  const clientOptions = clients
    ? [...new Map(clients.filter(c => c.clientName).map(c => [c.clientName, c])).values()]
    : null
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState<string | null>(null)
  const [showChat, setShowChat] = useState(false)

  function patch(p: Partial<typeof form>) {
    const extra: Partial<typeof form> = {}
    if ('issue_date' in p && p.issue_date && paymentTermsDays) {
      extra.due_date = addDays(p.issue_date, paymentTermsDays)
    }
    setForm(prev => ({ ...prev, ...extra, ...p }))
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    const result = await updateInvoice(form.id, {
      invoice_number:          form.invoice_number,
      issue_date:              form.issue_date,
      due_date:                form.due_date,
      amount_sek:              form.amount_sek,
      payment_trigger:         form.payment_trigger,
      milestone_label:         form.milestone_label || null,
      status:                  form.status as InvoiceStatus,
      notes:                   form.notes || null,
      exclude_vat:             form.exclude_vat,
      client_name:             form.clientName,
      manual_revenue_item_id:  form.manual_revenue_item_id,
    })
    setSaving(false)
    if (result.error) {
      setError(result.error)
    } else {
      onSaved(form)
    }
  }

  const chatDraft: InvoiceDraft = {
    id:              form.id,
    invoice_number:  form.invoice_number,
    issue_date:      form.issue_date,
    due_date:        form.due_date,
    amount_sek:      form.amount_sek,
    payment_trigger: form.payment_trigger as 'date' | 'milestone',
    milestone_label: form.milestone_label ?? '',
    status:          form.status as InvoiceStatus,
    notes:           form.notes ?? '',
  }

  if (showChat) {
    return (
      <ChatNotifyModal
        draft={chatDraft}
        saved={null}
        clientName={form.clientName}
        onClose={() => setShowChat(false)}
      />
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">

        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-[#F3F4F6]">
          <div>
            <h2 className="text-base font-bold text-[#0F0F0F]">Edit Invoice</h2>
            <p className="text-xs text-[#9CA3AF] mt-0.5">
              {form.clientName ?? '—'}
              {form.project && <span className="ml-1.5 text-[#C4C9D4]">· {form.project}</span>}
            </p>
          </div>
          <button onClick={onClose} className="text-[#9CA3AF] hover:text-[#6B7280]">
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        {/* Form */}
        <div className="px-6 py-4 space-y-4">

          {/* Status */}
          <div>
            <label className={labelCls}>Status</label>
            <div className="flex gap-2">
              {STATUS_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => patch({ status: opt.value })}
                  className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                    form.status === opt.value ? opt.active : opt.inactive
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Client reassignment — shown when client list is provided */}
          {clientOptions && (
            <div>
              <label className={labelCls}>Client</label>
              <select
                value={form.clientName ?? ''}
                onChange={e => {
                  const opt = clientOptions.find(c => c.clientName === e.target.value)
                  patch({ clientName: e.target.value || null, manual_revenue_item_id: opt?.itemId ?? null })
                }}
                className={inputCls}
              >
                <option value="">— Unassigned —</option>
                {clientOptions.map(c => (
                  <option key={c.itemId} value={c.clientName!}>{c.clientName}</option>
                ))}
              </select>
            </div>
          )}

          {/* Invoice # + Amount */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Invoice #</label>
              <input
                value={form.invoice_number}
                onChange={e => patch({ invoice_number: e.target.value })}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Amount (SEK)</label>
              <input
                type="number"
                value={form.amount_sek || ''}
                onChange={e => patch({ amount_sek: Number(e.target.value) })}
                className={`${inputCls} [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none`}
                placeholder="0"
              />
            </div>
          </div>

          {/* Issue + Due dates */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Issue date</label>
              <input
                type="date"
                value={form.issue_date}
                onChange={e => patch({ issue_date: e.target.value })}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>
                Due date{paymentTermsDays ? <span className="ml-1 font-normal normal-case opacity-60">Net {paymentTermsDays} auto</span> : ''}
              </label>
              <input
                type="date"
                value={form.due_date}
                onChange={e => patch({ due_date: e.target.value })}
                className={inputCls}
              />
            </div>
          </div>

          {/* Milestone / description */}
          <div>
            <label className={labelCls}>Milestone / description</label>
            <input
              value={form.milestone_label ?? ''}
              onChange={e => patch({ milestone_label: e.target.value || null })}
              placeholder="Optional milestone or description"
              className={inputCls}
            />
          </div>

          {/* Notes */}
          <div>
            <label className={labelCls}>Notes</label>
            <textarea
              value={form.notes ?? ''}
              onChange={e => patch({ notes: e.target.value || null })}
              rows={2}
              placeholder="Internal notes"
              className={`${inputCls} resize-none`}
            />
          </div>

          {/* VAT exemption */}
          <label className="flex items-center gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={form.exclude_vat}
              onChange={e => patch({ exclude_vat: e.target.checked })}
              className="w-4 h-4 rounded border-[#E5E7EB] text-[#61b5cc] focus:ring-[#61b5cc]"
            />
            <span className="text-xs text-[#374151]">
              No VAT — foreign / export invoice
              <span className="ml-1.5 text-[10px] text-[#9CA3AF]">(cash-in shown at net amount)</span>
            </span>
          </label>
        </div>

        {error && (
          <p className="mx-6 mb-2 text-xs text-[#DC2626] bg-[#FFF1F2] border border-[#FECDD3] rounded-xl px-3 py-2">
            {error}
          </p>
        )}

        {/* Footer */}
        <div className="flex items-center gap-2 px-6 pb-5">
          <button
            onClick={() => setShowChat(true)}
            className="p-2 rounded-lg text-[#9CA3AF] hover:text-[#61b5cc] hover:bg-[#F0F9FF] transition-colors"
            title="Notify team via Google Chat"
          >
            <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4">
              <path d="M14 1a1 1 0 011 1v8a1 1 0 01-1 1H4.414A2 2 0 003 11.586l-2 2V2a1 1 0 011-1h12zM2 0a2 2 0 00-2 2v12.793a.5.5 0 00.854.353l2.853-2.853A1 1 0 014.414 12H14a2 2 0 002-2V2a2 2 0 00-2-2H2z"/>
            </svg>
          </button>
          <div className="flex-1" />
          <button
            onClick={onClose}
            className="py-2 px-4 text-sm font-medium text-[#6B7280] border border-[#E5E7EB] rounded-xl hover:bg-[#F9F9F8] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="py-2 px-6 text-sm font-medium text-white bg-[#0F0F0F] rounded-xl hover:bg-[#374151] transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
