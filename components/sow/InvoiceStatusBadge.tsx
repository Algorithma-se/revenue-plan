'use client'

import { useState } from 'react'
import type { InvoiceStatus } from '@/types/database'
import { updateInvoiceStatus } from '@/app/actions/invoices'

const CONFIG: Record<InvoiceStatus, { label: string; cls: string }> = {
  draft: { label: 'Draft', cls: 'bg-[#9CA3AF] text-white' },
  sent:  { label: 'Sent',  cls: 'bg-[#2563EB] text-white' },
  paid:  { label: 'Paid',  cls: 'bg-[#16A34A] text-white' },
}

const CYCLE: Record<InvoiceStatus, InvoiceStatus> = {
  draft: 'sent',
  sent:  'paid',
  paid:  'draft',
}

interface Props {
  invoiceId: string
  status: InvoiceStatus
  paidDate: string | null
  onChange: (status: InvoiceStatus, paidDate: string | null) => void
}

export function InvoiceStatusBadge({ invoiceId, status, paidDate, onChange }: Props) {
  const [saving, setSaving]         = useState(false)
  const [showDate, setShowDate]     = useState(false)
  const [dateVal, setDateVal]       = useState(paidDate ?? '')

  const cfg  = CONFIG[status] ?? CONFIG.draft
  const next = CYCLE[status] ?? 'draft'

  async function cycle() {
    if (next === 'paid') { setShowDate(true); return }
    setSaving(true)
    try {
      await updateInvoiceStatus(invoiceId, next, undefined)
      onChange(next, null)
    } finally {
      setSaving(false)
    }
  }

  async function confirmPaid() {
    setSaving(true)
    try {
      await updateInvoiceStatus(invoiceId, 'paid', dateVal || undefined)
      onChange('paid', dateVal || null)
      setShowDate(false)
    } finally {
      setSaving(false)
    }
  }

  if (showDate) {
    return (
      <div className="flex items-center gap-1">
        <input
          type="date"
          value={dateVal}
          onChange={e => setDateVal(e.target.value)}
          className="text-xs border border-[#E5E7EB] rounded px-1.5 py-0.5 w-28"
          autoFocus
        />
        <button
          onClick={confirmPaid}
          disabled={saving}
          className="text-xs px-2 py-0.5 bg-[#16A34A] text-white rounded hover:bg-[#15803D] transition-colors disabled:opacity-50"
        >
          {saving ? '…' : '✓'}
        </button>
        <button onClick={() => setShowDate(false)} className="text-xs text-[#9CA3AF] hover:text-[#6B7280]">✕</button>
      </div>
    )
  }

  return (
    <button
      onClick={cycle}
      disabled={saving}
      title={`Click to mark as ${next}`}
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold leading-none hover:opacity-80 transition-opacity disabled:opacity-50 ${cfg.cls}`}
    >
      {saving ? '…' : cfg.label}
    </button>
  )
}
