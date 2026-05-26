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
  const [saving, setSaving] = useState(false)

  const cfg  = CONFIG[status] ?? CONFIG.draft
  const next = CYCLE[status] ?? 'draft'

  async function cycle() {
    setSaving(true)
    try {
      await updateInvoiceStatus(invoiceId, next, undefined)
      onChange(next, null)
    } finally {
      setSaving(false)
    }
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
