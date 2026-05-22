'use client'

import { useState } from 'react'
import type { InvoiceSuggestion, InvoiceDraft } from '@/types/database'

interface Props {
  suggestions: InvoiceSuggestion[]
  onApply:     (accepted: InvoiceSuggestion[]) => void
  onClose:     () => void
}

const ACTION_CONFIG = {
  add:    { label: 'Add',    bg: 'bg-[#F0FDF4]', text: 'text-[#16A34A]', border: 'border-[#BBF7D0]' },
  modify: { label: 'Modify', bg: 'bg-[#EFF6FF]', text: 'text-[#2563EB]', border: 'border-[#BFDBFE]' },
  remove: { label: 'Remove', bg: 'bg-[#FEF2F2]', text: 'text-[#DC2626]', border: 'border-[#FECACA]' },
}

export function AmendmentSuggestionsModal({ suggestions, onApply, onClose }: Props) {
  const [accepted, setAccepted] = useState<Set<number>>(() => new Set(suggestions.map((_, i) => i)))

  function toggle(i: number) {
    setAccepted(s => {
      const next = new Set(s)
      if (next.has(i)) next.delete(i); else next.add(i)
      return next
    })
  }

  function apply() {
    onApply(suggestions.filter((_, i) => accepted.has(i)))
  }

  if (suggestions.length === 0) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 text-center">
          <p className="text-sm text-[#6B7280] mb-4">No changes suggested — the existing invoice schedule already matches the new document.</p>
          <button onClick={onClose} className="px-6 py-2 text-sm font-medium text-white bg-[#0F0F0F] rounded-xl">Close</button>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-base font-bold text-[#0F0F0F]">Suggested amendments</h2>
            <p className="text-xs text-[#9CA3AF] mt-0.5">Select the changes you want to apply</p>
          </div>
          <button onClick={onClose} className="text-[#9CA3AF] hover:text-[#6B7280]">
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        <div className="space-y-3">
          {suggestions.map((s, i) => {
            const cfg     = ACTION_CONFIG[s.action]
            const checked = accepted.has(i)
            return (
              <div
                key={i}
                onClick={() => toggle(i)}
                className={`flex gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                  checked ? `${cfg.bg} ${cfg.border}` : 'border-[#E5E7EB] opacity-50'
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(i)}
                  onClick={e => e.stopPropagation()}
                  className="mt-0.5 flex-shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${cfg.bg} ${cfg.text}`}>
                      {cfg.label}
                    </span>
                    <span className="text-xs font-medium text-[#0F0F0F]">{s.draft.invoice_number}</span>
                    {s.draft.amount_sek > 0 && (
                      <span className="text-xs text-[#6B7280]">
                        {Math.round(s.draft.amount_sek / 1000).toLocaleString('sv-SE')} kSEK
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[#374151]">{s.reason}</p>
                  {s.draft.due_date && (
                    <p className="text-[10px] text-[#9CA3AF] mt-0.5">Due {s.draft.due_date}</p>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        <div className="flex gap-2 mt-5">
          <button
            onClick={onClose}
            className="flex-1 py-2 text-sm font-medium text-[#6B7280] border border-[#E5E7EB] rounded-xl hover:bg-[#F9F9F8] transition-colors"
          >
            Discard all
          </button>
          <button
            onClick={apply}
            className="flex-1 py-2 text-sm font-medium text-white bg-[#0F0F0F] rounded-xl hover:bg-[#374151] transition-colors"
          >
            Apply {accepted.size} of {suggestions.length}
          </button>
        </div>
      </div>
    </div>
  )
}
