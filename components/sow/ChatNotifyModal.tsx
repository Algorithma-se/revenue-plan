'use client'

import { useState } from 'react'
import type { InvoiceDraft, Invoice } from '@/types/database'
import { sendGoogleChatNotification } from '@/app/actions/invoices'

interface Props {
  draft:       InvoiceDraft
  saved:       Invoice | null
  clientName:  string | null
  onClose:     () => void
}

function buildMessage(draft: InvoiceDraft, clientName: string | null): string {
  const amount = draft.amount_sek ? `${Math.round(draft.amount_sek / 1000).toLocaleString('sv-SE')} kSEK` : '—'
  const lines: string[] = [
    `🧾 *${draft.invoice_number}*${clientName ? ` — ${clientName}` : ''}`,
    `💰 ${amount}   •   Status: ${draft.status.charAt(0).toUpperCase() + draft.status.slice(1)}`,
  ]
  if (draft.issue_date) lines.push(`📅 Issue date: ${draft.issue_date}`)
  if (draft.due_date)   lines.push(`⏰ Due date: ${draft.due_date}`)
  if (draft.milestone_label) lines.push(`🎯 Milestone: ${draft.milestone_label}`)
  if (draft.notes)      lines.push(`📝 ${draft.notes}`)
  return lines.join('\n')
}

export function ChatNotifyModal({ draft, saved, clientName, onClose }: Props) {
  const [message, setMessage] = useState(() => buildMessage(draft, clientName))
  const [sending, setSending] = useState(false)
  const [sent,    setSent]    = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  async function handleSend() {
    setError(null)
    setSending(true)
    const result = await sendGoogleChatNotification(message)
    setSending(false)
    if (result.error) {
      setError(result.error)
    } else {
      setSent(true)
      setTimeout(onClose, 1200)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">

        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-bold text-[#0F0F0F]">Notify team</h2>
            <p className="text-xs text-[#9CA3AF] mt-0.5">{draft.invoice_number}</p>
          </div>
          <button onClick={onClose} className="text-[#9CA3AF] hover:text-[#6B7280]">
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        <label className="block text-[10px] font-semibold text-[#9CA3AF] uppercase tracking-wider mb-1.5">
          Message
        </label>
        <textarea
          value={message}
          onChange={e => setMessage(e.target.value)}
          rows={7}
          className="w-full text-sm text-[#0F0F0F] bg-[#F9F9F8] border border-[#EBEBEB] rounded-xl px-3 py-2.5 resize-none focus:outline-none focus:ring-2 focus:ring-[#61b5cc] focus:border-transparent transition-all font-mono"
        />

        {error && (
          <p className="text-xs text-[#DC2626] bg-[#FFF1F2] border border-[#FECDD3] rounded-xl px-3 py-2 mt-3">
            {error}
          </p>
        )}

        {sent && (
          <p className="text-xs text-[#16A34A] bg-[#F0FDF4] border border-[#BBF7D0] rounded-xl px-3 py-2 mt-3">
            Sent to Google Chat ✓
          </p>
        )}

        <div className="flex gap-2 mt-4">
          <button
            onClick={onClose}
            className="py-2 px-4 text-sm font-medium text-[#6B7280] border border-[#E5E7EB] rounded-xl hover:bg-[#F9F9F8] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSend}
            disabled={sending || sent || !message.trim()}
            className="flex-1 py-2 text-sm font-medium text-white bg-[#0F0F0F] rounded-xl hover:bg-[#374151] transition-colors disabled:opacity-40 flex items-center justify-center gap-2"
          >
            {sending ? (
              <><div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Sending…</>
            ) : sent ? 'Sent ✓' : (
              <>
                <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                  <path d="M2 5a2 2 0 012-2h7a2 2 0 012 2v4a2 2 0 01-2 2H9l-3 3v-3H4a2 2 0 01-2-2V5z" />
                  <path d="M15 7v2a4 4 0 01-4 4H9.828l-1.766 1.767c.28.149.599.233.938.233h2l3 3v-3h2a2 2 0 002-2V9a2 2 0 00-2-2h-1z" />
                </svg>
                Send to Google Chat
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
