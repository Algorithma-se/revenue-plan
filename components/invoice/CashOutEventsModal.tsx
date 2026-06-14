'use client'

import { useRef, useState } from 'react'
import { upsertCashOutEvent, deleteCashOutEvent } from '@/app/actions/cash'
import type { CashOutEvent } from '@/app/actions/cash'

interface Props {
  month:       string       // YYYY-MM-01
  plEstimate:  number       // from costsByMonth, SEK
  events:      CashOutEvent[]
  onSaved:     (events: CashOutEvent[]) => void
  onClose:     () => void
}

function monthLabel(iso: string) {
  return new Date(iso + 'T12:00:00').toLocaleString('en-SE', { month: 'long', year: 'numeric' })
}

function monthBounds(month: string): { min: string; max: string } {
  const [y, m] = month.slice(0, 7).split('-').map(Number)
  const lastDay = new Date(y, m, 0).getDate()
  return {
    min: `${month.slice(0, 7)}-01`,
    max: `${month.slice(0, 7)}-${String(lastDay).padStart(2, '0')}`,
  }
}

export function CashOutEventsModal({ month, plEstimate, events: initialEvents, onSaved, onClose }: Props) {
  const [events,   setEvents]   = useState<CashOutEvent[]>(initialEvents)
  const [date,     setDate]     = useState(monthBounds(month).min)
  const [label,    setLabel]    = useState('')
  const [amount,   setAmount]   = useState('')
  const [saving,   setSaving]   = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const labelRef = useRef<HTMLInputElement>(null)

  const { min, max } = monthBounds(month)

  async function handleAdd() {
    const amt = parseFloat(amount.replace(',', '.'))
    if (!label.trim() || isNaN(amt) || amt <= 0) return
    setSaving(true)
    try {
      const row = await upsertCashOutEvent({
        date,
        label: label.trim(),
        amount_sek: Math.round(amt * 1000),
      })
      const next = [...events, row].sort((a, b) => a.date.localeCompare(b.date))
      setEvents(next)
      onSaved(next)
      setLabel('')
      setAmount('')
      labelRef.current?.focus()
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    setDeleting(id)
    try {
      await deleteCashOutEvent(id)
      const next = events.filter(e => e.id !== id)
      setEvents(next)
      onSaved(next)
    } finally {
      setDeleting(null)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#F3F4F6]">
          <div>
            <h2 className="text-sm font-bold text-[#0F0F0F]">Cash events — {monthLabel(month)}</h2>
            <p className="text-[10px] text-[#9CA3AF] mt-0.5">Actual cash outflows for this month</p>
          </div>
          <button onClick={onClose} className="text-[#9CA3AF] hover:text-[#6B7280] transition-colors">
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        {/* P&L reference */}
        <div className="mx-6 mt-4 px-3 py-2 bg-[#FFFBEB] border border-[#FDE68A] rounded-xl">
          <p className="text-[11px] text-[#92400E]">
            P&L plan this month: ~{Math.round(plEstimate / 1000).toLocaleString('sv-SE')} kSEK (accrual estimate)
          </p>
        </div>

        {/* Event list */}
        <div className="px-6 mt-4 space-y-1.5 max-h-56 overflow-y-auto">
          {events.length === 0 ? (
            <p className="text-xs text-[#9CA3AF] italic py-2">No cash events yet for this month.</p>
          ) : (
            events.map(e => (
              <div key={e.id} className="flex items-center gap-2 px-3 py-2 bg-[#F9F9F8] rounded-xl">
                <span className="text-[11px] text-[#9CA3AF] w-16 flex-shrink-0 tabular-nums">{e.date.slice(5)}</span>
                <span className="flex-1 text-xs text-[#374151] truncate">{e.label}</span>
                <span className="text-xs font-medium text-[#DC2626] flex-shrink-0">
                  −{Math.round(e.amount_sek / 1000).toLocaleString('sv-SE')} kSEK
                </span>
                <button
                  onClick={() => handleDelete(e.id)}
                  disabled={deleting === e.id}
                  className="text-[#D1D5DB] hover:text-[#DC2626] transition-colors flex-shrink-0 disabled:opacity-40"
                >
                  {deleting === e.id ? (
                    <div className="w-3.5 h-3.5 border border-[#DC2626] border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                      <path d="M5.5 5.5A.5.5 0 016 6v6a.5.5 0 01-1 0V6a.5.5 0 01.5-.5zm2.5 0a.5.5 0 01.5.5v6a.5.5 0 01-1 0V6a.5.5 0 01.5-.5zm3 .5a.5.5 0 00-1 0v6a.5.5 0 001 0V6z"/>
                      <path fillRule="evenodd" d="M14.5 3a1 1 0 01-1 1H13v9a2 2 0 01-2 2H5a2 2 0 01-2-2V4h-.5a1 1 0 010-2h4a1 1 0 011-1h2a1 1 0 011 1h4a1 1 0 011 1zM4.118 4L4 4.059V13a1 1 0 001 1h6a1 1 0 001-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z" clipRule="evenodd"/>
                    </svg>
                  )}
                </button>
              </div>
            ))
          )}
        </div>

        {/* Add form */}
        <div className="px-6 py-4 mt-2 border-t border-[#F3F4F6]">
          <p className="text-[10px] font-semibold text-[#9CA3AF] uppercase tracking-wider mb-2">Add event</p>
          <div className="flex gap-2 mb-2">
            <input
              type="date"
              value={date}
              min={min}
              max={max}
              onChange={e => setDate(e.target.value)}
              className="w-36 text-xs px-2.5 py-1.5 border border-[#E5E7EB] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#61b5cc] focus:border-transparent"
            />
            <input
              ref={labelRef}
              type="text"
              value={label}
              onChange={e => setLabel(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAdd()}
              placeholder="Label (e.g. Salaries)"
              className="flex-1 text-xs px-2.5 py-1.5 border border-[#E5E7EB] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#61b5cc] focus:border-transparent"
            />
          </div>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                type="number"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAdd()}
                placeholder="Amount"
                min="0"
                step="1"
                className="w-full text-xs px-2.5 py-1.5 pr-10 border border-[#E5E7EB] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#61b5cc] focus:border-transparent"
              />
              <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-[#9CA3AF]">kSEK</span>
            </div>
            <button
              onClick={handleAdd}
              disabled={saving || !label.trim() || !amount}
              className="px-4 py-1.5 text-xs font-medium text-white bg-[#0F0F0F] rounded-lg hover:bg-[#374151] transition-colors disabled:opacity-40"
            >
              {saving ? (
                <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : 'Add'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
