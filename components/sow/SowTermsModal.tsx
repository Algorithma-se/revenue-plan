'use client'

import { useState } from 'react'
import type { SowDocument, SowParsedRaw, InvoicingModel } from '@/types/database'
import { updateSowTerms, createManualSowTerms } from '@/app/actions/sow'

interface TermsFields {
  parsed_total_value_sek: string
  parsed_start_date:      string
  parsed_end_date:        string
  parsed_payment_terms:   string
  invoicing_model:        InvoicingModel | ''
  hourly_rate_sek:        string
  fte_count:              string
  monthly_fee_sek:        string
}

function sowToFields(sow: SowDocument | null): TermsFields {
  const raw = sow?.parsed_raw as SowParsedRaw | null
  return {
    parsed_total_value_sek: sow?.parsed_total_value_sek != null ? String(sow.parsed_total_value_sek) : '',
    parsed_start_date:      sow?.parsed_start_date  ?? '',
    parsed_end_date:        sow?.parsed_end_date    ?? '',
    parsed_payment_terms:   sow?.parsed_payment_terms ?? '',
    invoicing_model:        (raw?.invoicing_model   ?? '') as InvoicingModel | '',
    hourly_rate_sek:        raw?.hourly_rate_sek  != null ? String(Math.round(raw.hourly_rate_sek)) : '',
    fte_count:              raw?.fte_count         != null ? String(raw.fte_count) : '',
    monthly_fee_sek:        raw?.monthly_fee_sek  != null ? String(Math.round(raw.monthly_fee_sek)) : '',
  }
}

const MODEL_OPTIONS: { value: InvoicingModel | ''; label: string }[] = [
  { value: '',                  label: '— Select model —' },
  { value: 'milestone',         label: 'Milestone' },
  { value: 'time_and_materials', label: 'Time & Materials' },
  { value: 'capacity',          label: 'Capacity / Retainer' },
  { value: 'fixed_fee',         label: 'Fixed fee' },
]

interface Props {
  sow:      SowDocument | null   // null = create new manual terms
  allDocs:  SowDocument[]        // all docs for this item, for multi-doc selector
  itemId:   string
  onSaved:  (updated: SowDocument) => void
  onClose:  () => void
}

const inputCls = 'w-full text-sm text-[#0F0F0F] bg-[#F9F9F8] border border-[#EBEBEB] rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#61b5cc] focus:border-transparent transition-all'
const labelCls = 'block text-[10px] font-semibold text-[#9CA3AF] uppercase tracking-wider mb-1'

