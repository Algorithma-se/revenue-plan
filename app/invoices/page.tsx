'use client'

import { Suspense, useCallback, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import type {
  SowDocument, Invoice, InvoiceDraft, InvoiceSuggestion, InvoiceStatus, SowParsedRaw,
} from '@/types/database'
import { getInvoices, getAllInvoiceItems, saveInvoices, getAggregatedCashFlow } from '@/app/actions/invoices'
import { getSowDocuments, getSowDownloadUrl, deleteSow } from '@/app/actions/sow'
import { InvoiceTable } from '@/components/sow/InvoiceTable'
import { SowUploadModal } from '@/components/sow/SowUploadModal'
import { SowReviewModal } from '@/components/sow/SowReviewModal'
import { AmendmentSuggestionsModal } from '@/components/sow/AmendmentSuggestionsModal'
import { SowCashFlowChart } from '@/components/sow/SowCashFlowChart'
import { useFeatureFlags } from '@/components/FeatureFlagsProvider'

interface SidebarItem {
  itemId:       string
  clientName:   string | null
  project:      string | null
  podId:        string | null
  invoiceCount: number
  hasSow:       boolean
}

const DOC_TYPE_LABEL = { original: 'Original', amendment: 'Amendment', change_request: 'CR' }
const DOC_TYPE_COLOR = {
  original:       'bg-[#F0F9FF] text-[#0369A1]',
  amendment:      'bg-[#FFFBEB] text-[#B45309]',
  change_request: 'bg-[#FEF2F2] text-[#DC2626]',
}
const PARSE_STATUS_ICON: Record<string, string> = {
  done: '✓', parsing: '…', pending: '·', error: '!',
}

function getRollingMonths(): string[] {
  const months: string[] = []
  const now = new Date()
  for (let i = -12; i <= 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1)
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    months.push(`${y}-${m}-01`)
  }
  return months
}

const ROLLING_MONTHS = getRollingMonths()

function useOverdueCheck(invoices: Invoice[]) {
  const today = new Date().toISOString().slice(0, 10)
  return invoices.filter(i => i.status === 'sent' && i.due_date < today)
}

