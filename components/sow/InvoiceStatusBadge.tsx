'use client'

import { useState } from 'react'
import type { InvoiceStatus } from '@/types/database'
import { updateInvoiceStatus } from '@/app/actions/invoices'

const CONFIG: Record<InvoiceStatus, { label: string; bg: string; text: string }> = {
  draft:    { label: 'Draft',    bg: 'bg-[#F3F4F6]', text: 'text-[#6B7280]' },
  sent:     { label: 'Sent',     bg: 'bg-[#EFF6FF]', text: 'text-[#2563EB]' },
  paid:     { label: 'Paid',     bg: 'bg-[#F0FDF4]', text: 'text-[#16A34A]' },
  overdue:  { label: 'Overdue',  bg: 'bg-[#FEF2F2]', text: 'text-[#DC2626]' },
}

const CYCLE: Record<InvoiceStatus, InvoiceStatus> = {
  draft: 'sent',
  sent:  'paid',
  paid:  'overdue',
  overdue: 'draft',
}

interface Props {
  invoiceId: string
  status: InvoiceStatus
  paidDate: string | null
  onChange: (status: InvoiceStatus, paidDate: string | null) => void
}

export function InvoiceStatusBadge({ invoiceId, status, paidDate, onChange }: Props) {
  const [saving, setSaving]           = useState(false)
  const [showDateInput, setShowDateInput] = useState(false)
  const [dateVal, setDateVal]         = useState(paidDate ?? '')

  const cfg = CONFIG[status]

  async function cycle() {
    const next = CYCLE[status]
    if (next === 'paid') {
      setShowDateInput(true)
      return
    }
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
      setShowDateInput(false)
    } finally {
      setSaving(false)
    }
  }

  if (showDateInput) {
    return (
      <div className="flex items-center gap-1">
        <input
          type="date"
          value={dateVal}
          onChange={e => setDateVal(e.target.value)}
          className="text-xs border border-[#E5E7EB] rounded px-1.5 py-0.5 w-32"
          autoFocus
        />
        <button
          onClick={confirmPaid}
          disabled={saving}
          className="text-xs px-2 py-0.5 bg-[#16A34A] text-white rounded hover:bg-[#15803D] transition-colors disabled:opacity-50"
        >
          {saving ? '…' : 'Paid'}
        </button>
        <button
          onClick={() => setShowDateInput(false)}
          className="text-xs text-[#9CA3AF] hover:text-[#6B7280]"
        >
          ✕
        </button>
      </div>
    )
  }

  return (
    <button
      onClick={cycle}
      disabled={saving}
      title="Click to advance status"
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.bg} ${cfg.text} hover:opacity-80 transition-opacity disabled:opacity-50`}
    >
      {saving ? '…' : cfg.label}
    </button>
  )
}
