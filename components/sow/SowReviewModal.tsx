'use client'

import { useState } from 'react'
import type { SowDocument, SowDeliverable } from '@/types/database'
import { generateInvoiceSchedule, suggestAmendments } from '@/app/actions/invoices'
import type { Invoice, InvoiceSuggestion } from '@/types/database'

interface Props {
  sow: SowDocument
  hasExistingInvoices: boolean
  onGenerated: (invoices: Invoice[]) => void
  onSuggestions: (suggestions: InvoiceSuggestion[]) => void
  onClose: () => void
}

export function SowReviewModal({ sow, hasExistingInvoices, onGenerated, onSuggestions, onClose }: Props) {
  const [deliverables, setDeliverables] = useState<SowDeliverable[]>(sow.parsed_deliverables ?? [])
  const [loading, setLoading]           = useState(false)
  const [error, setError]               = useState<string | null>(null)

  async function handleGenerate() {
    setError(null)
    setLoading(true)
    try {
      const invoices = await generateInvoiceSchedule(sow.id)
      onGenerated(invoices)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to generate schedule')
    } finally {
      setLoading(false)
    }
  }

  async function handleSuggest() {
    setError(null)
    setLoading(true)
    try {
      const suggestions = await suggestAmendments(sow.id, sow.manual_revenue_item_id)
      onSuggestions(suggestions)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to generate suggestions')
    } finally {
      setLoading(false)
    }
  }

  const totalKSEK = sow.parsed_total_value_sek ? Math.round(sow.parsed_total_value_sek / 1000) : null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-base font-bold text-[#0F0F0F]">Review extracted data</h2>
            <p className="text-xs text-[#9CA3AF] mt-0.5">{sow.file_name}</p>
          </div>
          <button onClick={onClose} className="text-[#9CA3AF] hover:text-[#6B7280]">
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        <div className="space-y-4">
          {/* Read-only summary of parsed fields */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Client" value={sow.parsed_client_name ?? '—'} />
            <Field label="Total value" value={totalKSEK != null ? `${totalKSEK.toLocaleString('sv-SE')} kSEK` : '—'} />
            <Field label="Start date" value={sow.parsed_start_date ?? '—'} />
            <Field label="End date"   value={sow.parsed_end_date   ?? '—'} />
          </div>

          {sow.parsed_payment_terms && (
            <Field label="Payment terms" value={sow.parsed_payment_terms} />
          )}

          {/* Deliverables */}
          {deliverables.length > 0 && (
            <div>
              <label className="block text-xs font-semibold text-[#374151] mb-1.5">
                Deliverables ({deliverables.length})
              </label>
              <div className="space-y-1.5">
                {deliverables.map((d, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs bg-[#F9FAFB] rounded-lg px-3 py-2">
                    <span className="flex-1 text-[#0F0F0F]">{d.label}</span>
                    {d.due_date && <span className="text-[#9CA3AF]">{d.due_date}</span>}
                    <button
                      onClick={() => setDeliverables(ds => ds.filter((_, j) => j !== i))}
                      className="text-[#D1D5DB] hover:text-[#DC2626]"
                    >✕</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {error && <p className="text-xs text-[#DC2626]">{error}</p>}

          {loading && (
            <div className="flex items-center gap-2 p-3 bg-[#F0F9FF] rounded-lg">
              <div className="w-4 h-4 border-2 border-[#61b5cc] border-t-transparent rounded-full animate-spin flex-shrink-0" />
              <p className="text-xs text-[#0F0F0F]">
                {hasExistingInvoices ? 'Claude is analysing changes…' : 'Generating invoice schedule…'}
              </p>
            </div>
          )}
        </div>

        <div className="flex gap-2 mt-6">
          <button
            onClick={onClose}
            disabled={loading}
            className="flex-1 py-2 text-sm font-medium text-[#6B7280] border border-[#E5E7EB] rounded-xl hover:bg-[#F9F9F8] transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          {hasExistingInvoices ? (
            <button
              onClick={handleSuggest}
              disabled={loading}
              className="flex-1 py-2 text-sm font-medium text-white bg-[#0F0F0F] rounded-xl hover:bg-[#374151] transition-colors disabled:opacity-40"
            >
              {loading ? 'Analysing…' : 'Suggest amendments'}
            </button>
          ) : (
            <button
              onClick={handleGenerate}
              disabled={loading}
              className="flex-1 py-2 text-sm font-medium text-white bg-[#0F0F0F] rounded-xl hover:bg-[#374151] transition-colors disabled:opacity-40"
            >
              {loading ? 'Generating…' : 'Generate invoice schedule'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <label className="block text-[10px] font-semibold text-[#9CA3AF] uppercase tracking-wider mb-0.5">{label}</label>
      <p className="text-sm text-[#0F0F0F]">{value}</p>
    </div>
  )
}