export function SowTermsModal({ sow: initialSow, allDocs, itemId, onSaved, onClose }: Props) {
  const [activeSow, setActiveSow] = useState<SowDocument | null>(initialSow)
  const [fields, setFields]       = useState<TermsFields>(() => sowToFields(initialSow))
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState<string | null>(null)

  function patch(p: Partial<TermsFields>) {
    setFields(prev => ({ ...prev, ...p }))
  }

  function switchSow(sow: SowDocument) {
    setActiveSow(sow)
    setFields(sowToFields(sow))
    setError(null)
  }

  const showRateFields = fields.invoicing_model === 'time_and_materials' || fields.invoicing_model === 'capacity'
  const showMonthlyFee = fields.invoicing_model === 'capacity' || fields.invoicing_model === 'fixed_fee'

  async function handleSave() {
    setSaving(true)
    setError(null)
    const payload = {
      parsed_total_value_sek: fields.parsed_total_value_sek ? Number(fields.parsed_total_value_sek) : null,
      parsed_start_date:      fields.parsed_start_date || null,
      parsed_end_date:        fields.parsed_end_date   || null,
      parsed_payment_terms:   fields.parsed_payment_terms || null,
      invoicing_model:        fields.invoicing_model || null,
      hourly_rate_sek:        fields.hourly_rate_sek  ? Number(fields.hourly_rate_sek) : null,
      fte_count:              fields.fte_count         ? Number(fields.fte_count) : null,
      monthly_fee_sek:        fields.monthly_fee_sek  ? Number(fields.monthly_fee_sek) : null,
    }

    let result: { data?: SowDocument; error?: string }
    if (activeSow) {
      result = await updateSowTerms(activeSow.id, payload)
    } else {
      result = await createManualSowTerms(itemId, payload)
    }

    setSaving(false)
    if (result.error) {
      setError(result.error)
    } else if (result.data) {
      onSaved(result.data)
    }
  }

  const uploadedDocs = allDocs.filter(d => d.file_type !== 'manual')
  const showDocSelector = allDocs.length > 1

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-[#F3F4F6] flex-shrink-0">
          <div>
            <h2 className="text-base font-bold text-[#0F0F0F]">
              {activeSow ? 'Edit agreement terms' : 'Set agreement terms'}
            </h2>
            <p className="text-xs text-[#9CA3AF] mt-0.5">
              {activeSow
                ? activeSow.file_type === 'manual' ? 'Manual terms' : activeSow.file_name
                : 'No agreement on file — set terms manually'}
            </p>
          </div>
          <button onClick={onClose} className="text-[#9CA3AF] hover:text-[#6B7280]">
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        {/* Agreement selector when multiple docs exist */}
        {showDocSelector && (
          <div className="px-6 py-3 border-b border-[#F3F4F6] flex-shrink-0">
            <p className="text-[10px] font-semibold text-[#9CA3AF] uppercase tracking-wider mb-2">Agreement</p>
            <div className="flex flex-wrap gap-1.5">
              {allDocs.map(doc => (
                <button
                  key={doc.id}
                  onClick={() => switchSow(doc)}
                  className={`px-2.5 py-1 text-xs rounded-lg border font-medium transition-colors ${
                    activeSow?.id === doc.id
                      ? 'bg-[#0F0F0F] text-white border-[#0F0F0F]'
                      : 'border-[#E5E7EB] text-[#374151] hover:border-[#9CA3AF]'
                  }`}
                >
                  {doc.file_type === 'manual' ? 'Manual' : `v${doc.version_number} ${doc.file_name.length > 20 ? doc.file_name.slice(0, 20) + '…' : doc.file_name}`}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Form */}
        <div className="px-6 py-4 space-y-4 overflow-y-auto flex-1">

          {/* Contract value + dates */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={labelCls}>Contract value (SEK)</label>
              <input
                type="number"
                value={fields.parsed_total_value_sek}
                onChange={e => patch({ parsed_total_value_sek: e.target.value })}
                placeholder="0"
                className={`${inputCls} [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none`}
              />
            </div>
            <div>
              <label className={labelCls}>Start date</label>
              <input type="date" value={fields.parsed_start_date} onChange={e => patch({ parsed_start_date: e.target.value })} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>End date</label>
              <input type="date" value={fields.parsed_end_date} onChange={e => patch({ parsed_end_date: e.target.value })} className={inputCls} />
            </div>
          </div>

          {/* Payment terms */}
          <div>
            <label className={labelCls}>Payment terms</label>
            <input
              value={fields.parsed_payment_terms}
              onChange={e => patch({ parsed_payment_terms: e.target.value })}
              placeholder="e.g. Net 30, Net 30 (invoiced on milestone completion)"
              className={inputCls}
            />
          </div>

          {/* Invoicing model */}
          <div>
            <label className={labelCls}>Invoicing model</label>
            <select
              value={fields.invoicing_model}
              onChange={e => patch({ invoicing_model: e.target.value as InvoicingModel | '' })}
              className={inputCls}
            >
              {MODEL_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {/* Rate fields — shown contextually */}
          {(showRateFields || showMonthlyFee) && (
            <div className="grid grid-cols-3 gap-3">
              {showRateFields && (
                <div>
                  <label className={labelCls}>Hourly rate (kr/h)</label>
                  <input
                    type="number"
                    value={fields.hourly_rate_sek}
                    onChange={e => patch({ hourly_rate_sek: e.target.value })}
                    placeholder="0"
                    className={`${inputCls} [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none`}
                  />
                </div>
              )}
              {showRateFields && (
                <div>
                  <label className={labelCls}>FTE count</label>
                  <input
                    type="number"
                    value={fields.fte_count}
                    onChange={e => patch({ fte_count: e.target.value })}
                    placeholder="0"
                    step="0.1"
                    className={`${inputCls} [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none`}
                  />
                </div>
              )}
              {showMonthlyFee && (
                <div>
                  <label className={labelCls}>Monthly fee (SEK/mo)</label>
                  <input
                    type="number"
                    value={fields.monthly_fee_sek}
                    onChange={e => patch({ monthly_fee_sek: e.target.value })}
                    placeholder="0"
                    className={`${inputCls} [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none`}
                  />
                </div>
              )}
            </div>
          )}

          {error && (
            <p className="text-xs text-[#DC2626] bg-[#FFF1F2] border border-[#FECDD3] rounded-xl px-3 py-2">
              {error}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-[#F3F4F6] flex-shrink-0">
          <button onClick={onClose} className="py-2 px-4 text-sm font-medium text-[#6B7280] border border-[#E5E7EB] rounded-xl hover:bg-[#F9F9F8] transition-colors">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="py-2 px-6 text-sm font-medium text-white bg-[#0F0F0F] rounded-xl hover:bg-[#374151] transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save terms'}
          </button>
        </div>
      </div>
    </div>
  )
}
