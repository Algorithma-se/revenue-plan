'use client'

import { useRef, useState } from 'react'
import { upsertCashOutEvent, deleteCashOutEvent } from '@/app/actions/cash'
import { setBankBalanceEntry, deleteBankBalanceEntry } from '@/app/actions/invoices'
import type { CashOutEvent } from '@/app/actions/cash'

export type CashModalMode = 'cash_in' | 'cash_out' | 'bank'

interface InvoiceRow {
  id:             string
  invoice_number: string
  clientName:     string | null
  amount_sek:     number
  due_date:       string
  status:         string
  exclude_vat:    boolean
}

interface Props {
  mode:           CashModalMode
  month:          string          // YYYY-MM-01
  invoiceRows:    InvoiceRow[]    // unpaid invoices due this month
  manualInflows:  CashOutEvent[]  // is_inflow=true events for this month
  cashOutEvents:  CashOutEvent[]  // is_inflow=false events for this month
  bankEntry:      number | null   // SEK
  onEventsSaved:  (updated: CashOutEvent[], isInflow: boolean) => void
  onBankSaved:    (balance: number | null) => void
  onClose:        () => void
}

function monthLabel(iso: string) {
  return new Date(iso + 'T12:00:00').toLocaleString('en-SE', { month: 'long', year: 'numeric' })
}

function monthBounds(month: string) {
  const [y, m] = month.slice(0, 7).split('-').map(Number)
  const last = new Date(y, m, 0).getDate()
  return { min: `${month.slice(0, 7)}-01`, max: `${month.slice(0, 7)}-${String(last).padStart(2, '0')}` }
}

function fmt(sek: number) {
  return `${Math.round(Math.abs(sek) / 1000).toLocaleString('sv-SE')} kSEK`
}

function EventList({
  events, isInflow, onDelete,
}: {
  events: CashOutEvent[]
  isInflow: boolean
  onDelete: (id: string) => Promise<void>
}) {
  const [deleting, setDeleting] = useState<string | null>(null)
  const color = isInflow ? 'text-[#16A34A]' : 'text-[#DC2626]'
  const bg    = isInflow ? 'bg-[#F0FDF4]'  : 'bg-[#FEF2F2]'
  const sign  = isInflow ? '+' : '−'

  if (events.length === 0) return (
    <p className="text-xs text-[#9CA3AF] italic py-1">None yet.</p>
  )

  return (
    <div className="space-y-1.5">
      {events.map(e => (
        <div key={e.id} className={`flex items-center gap-2 px-3 py-2 ${bg} rounded-xl`}>
          <span className="text-[11px] text-[#9CA3AF] w-10 flex-shrink-0 tabular-nums">{e.date.slice(5)}</span>
          <span className="flex-1 text-xs text-[#374151] truncate">{e.label}</span>
          <span className={`text-xs font-medium flex-shrink-0 ${color}`}>{sign}{fmt(e.amount_sek)}</span>
          <button
            onClick={async () => { setDeleting(e.id); await onDelete(e.id); setDeleting(null) }}
            disabled={deleting === e.id}
            className="text-[#D1D5DB] hover:text-[#DC2626] transition-colors flex-shrink-0 disabled:opacity-40"
          >
            {deleting === e.id
              ? <div className="w-3 h-3 border border-[#DC2626] border-t-transparent rounded-full animate-spin" />
              : <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                  <path d="M5.5 5.5A.5.5 0 016 6v6a.5.5 0 01-1 0V6a.5.5 0 01.5-.5zm2.5 0a.5.5 0 01.5.5v6a.5.5 0 01-1 0V6a.5.5 0 01.5-.5zm3 .5a.5.5 0 00-1 0v6a.5.5 0 001 0V6z"/>
                  <path fillRule="evenodd" d="M14.5 3a1 1 0 01-1 1H13v9a2 2 0 01-2 2H5a2 2 0 01-2-2V4h-.5a1 1 0 010-2h4a1 1 0 011-1h2a1 1 0 011 1h4a1 1 0 011 1zM4.118 4L4 4.059V13a1 1 0 001 1h6a1 1 0 001-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z" clipRule="evenodd"/>
                </svg>
            }
          </button>
        </div>
      ))}
    </div>
  )
}