function InvoicesContent() {
  const router       = useRouter()
  const searchParams = useSearchParams()

  const [sidebarItems, setSidebarItems] = useState<SidebarItem[]>([])
  const [selectedId, setSelectedId]     = useState<string | null>(null)
  const [sowDocs, setSowDocs]           = useState<SowDocument[]>([])
  const [invoices, setInvoices]         = useState<Invoice[]>([])
  const [drafts, setDrafts]             = useState<InvoiceDraft[]>([])
  const [loadingMain, setLoadingMain]   = useState(false)
  const [saving, setSaving]             = useState(false)
  const [saveMsg, setSaveMsg]           = useState<string | null>(null)
  const [docHistoryOpen, setDocHistoryOpen] = useState(true)
  const [podNames, setPodNames]         = useState<Map<string, string>>(new Map())
  const [selectedPodId, setSelectedPodId] = useState<string | null>(null)
  const [aggregateOpen, setAggregateOpen] = useState(true)
  const [aggData, setAggData]           = useState<{
    planByMonth: Record<string, number>
    invoicedByMonth: Record<string, number>
    expectedByMonth: Record<string, number>
  } | null>(null)

  // Modals
  const [showUpload, setShowUpload]   = useState(false)
  const [reviewSow, setReviewSow]     = useState<SowDocument | null>(null)
  const [suggestions, setSuggestions] = useState<InvoiceSuggestion[] | null>(null)

  const { invoicesEnabled } = useFeatureFlags()

  const loadSidebar = useCallback(async () => {
    const [items, { data: pods }] = await Promise.all([
      getAllInvoiceItems(),
      supabase.from('pods').select('id, name'),
    ])
    setSidebarItems(items)
    setPodNames(new Map((pods ?? []).map((p: { id: string; name: string }) => [p.id, p.name])))
  }, [])

  const loadAggregate = useCallback(async () => {
    try {
      const data = await getAggregatedCashFlow()
      setAggData(data)
    } catch {
      setAggData({ planByMonth: {}, invoicedByMonth: {}, expectedByMonth: {} })
    }
  }, [])

  useEffect(() => {
    loadSidebar()
    loadAggregate()
  }, [loadSidebar, loadAggregate])

  useEffect(() => {
    const itemFromUrl = searchParams.get('item')
    if (itemFromUrl) setSelectedId(itemFromUrl)
  }, [searchParams])

  useEffect(() => {
    if (!selectedId) return
    router.replace(`/invoices?item=${selectedId}`, { scroll: false })
    setLoadingMain(true)
    Promise.all([
      getSowDocuments(selectedId),
      getInvoices(selectedId),
    ]).then(([docs, invs]) => {
      setSowDocs(docs)
      setInvoices(invs)
      setDrafts(invoicesToDrafts(invs))
    }).finally(() => setLoadingMain(false))
  }, [selectedId, router])

  const [planCells, setPlanCells] = useState<Record<string, number>>({})
  useEffect(() => {
    if (!selectedId) return
    supabase
      .from('plan_revenue_cells')
      .select('month, amount')
      .eq('manual_revenue_item_id', selectedId)
      .then(({ data }) => {
        const map: Record<string, number> = {}
        for (const row of (data ?? [])) map[row.month] = (map[row.month] ?? 0) + row.amount
        setPlanCells(map)
      })
  }, [selectedId])

  const overdueInvoices = useOverdueCheck(invoices)

  function invoicesToDrafts(invs: Invoice[]): InvoiceDraft[] {
    return invs.map(i => ({
      id:              i.id,
      invoice_number:  i.invoice_number,
      issue_date:      i.issue_date,
      due_date:        i.due_date,
      amount_sek:      i.amount_sek,
      payment_trigger: i.payment_trigger,
      milestone_label: i.milestone_label ?? '',
      status:          i.status,
      notes:           i.notes ?? '',
    }))
  }

  async function handleSave() {
    if (!selectedId) return
    setSaving(true)
    setSaveMsg(null)
    try {
      const latestSow = sowDocs[sowDocs.length - 1] ?? null
      const saved     = await saveInvoices(selectedId, drafts, latestSow?.id ?? null)
      setInvoices(saved)
      setDrafts(invoicesToDrafts(saved))
      setSaveMsg('Saved')
      setTimeout(() => setSaveMsg(null), 2000)
      loadSidebar()
      loadAggregate()
    } catch (e) {
      setSaveMsg(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  function handleStatusChange(invoiceId: string, status: InvoiceStatus, paidDate: string | null) {
    setInvoices(ivs => ivs.map(i => i.id === invoiceId ? { ...i, status, paid_date: paidDate } : i))
    setDrafts(ds => ds.map(d => d.id === invoiceId ? { ...d, status } : d))
  }

  async function handleDeleteSow(sowId: string) {
    const linked = invoices.filter(i => i.sow_document_id === sowId)
    const msg = linked.length > 0
      ? `Delete this SOW and the ${linked.length} invoice${linked.length > 1 ? 's' : ''} generated from it?`
      : 'Delete this SOW document?'
    if (!confirm(msg)) return

    const alsoInvoices = linked.length > 0
    await deleteSow(sowId, alsoInvoices)
    setSowDocs(ds => ds.filter(d => d.id !== sowId))
    if (alsoInvoices) {
      const remaining = invoices.filter(i => i.sow_document_id !== sowId)
      setInvoices(remaining)
      setDrafts(invoicesToDrafts(remaining))
    }
    loadSidebar()
    loadAggregate()
  }

  async function handleDownload(storagePath: string) {
    try {
      const url = await getSowDownloadUrl(storagePath)
      window.open(url, '_blank')
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Download failed')
    }
  }

  function handleParsed(sow: SowDocument) {
    setSowDocs(ds => [...ds, sow])
    setShowUpload(false)
    setReviewSow(sow)
    loadSidebar()
  }

  function handleGenerated(newInvoices: Invoice[], updatedSow: SowDocument) {
    setSowDocs(ds => ds.map(d => d.id === updatedSow.id ? updatedSow : d))
    setInvoices(prev => {
      const merged = [...prev, ...newInvoices]
      setDrafts(invoicesToDrafts(merged))
      return merged
    })
    setReviewSow(null)
    loadAggregate()
  }

  function handleSuggestions(sug: InvoiceSuggestion[]) {
    setReviewSow(null)
    setSuggestions(sug)
  }

  function applyAmendments(accepted: InvoiceSuggestion[]) {
    setDrafts(prev => {
      let next = [...prev]
      for (const s of accepted) {
        if (s.action === 'add') {
          next.push({ ...s.draft, id: undefined })
        } else if (s.action === 'modify' && s.invoice_id) {
          next = next.map(d => d.id === s.invoice_id ? { ...d, ...s.draft } : d)
        } else if (s.action === 'remove' && s.invoice_id) {
          next = next.filter(d => d.id !== s.invoice_id)
        }
      }
      return next
    })
    setSuggestions(null)
  }

  const latestSow = sowDocs[sowDocs.length - 1] ?? null
  const contractValueSek = latestSow?.parsed_total_value_sek != null
    ? Number(latestSow.parsed_total_value_sek) : null
  const latestRaw = latestSow?.parsed_raw as SowParsedRaw | null

  // Derive Invoice-shaped objects from current drafts so the per-item chart
  // reflects deletions/edits immediately without requiring Save first.
  const chartInvoices: Invoice[] = drafts
    .filter(d => d.issue_date && d.amount_sek > 0)
    .map((d, i) => {
      const saved = invoices.find(inv => inv.id === d.id)
      return {
        id:                     d.id ?? `draft-${i}`,
        manual_revenue_item_id: selectedId ?? '',
        sow_document_id:        saved?.sow_document_id ?? null,
        invoice_number:         d.invoice_number,
        issue_date:             d.issue_date,
        due_date:               d.due_date,
        amount_sek:             d.amount_sek,
        payment_trigger:        d.payment_trigger,
        milestone_label:        d.milestone_label || null,
        status:                 d.status,
        paid_date:              saved?.paid_date ?? null,
        notes:                  d.notes || null,
        sort:                   i,
        created_at:             '',
        updated_at:             '',
      }
    })

  const MODEL_LABEL: Record<string, string> = {
    milestone: 'Milestone', time_and_materials: 'T&M',
    capacity: 'Capacity', fixed_fee: 'Fixed fee',
  }

  function fmtMonth(iso: string | null) {
    if (!iso) return null
    const d = new Date(iso + 'T12:00:00')
    return d.toLocaleString('en-SE', { month: 'short', year: 'numeric' })
  }

  // Unique pods that have items
  const pods = Array.from(new Set(sidebarItems.map(i => i.podId)))
    .map(id => ({ id, name: id ? (podNames.get(id) ?? id) : 'No pod' }))
    .sort((a, b) => a.name.localeCompare(b.name))

  // Filtered items for the client dropdown
  const filteredItems = selectedPodId
    ? sidebarItems.filter(i => i.podId === selectedPodId)
    : sidebarItems

  const selectedItem = sidebarItems.find(i => i.itemId === selectedId) ?? null

  if (!invoicesEnabled) {
    return (
      <div className="max-w-xl mx-auto py-20 text-center">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-10 h-10 mx-auto text-[#D1D5DB] mb-4">
          <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
        </svg>
        <h2 className="text-lg font-semibold text-[#0F0F0F] mb-1">Invoices not available</h2>
        <p className="text-sm text-[#6B7280]">This feature is currently disabled. An admin can enable it from the Access Management page.</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#F9F9F8]">
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-5">

        {/* ── Title + filter bar ──────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="mr-2">
            <h1 className="text-xl font-bold text-[#0F0F0F] tracking-tight">Invoices</h1>
          </div>

          {/* Pod filter chips */}
          {pods.length > 1 && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                onClick={() => { setSelectedPodId(null) }}
                className={`px-3 py-1 text-xs rounded-full border font-medium transition-colors ${
                  selectedPodId === null
                    ? 'bg-[#0F0F0F] text-white border-[#0F0F0F]'
                    : 'border-[#E5E7EB] text-[#374151] hover:border-[#9CA3AF]'
                }`}
              >
                All pods
              </button>
              {pods.map(p => (
                <button
                  key={p.id ?? 'none'}
                  onClick={() => setSelectedPodId(p.id)}
                  className={`px-3 py-1 text-xs rounded-full border font-medium transition-colors ${
                    selectedPodId === p.id
                      ? 'bg-[#0F0F0F] text-white border-[#0F0F0F]'
                      : 'border-[#E5E7EB] text-[#374151] hover:border-[#9CA3AF]'
                  }`}
                >
                  {p.name}
                </button>
              ))}
            </div>
          )}

          {/* Client selector */}
          <div className="ml-auto">
            <select
              value={selectedId ?? ''}
              onChange={e => setSelectedId(e.target.value || null)}
              className="bg-[#F9F9F8] border border-[#EBEBEB] rounded-lg px-3 py-1.5 text-sm text-[#0F0F0F] focus:outline-none focus:ring-2 focus:ring-[#61b5cc] focus:border-transparent transition-all min-w-[200px]"
            >
              <option value="">— Select client —</option>
              {(() => {
                const byClient = new Map<string, typeof filteredItems>()
                for (const item of filteredItems) {
                  const key = item.clientName ?? '(no name)'
                  byClient.set(key, [...(byClient.get(key) ?? []), item])
                }
                return Array.from(byClient.entries()).map(([clientName, items]) =>
                  items.length === 1 ? (
                    <option key={items[0].itemId} value={items[0].itemId}>
                      {clientName}
                      {items[0].hasSow ? ' ·SOW' : ''}
                      {items[0].invoiceCount > 0 ? ` · ${items[0].invoiceCount} inv` : ''}
                    </option>
                  ) : (
                    <optgroup key={clientName} label={clientName}>
                      {items.map(item => (
                        <option key={item.itemId} value={item.itemId}>
                          {item.project ?? clientName}
                          {item.hasSow ? ' ·SOW' : ''}
                          {item.invoiceCount > 0 ? ` · ${item.invoiceCount} inv` : ''}
                        </option>
                      ))}
                    </optgroup>
                  )
                )
              })()}
            </select>
          </div>
        </div>

        {/* ── Aggregate cash flow (R12, collapsible) ──────────────────────── */}
        <div className="bg-white rounded-2xl border border-[#E5E7EB] overflow-hidden shadow-sm">
          <button
            onClick={() => setAggregateOpen(o => !o)}
            className="w-full flex items-center justify-between px-5 py-3 bg-[#F8FAFC] border-b border-[#E5E7EB] hover:bg-[#F1F5F9] transition-colors"
          >
            <span className="text-[10px] font-bold text-[#64748B] uppercase tracking-widest">
              Total cash flow — all clients (R12)
            </span>
            <svg viewBox="0 0 16 16" fill="currentColor" className={`w-3 h-3 text-[#9CA3AF] transition-transform ${aggregateOpen ? '' : '-rotate-90'}`}>
              <path fillRule="evenodd" d="M1.646 4.646a.5.5 0 01.708 0L8 10.293l5.646-5.647a.5.5 0 01.708.708l-6 6a.5.5 0 01-.708 0l-6-6a.5.5 0 010-.708z" clipRule="evenodd" />
            </svg>
          </button>
          {aggregateOpen && (
            <div className="p-5">
              {aggData ? (
                <SowCashFlowChart
                  planCells={aggData.planByMonth}
                  invoicedByMonth={aggData.invoicedByMonth}
                  expectedByMonth={aggData.expectedByMonth}
                  months={ROLLING_MONTHS}
                />
              ) : (
                <div className="h-[200px] flex items-center justify-center">
                  <div className="w-5 h-5 border-2 border-[#61b5cc] border-t-transparent rounded-full animate-spin" />
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Client detail panel ─────────────────────────────────────────── */}
        {selectedId && (
          <div className="space-y-5">
            {loadingMain ? (
              <div className="bg-white rounded-2xl border border-[#E5E7EB] p-8 shadow-sm">
                <div className="space-y-3">
                  {[80, 60, 90, 50].map((w, i) => (
                    <div key={i} className="h-4 bg-[#F3F4F6] rounded animate-pulse" style={{ width: `${w}%` }} />
                  ))}
                </div>
              </div>
            ) : (
              <>
                {/* Client header */}
                {selectedItem && (
                  <div className="bg-white rounded-2xl border border-[#E5E7EB] shadow-sm overflow-hidden">
                    {/* Main row */}
                    <div className="flex items-center gap-3 px-5 pt-4 pb-3">
                      <div className="w-9 h-9 rounded-xl bg-[#0F0F0F] flex items-center justify-center flex-shrink-0">
                        <span className="text-sm font-bold text-white">
                          {(selectedItem.clientName ?? '?')[0].toUpperCase()}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <h2 className="text-base font-bold text-[#0F0F0F] truncate">
                          {selectedItem.clientName ?? '(no name)'}
                        </h2>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {selectedItem.project && (
                            <span className="text-xs text-[#6B7280]">{selectedItem.project}</span>
                          )}
                          {selectedItem.project && selectedItem.podId && podNames.get(selectedItem.podId) && (
                            <span className="text-[#D1D5DB] text-xs">·</span>
                          )}
                          {selectedItem.podId && podNames.get(selectedItem.podId) && (
                            <span className="text-xs text-[#9CA3AF]">{podNames.get(selectedItem.podId)}</span>
                          )}
                        </div>
                      </div>
                      {contractValueSek != null && (
                        <div className="ml-auto text-right flex-shrink-0">
                          <p className="text-[10px] text-[#9CA3AF] uppercase tracking-wider font-semibold">Contract value</p>
                          <p className="text-sm font-bold text-[#0F0F0F]">
                            {Math.round(contractValueSek / 1000).toLocaleString('sv-SE')} kSEK
                          </p>
                        </div>
                      )}
                      <button
                        onClick={() => setSelectedId(null)}
                        className="ml-3 text-[#9CA3AF] hover:text-[#374151] flex-shrink-0"
                        title="Close"
                      >
                        <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                          <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                        </svg>
                      </button>
                    </div>

                    {/* SOW metadata chips */}
                    {latestSow && (latestSow.parsed_start_date || latestSow.parsed_payment_terms || latestRaw?.invoicing_model) && (
                      <div className="flex flex-wrap items-center gap-1.5 px-5 pb-4">
                        {latestSow.parsed_start_date && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded-full bg-[#F3F4F6] text-[#374151]">
                            {fmtMonth(latestSow.parsed_start_date)}
                            {latestSow.parsed_end_date && <> → {fmtMonth(latestSow.parsed_end_date)}</>}
                          </span>
                        )}
                        {latestSow.parsed_payment_terms && (
                          <span className="inline-flex items-center px-2 py-0.5 text-[11px] font-medium rounded-full bg-[#F3F4F6] text-[#374151]">
                            {latestSow.parsed_payment_terms}
                          </span>
                        )}
                        {latestRaw?.invoicing_model && (
                          <span className="inline-flex items-center px-2 py-0.5 text-[11px] font-medium rounded-full bg-[#EFF6FF] text-[#1D4ED8]">
                            {MODEL_LABEL[latestRaw.invoicing_model] ?? latestRaw.invoicing_model}
                          </span>
                        )}
                        {latestRaw?.hourly_rate_sek && (
                          <span className="inline-flex items-center px-2 py-0.5 text-[11px] font-medium rounded-full bg-[#F3F4F6] text-[#374151]">
                            {Math.round(latestRaw.hourly_rate_sek).toLocaleString('sv-SE')} kr/h
                          </span>
                        )}
                        {latestRaw?.fte_count && (
                          <span className="inline-flex items-center px-2 py-0.5 text-[11px] font-medium rounded-full bg-[#F3F4F6] text-[#374151]">
                            {latestRaw.fte_count} FTE
                          </span>
                        )}
                        {latestRaw?.monthly_fee_sek && (
                          <span className="inline-flex items-center px-2 py-0.5 text-[11px] font-medium rounded-full bg-[#F3F4F6] text-[#374151]">
                            {Math.round(latestRaw.monthly_fee_sek / 1000).toLocaleString('sv-SE')} kSEK/mo
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Overdue alert */}
                {overdueInvoices.length > 0 && (
                  <div className="flex items-center gap-2 bg-[#FEF2F2] border border-[#FECACA] rounded-xl px-4 py-3">
                    <span className="text-[#DC2626] text-sm font-medium">
                      {overdueInvoices.length} overdue invoice{overdueInvoices.length > 1 ? 's' : ''} — update status when payment is received
                    </span>
                  </div>
                )}

                {/* Document History */}
                <div className="bg-white rounded-2xl border border-[#E5E7EB] overflow-hidden shadow-sm">
                  <button
                    onClick={() => setDocHistoryOpen(o => !o)}
                    className="w-full flex items-center justify-between px-5 py-3 bg-[#F8FAFC] border-b border-[#E5E7EB] hover:bg-[#F1F5F9] transition-colors"
                  >
                    <span className="text-[10px] font-bold text-[#64748B] uppercase tracking-widest">Document history ({sowDocs.length})</span>
                    <svg viewBox="0 0 16 16" fill="currentColor" className={`w-3 h-3 text-[#9CA3AF] transition-transform ${docHistoryOpen ? '' : '-rotate-90'}`}>
                      <path fillRule="evenodd" d="M1.646 4.646a.5.5 0 01.708 0L8 10.293l5.646-5.647a.5.5 0 01.708.708l-6 6a.5.5 0 01-.708 0l-6-6a.5.5 0 010-.708z" clipRule="evenodd" />
                    </svg>
                  </button>
                  {docHistoryOpen && (
                    <div className="p-5">
                      {sowDocs.length === 0 ? (
                        <p className="text-xs text-[#9CA3AF] mb-3">No documents uploaded yet.</p>
                      ) : (
                        <div className="space-y-2 mb-4">
                          {sowDocs.map(doc => (
                            <div key={doc.id} className="flex items-center gap-3 p-3 bg-[#F9FAFB] rounded-xl">
                              <div className="flex-shrink-0 text-center w-6">
                                <span className="text-xs font-bold text-[#6B7280]">v{doc.version_number}</span>
                              </div>
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${DOC_TYPE_COLOR[doc.document_type]}`}>
                                {DOC_TYPE_LABEL[doc.document_type]}
                              </span>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-medium text-[#0F0F0F] truncate">{doc.file_name}</p>
                                <p className="text-[10px] text-[#9CA3AF]">
                                  {new Date(doc.created_at).toLocaleDateString('sv-SE')}
                                  {' · '}
                                  <span className={doc.parse_status === 'done' ? 'text-[#16A34A]' : doc.parse_status === 'error' ? 'text-[#DC2626]' : 'text-[#D97706]'}>
                                    {PARSE_STATUS_ICON[doc.parse_status]} {doc.parse_status}
                                  </span>
                                </p>
                              </div>
                              {doc.parse_status === 'done' && (
                                <button onClick={() => setReviewSow(doc)} className="text-[10px] text-[#61b5cc] hover:underline flex-shrink-0">Review</button>
                              )}
                              <button onClick={() => handleDownload(doc.storage_path)} className="text-[#9CA3AF] hover:text-[#0F0F0F] flex-shrink-0" title="Download">
                                <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                                  <path d="M.5 9.9a.5.5 0 01.5.5v2.5a1 1 0 001 1h12a1 1 0 001-1v-2.5a.5.5 0 011 0v2.5a2 2 0 01-2 2H2a2 2 0 01-2-2v-2.5a.5.5 0 01.5-.5z" />
                                  <path d="M7.646 11.854a.5.5 0 00.708 0l3-3a.5.5 0 00-.708-.708L8.5 10.293V1.5a.5.5 0 00-1 0v8.793L5.354 8.146a.5.5 0 10-.708.708l3 3z" />
                                </svg>
                              </button>
                              <button onClick={() => handleDeleteSow(doc.id)} className="text-[#D1D5DB] hover:text-[#DC2626] flex-shrink-0" title="Delete">
                                <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                                  <path d="M5.5 5.5A.5.5 0 016 6v6a.5.5 0 01-1 0V6a.5.5 0 01.5-.5zm5 0a.5.5 0 01.5.5v6a.5.5 0 01-1 0V6a.5.5 0 01.5-.5z" />
                                  <path fillRule="evenodd" d="M14.5 3a1 1 0 01-1 1H13v9a2 2 0 01-2 2H5a2 2 0 01-2-2V4h-.5a1 1 0 01-1-1V2a1 1 0 011-1H6a1 1 0 011-1h2a1 1 0 011 1h3.5a1 1 0 011 1v1zM4.118 4L4 4.059V13a1 1 0 001 1h6a1 1 0 001-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z" clipRule="evenodd" />
                                </svg>
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                      <button onClick={() => setShowUpload(true)} className="flex items-center gap-1.5 text-xs text-[#9CA3AF] hover:text-[#0F0F0F] transition-colors">
                        <span className="text-sm font-light">+</span> Upload new document
                      </button>
                    </div>
                  )}
                </div>

                {/* Invoice Schedule */}
                <div className="bg-white rounded-2xl border border-[#E5E7EB] overflow-hidden shadow-sm">
                  <div className="flex items-center justify-between px-5 py-3 bg-[#F8FAFC] border-b border-[#E5E7EB]">
                    <span className="text-[10px] font-bold text-[#64748B] uppercase tracking-widest">Invoice schedule ({drafts.length})</span>
                    <div className="flex items-center gap-2">
                      {saveMsg && (
                        <span className={`text-xs ${saveMsg === 'Saved' ? 'text-[#16A34A]' : 'text-[#DC2626]'}`}>{saveMsg}</span>
                      )}
                      <button
                        onClick={handleSave}
                        disabled={saving}
                        className="px-3 py-1 text-xs font-medium text-white bg-[#0F0F0F] rounded-lg hover:bg-[#374151] transition-colors disabled:opacity-50"
                      >
                        {saving ? 'Saving…' : 'Save'}
                      </button>
                    </div>
                  </div>
                  <div className="p-5">
                    {drafts.length === 0 && (
                      <div className="flex items-center gap-3 mb-4 p-3 bg-[#F8FAFC] rounded-xl border border-[#E5E7EB]">
                        <p className="text-xs text-[#6B7280] flex-1">
                          {sowDocs.length === 0
                            ? 'No invoices yet. Upload a SOW to auto-generate, or add rows manually below.'
                            : 'No invoices yet. Generate from the latest SOW or add rows manually below.'}
                        </p>
                        <div className="flex gap-2 flex-shrink-0">
                          {latestSow?.parse_status === 'done' && (
                            <button onClick={() => setReviewSow(latestSow)} className="px-3 py-1.5 text-xs font-medium text-white bg-[#0F0F0F] rounded-lg hover:bg-[#374151] transition-colors">
                              Generate from SOW
                            </button>
                          )}
                          {sowDocs.length === 0 && (
                            <button onClick={() => setShowUpload(true)} className="px-3 py-1.5 text-xs font-medium text-white bg-[#0F0F0F] rounded-lg hover:bg-[#374151] transition-colors">
                              Upload SOW
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                    <InvoiceTable
                      drafts={drafts}
                      savedInvoices={invoices}
                      contractValueSek={contractValueSek}
                      onChange={setDrafts}
                      onStatusChange={handleStatusChange}
                    />
                  </div>
                </div>

                {/* Per-client cash flow chart */}
                {(Object.keys(planCells).length > 0 || drafts.length > 0) && (
                  <div className="bg-white rounded-2xl border border-[#E5E7EB] p-5 shadow-sm">
                    <SowCashFlowChart
                      planCells={planCells}
                      invoices={chartInvoices}
                      months={ROLLING_MONTHS}
                      title={`Cash flow — ${selectedItem?.clientName ?? ''}`}
                    />
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Modals */}
      {showUpload && selectedId && (
        <SowUploadModal
          itemId={selectedId}
          clientName={selectedItem?.clientName ?? null}
          onDone={handleParsed}
          onClose={() => setShowUpload(false)}
        />
      )}
      {reviewSow && (
        <SowReviewModal
          sow={reviewSow}
          hasExistingInvoices={invoices.length > 0}
          onGenerated={handleGenerated}
          onSuggestions={handleSuggestions}
          onClose={() => setReviewSow(null)}
        />
      )}
      {suggestions !== null && (
        <AmendmentSuggestionsModal
          suggestions={suggestions}
          onApply={applyAmendments}
          onClose={() => setSuggestions(null)}
        />
      )}
    </div>
  )
}

export default function InvoicesPage() {
  return (
    <Suspense>
      <InvoicesContent />
    </Suspense>
  )
}
