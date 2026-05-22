'use client'

import { useState } from 'react'
import type { SowDocument, SowDeliverable, SowParsedRaw, Invoice, InvoiceSuggestion } from '@/types/database'
import { generateInvoiceSchedule, suggestAmendments } from '@/app/actions/invoices'
import { updateSowParsedFields } from '@/app/actions/sow'

interface Props {
  sow:                 SowDocument
  hasExistingInvoices: boolean
  onGenerated:         (invoices: Invoice[], updatedSow: SowDocument) => void
  onSuggestions:       (suggestions: InvoiceSuggestion[]) => void
  onClose:             () => void
}

const MODEL_OPTIONS = [
  { value: 'capacity',           label: 'Capacity / retainer' },
  { value: 'time_and_materials', label: 'Time & materials' },
  { value: 'milestone',          label: 'Milestone' },
  { value: 'fixed_fee',          label: 'Fixed fee' },
]

export function SowReviewModal({ sow, hasExistingInvoices, onGenerated, onSuggestions, onClose }: Props) {
  const raw   = sow.parsed_raw as SowParsedRaw | null
  const today = new Date().toISOString().slice(0, 10)

  const [clientName,     setClientName]     = useState(sow.parsed_client_name ?? '')
  const [totalKsek,      setTotalKsek]      = useState(
    sow.parsed_total_value_sek != null ? String(Math.round(sow.parsed_total_value_sek / 1000)) : ''
  )
  const [startDate,      setStartDate]      = useState(sow.parsed_start_date ?? '')
  const [endDate,        setEndDate]        = useState(sow.parsed_end_date ?? '')
  const [paymentTerms,   setPaymentTerms]   = useState(sow.parsed_payment_terms ?? '')
  const [invoicingModel, setInvoicingModel] = useState(raw?.invoicing_model ?? '')
  const [deliverables,   setDeliverables]   = useState<SowDeliverable[]>(sow.parsed_deliverables ?? [])
  const [loading,        setLoading]        = useState(false)
  const [error,          setError]          = useState<string | null>(null)

  const emptyClient       = !clientName.trim()
  const emptyTotal        = !totalKsek || Number(totalKsek) <= 0
  const emptyStartDate    = !startDate
  const emptyPaymentTerms = !paymentTerms.trim()
  const emptyModel        = !invoicingModel
  const startInPast       = !!startDate && startDate < today

  // Only show the amber banner for things that need a sentence of explanation
  const warnings: string[] = []
  if (startInPast) warnings.push(`Start date ${startDate} is in the past — confirm this is correct`)

  async function persist(): Promise<SowDocument | null> {
    const result = await updateSowParsedFields(sow.id, {
      parsed_client_name:     clientName.trim() || null,
      parsed_total_value_sek: totalKsek ? Number(totalKsek) * 1000 : null,
      parsed_start_date:      startDate || null,
      parsed_end_date:        endDate || null,
      parsed_payment_terms:   paymentTerms.trim() || null,
      invoicing_model:        invoicingModel || null,
      parsed_deliverables:    deliverables,
    })
    if (result.error || !result.data) {
      setError(result.error ?? 'Failed to save changes')
      return null
    }
    return result.data
  }

  async function handleGenerate() {
    setError(null)
    setLoading(true)
    const updatedSow = await persist()
    if (!updatedSow) { setLoading(false); return }
    const result = await generateInvoiceSchedule(sow.id)
    setLoading(false)
    if (result.error || !result.data) {
      setError(result.error ?? 'Failed to generate schedule')
    } else {
      onGenerated(result.data, updatedSow)
    }
  }

  async function handleSuggest() {
    setError(null)
    setLoading(true)
    await persist()
    const result = await suggestAmendments(sow.id, sow.manual_revenue_item_id)
    setLoading(false)
    if (result.error || !result.data) {
      setError(result.error ?? 'Failed to generate suggestions')
    } else {
      onSuggestions(result.data)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6">

        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-base font-bold text-[#0F0F0F]">Review & confirm extracted data</h2>
            <p className="text-xs text-[#9CA3AF] mt-0.5">{sow.file_name}</p>
          </div>
          <button onClick={onClose} className="text-[#9CA3AF] hover:text-[#6B7280]">
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        <div className="space-y-4">
          {/* Editable fields */}
          <div className="grid grid-cols-2 gap-3">
            <EditField
              label="Client"
              value={clientName}
              onChange={setClientName}
              placeholder="Client name"
              highlight={emptyClient ? 'error' : undefined}
            />
            <EditField
              label="Total value (kSEK)"
              value={totalKsek}
              onChange={setTotalKsek}
              type="number"
              placeholder="e.g. 1 048"
              highlight={emptyTotal ? 'error' : undefined}
            />
            <EditField
              label="Start date"
              value={startDate}
              onChange={setStartDate}
              type="date"
              highlight={emptyStartDate ? 'error' : startInPast ? 'warn' : undefined}
            />
            <EditField label="End date" value={endDate} onChange={setEndDate} type="date" />
            <EditField
              label="Payment terms"
              value={paymentTerms}
              onChange={setPaymentTerms}
              placeholder="e.g. Net 30"
              highlight={emptyPaymentTerms ? 'error' : undefined}
            />
            <div>
              <label className="block text-[10px] font-semibold text-[#9CA3AF] uppercase tracking-wider mb-1">
                Invoicing model
              </label>
              <select
                value={invoicingModel}
                onChange={e => setInvoicingModel(e.target.value)}
                className={`w-full bg-[#F9F9F8] border rounded-lg px-2.5 py-1.5 text-sm text-[#0F0F0F] focus:outline-none focus:ring-2 focus:border-transparent transition-all ${
                  emptyModel
                    ? 'border-[#FCA5A5] focus:ring-[#EF4444]'
                    : 'border-[#EBEBEB] focus:ring-[#61b5cc]'
                }`}
              >
                <option value="">— unknown —</option>
                {MODEL_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Warnings — only for things needing explanation, not just empty fields */}
          {warnings.length > 0 && (
            <div className="space-y-1.5">
              {warnings.map((w, i) => (
                <div key={i} className="flex items-start gap-2 px-3 py-2 bg-[#FFFBEB] border border-[#FDE68A] rounded-xl">
                  <span className="text-[#D97706] text-xs mt-0.5 flex-shrink-0">⚠</span>
                  <p className="text-xs text-[#92400E]">{w}</p>
                </div>
              ))}
            </div>
          )}

          {/* Deliverables / billing periods */}
          {deliverables.length > 0 && (
            <div>
              <label className="block text-xs font-semibold text-[#374151] mb-1.5">
                Billing periods / deliverables ({deliverables.length})
              </label>
              <div className="space-y-1.5">
                {deliverables.map((d, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs bg-[#F9FAFB] rounded-lg px-3 py-2">
                    <span className="flex-1 text-[#0F0F0F]">{d.label}</span>
                    {(d.invoice_date || d.due_date) && (
                      <span className="text-[#9CA3AF] flex-shrink-0">{d.invoice_date ?? d.due_date}</span>
                    )}
                    <button
                      onClick={() => setDeliverables(ds => ds.filter((_, j) => j !== i))}
                      className="text-[#D1D5DB] hover:text-[#DC2626] flex-shrink-0"
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

interface EditFieldProps {
  label:       string
  value:       string
  onChange:    (v: string) => void
  type?:       'text' | 'number' | 'date'
  placeholder?: string
  highlight?:  'warn' | 'error'
}

function EditField({ label, value, onChange, type = 'text', placeholder, highlight }: EditFieldProps) {
  const borderClass = highlight === 'error'
    ? 'border-[#FCA5A5] focus:ring-[#EF4444]'
    : highlight === 'warn'
    ? 'border-[#FDE68A] focus:ring-[#F59E0B]'
    : 'border-[#EBEBEB] focus:ring-[#61b5cc]'
  return (
    <div>
      <label className="block text-[10px] font-semibold text-[#9CA3AF] uppercase tracking-wider mb-1">
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full bg-[#F9F9F8] border rounded-lg px-2.5 py-1.5 text-sm text-[#0F0F0F] focus:outline-none focus:ring-2 focus:border-transparent transition-all ${borderClass}`}
      />
    </div>
  )
}