function AddEventForm({
  month, isInflow, onAdded,
}: {
  month:    string
  isInflow: boolean
  onAdded:  (event: CashOutEvent) => void
}) {
  const { min, max } = monthBounds(month)
  const [date,   setDate]   = useState(min)
  const [label,  setLabel]  = useState('')
  const [amount, setAmount] = useState('')
  const [saving, setSaving] = useState(false)
  const labelRef = useRef<HTMLInputElement>(null)

  async function handleAdd() {
    const amt = Math.abs(parseFloat(amount.replace(',', '.')))
    if (!label.trim() || isNaN(amt) || amt === 0) return
    setSaving(true)
    try {
      const row = await upsertCashOutEvent({ date, label: label.trim(), amount_sek: Math.round(amt * 1000), is_inflow: isInflow })
      onAdded(row)
      setLabel(''); setAmount('')
      labelRef.current?.focus()
    } finally { setSaving(false) }
  }

  const sign = isInflow ? '+' : '−'

  return (
    <div className="bg-[#F9F9F8] rounded-xl p-3 space-y-2 mt-3">
      <div className="flex gap-2">
        <input type="date" value={date} min={min} max={max} onChange={e => setDate(e.target.value)}
          className="w-32 text-xs px-2 py-1.5 border border-[#E5E7EB] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#61b5cc]" />
        <input ref={labelRef} type="text" value={label} onChange={e => setLabel(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAdd()}
          placeholder={isInflow ? 'e.g. Tax refund' : 'e.g. Salaries'}
          className="flex-1 text-xs px-2 py-1.5 border border-[#E5E7EB] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#61b5cc]" />
      </div>
      <div className="flex gap-2 items-center">
        <span className="text-xs text-[#9CA3AF] font-medium w-4 flex-shrink-0 text-center">{sign}</span>
        <div className="relative flex-1">
          <input type="number" value={amount} onChange={e => setAmount(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
            placeholder="Amount" min="0" step="1"
            className="w-full text-xs px-2 py-1.5 pr-10 border border-[#E5E7EB] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#61b5cc]" />
          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-[#9CA3AF]">kSEK</span>
        </div>
        <button onClick={handleAdd} disabled={saving || !label.trim() || !amount}
          className="px-3 py-1.5 text-xs font-medium text-white bg-[#0F0F0F] rounded-lg hover:bg-[#374151] transition-colors disabled:opacity-40">
          {saving ? <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : 'Add'}
        </button>
      </div>
    </div>
  )
}

export function CashPositionModal({
  mode, month, invoiceRows, manualInflows, cashOutEvents, bankEntry, onEventsSaved, onBankSaved, onClose,
}: Props) {
  const [inflows,  setInflows]  = useState<CashOutEvent[]>(manualInflows)
  const [outflows, setOutflows] = useState<CashOutEvent[]>(cashOutEvents)
  const [bankVal,  setBankVal]  = useState(bankEntry != null ? String(Math.round(bankEntry / 1000)) : '')
  const [bankSaved, setBankSaved] = useState(bankEntry != null)
  const [bankSaving, setBankSaving] = useState(false)

  const invoiceTotal  = invoiceRows.reduce((s, i) => s + i.amount_sek * (i.exclude_vat ? 1 : 1.25), 0)
  const manualInTotal = inflows.reduce((s, e) => s + e.amount_sek, 0)
  const cashOutTotal  = outflows.reduce((s, e) => s + e.amount_sek, 0)

  const TITLES: Record<CashModalMode, string> = {
    cash_in:  'Cash In',
    cash_out: 'Cash Out',
    bank:     'Bank Balance',
  }

  async function handleDelete(id: string, isInflow: boolean) {
    await deleteCashOutEvent(id)
    if (isInflow) {
      const next = inflows.filter(e => e.id !== id)
      setInflows(next); onEventsSaved(next, true)
    } else {
      const next = outflows.filter(e => e.id !== id)
      setOutflows(next); onEventsSaved(next, false)
    }
  }

  async function handleSaveBank() {
    const val = parseFloat(bankVal.replace(/\s/g, '').replace(',', '.'))
    if (isNaN(val)) return
    setBankSaving(true)
    try {
      await setBankBalanceEntry(month, Math.round(val * 1000))
      onBankSaved(Math.round(val * 1000))
      setBankSaved(true)
    } finally { setBankSaving(false) }
  }

  async function handleClearBank() {
    setBankSaving(true)
    try {
      await deleteBankBalanceEntry(month)
      onBankSaved(null)
      setBankVal(''); setBankSaved(false)
    } finally { setBankSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[85vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#F3F4F6] flex-shrink-0">
          <div>
            <h2 className="text-sm font-bold text-[#0F0F0F]">{TITLES[mode]} — {monthLabel(month)}</h2>
            <p className="text-[10px] text-[#9CA3AF] mt-0.5">{month.slice(0, 7)}</p>
          </div>
          <button onClick={onClose} className="text-[#9CA3AF] hover:text-[#6B7280] transition-colors">
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">

          {/* CASH IN MODE */}
          {mode === 'cash_in' && (
            <>
              {/* Invoice inflows — read-only */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] font-bold text-[#9CA3AF] uppercase tracking-wider">Invoices due this month <span className="font-normal normal-case">(VAT applied per invoice)</span></p>
                  <p className="text-xs font-semibold text-[#16A34A]">{fmt(invoiceTotal)}</p>
                </div>
                {invoiceRows.length === 0 ? (
                  <p className="text-xs text-[#9CA3AF] italic">No invoices due this month.</p>
                ) : (
                  <div className="space-y-1.5">
                    {invoiceRows.map(inv => (
                      <div key={inv.id} className="flex items-center gap-2 px-3 py-2 bg-[#F0FDF4] rounded-xl">
                        <span className="text-[11px] font-mono text-[#374151] w-20 flex-shrink-0">{inv.invoice_number}</span>
                        <span className="flex-1 text-xs text-[#374151] truncate">{inv.clientName ?? '—'}</span>
                        <span className="text-xs font-medium text-[#16A34A] flex-shrink-0">
                      +{fmt(inv.amount_sek * (inv.exclude_vat ? 1 : 1.25))}
                      {inv.exclude_vat && <span className="ml-1 text-[10px] text-[#9CA3AF]">no VAT</span>}
                    </span>
                        <span className="text-[10px] text-[#9CA3AF] tabular-nums flex-shrink-0">{inv.due_date.slice(5)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Manual inflows — editable */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] font-bold text-[#9CA3AF] uppercase tracking-wider">Manual cash in</p>
                  {manualInTotal > 0 && <p className="text-xs font-semibold text-[#16A34A]">+{fmt(manualInTotal)}</p>}
                </div>
                <p className="text-[11px] text-[#9CA3AF] mb-2">Tax refunds, grants, or other non-invoice inflows.</p>
                <EventList events={inflows} isInflow={true} onDelete={id => handleDelete(id, true)} />
                <AddEventForm month={month} isInflow={true} onAdded={e => {
                  const next = [...inflows, e].sort((a, b) => a.date.localeCompare(b.date))
                  setInflows(next); onEventsSaved(next, true)
                }} />
              </div>

              {/* Total */}
              <div className="flex items-center justify-between px-3 py-2.5 bg-[#F0FDF4] rounded-xl">
                <p className="text-xs font-semibold text-[#374151]">Total cash in</p>
                <p className="text-sm font-bold text-[#16A34A]">+{fmt(invoiceTotal + manualInTotal)}</p>
              </div>
            </>
          )}

          {/* CASH OUT MODE */}
          {mode === 'cash_out' && (
            <>
              <div>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[10px] font-bold text-[#9CA3AF] uppercase tracking-wider">Cash outflows this month</p>
                  {cashOutTotal > 0 && <p className="text-xs font-semibold text-[#DC2626]">−{fmt(cashOutTotal)}</p>}
                </div>
                <EventList events={outflows} isInflow={false} onDelete={id => handleDelete(id, false)} />
                <AddEventForm month={month} isInflow={false} onAdded={e => {
                  const next = [...outflows, e].sort((a, b) => a.date.localeCompare(b.date))
                  setOutflows(next); onEventsSaved(next, false)
                }} />
              </div>
            </>
          )}

          {/* BANK BALANCE MODE */}
          {mode === 'bank' && (
            <>
              <p className="text-sm text-[#374151] leading-relaxed">
                Set the actual bank balance for this month. This anchors the running projection — all subsequent months are calculated as: previous balance + cash in − cash out.
              </p>
              <div className="space-y-3">
                <div className="relative">
                  <input
                    type="number"
                    value={bankVal}
                    onChange={e => { setBankVal(e.target.value); setBankSaved(false) }}
                    onKeyDown={e => e.key === 'Enter' && handleSaveBank()}
                    placeholder="Balance"
                    autoFocus
                    className={`w-full text-sm px-3 py-2 pr-12 border rounded-xl focus:outline-none focus:ring-2 focus:ring-[#61b5cc] ${bankSaved ? 'border-[#0B7A9E] bg-[#EFF9FF]' : 'border-[#E5E7EB]'}`}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[#9CA3AF]">kSEK</span>
                </div>
                {bankSaved && (
                  <button
                    onClick={handleClearBank}
                    disabled={bankSaving}
                    className="text-xs text-[#9CA3AF] hover:text-[#DC2626] transition-colors disabled:opacity-40"
                  >
                    Clear anchor — revert to calculated
                  </button>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer — Save / Done */}
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-[#F3F4F6] flex-shrink-0">
          {mode === 'bank' ? (
            <>
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-[#6B7280] border border-[#E5E7EB] rounded-xl hover:bg-[#F9F9F8] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={async () => { await handleSaveBank(); onClose() }}
                disabled={bankSaving || !bankVal}
                className="flex-1 py-2 text-sm font-medium text-white bg-[#0B7A9E] rounded-xl hover:bg-[#0A6B8A] transition-colors disabled:opacity-40 flex items-center justify-center gap-2"
              >
                {bankSaving
                  ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Saving…</>
                  : 'Save balance'}
              </button>
            </>
          ) : (
            <button
              onClick={onClose}
              className="ml-auto px-6 py-2 text-sm font-medium text-white bg-[#0F0F0F] rounded-xl hover:bg-[#374151] transition-colors"
            >
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
