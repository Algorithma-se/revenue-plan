'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import type {
  SowDocument, Invoice, InvoiceDraft, InvoiceSuggestion, InvoiceStatus,
} from '@/types/database'
import { getInvoices, getAllInvoiceItems, saveInvoices } from '@/app/actions/invoices'
import { getSowDocuments, getSowDownloadUrl, deleteSow } from '@/app/actions/sow'
import { InvoiceTable } from '@/components/sow/InvoiceTable'
import { SowUploadModal } from '@/components/sow/SowUploadModal'
import { SowReviewModal } from '@/components/sow/SowReviewModal'
import { AmendmentSuggestionsModal } from '@/components/sow/AmendmentSuggestionsModal'
import { SowCashFlowChart } from '@/components/sow/SowCashFlowChart'
import { getFiscalMonths, currentFyStart } from '@/lib/plan-utils'
import { useFeatureFlags } from '@/components/FeatureFlagsProvider'

interface SidebarItem {
  itemId:       string
  clientName:   string | null
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
  done:    '✓',
  parsing: '…',
  pending: '·',
  error:   '!',
}

function useOverdueCheck(invoices: Invoice[]) {
  const today = new Date().toISOString().slice(0, 10)
  return invoices.filter(i => i.status === 'sent' && i.due_date < today)
}

export default function InvoicesPage() {
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

  // Modals
  const [showUpload, setShowUpload]         = useState(false)
  const [reviewSow, setReviewSow]           = useState<SowDocument | null>(null)
  const [suggestions, setSuggestions]       = useState<InvoiceSuggestion[] | null>(null)

  const { invoicesEnabled } = useFeatureFlags()
  const months = getFiscalMonths(currentFyStart())

  // Load sidebar list
  const loadSidebar = useCallback(async () => {
    const [items, { data: pods }] = await Promise.all([
      getAllInvoiceItems(),
      supabase.from('pods').select('id, name'),
    ])
    setSidebarItems(items)
    setPodNames(new Map((pods ?? []).map((p: { id: string; name: string }) => [p.id, p.name])))
  }, [])

  useEffect(() => { loadSidebar() }, [loadSidebar])

  // Sync URL param to selectedId
  useEffect(() => {
    const itemFromUrl = searchParams.get('item')
    if (itemFromUrl) setSelectedId(itemFromUrl)
  }, [searchParams])

  // Load detail when selection changes
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

  // Plan cells for cash flow chart
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
      // Refresh sidebar counts
      loadSidebar()
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
    if (!confirm('Delete this SOW document? The invoices will NOT be deleted.')) return
    await deleteSow(sowId)
    setSowDocs(ds => ds.filter(d => d.id !== sowId))
    loadSidebar()
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

  function handleGenerated(newInvoices: Invoice[]) {
    setInvoices(prev => {
      const merged = [...prev, ...newInvoices]
      setDrafts(invoicesToDrafts(merged))
      return merged
    })
    setReviewSow(null)
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
    ? Number(latestSow.parsed_total_value_sek)
    : null

  // Group sidebar items by pod
  const byPod = new Map<string | null, SidebarItem[]>()
  for (const item of sidebarItems) {
    const key = item.podId
    if (!byPod.has(key)) byPod.set(key, [])
    byPod.get(key)!.push(item)
  }

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
      <div className="max-w-7xl mx-auto px-4 py-6">

        {/* Title */}
        <div className="mb-6">
          <h1 className="text-xl font-bold text-[#0F0F0F] tracking-tight">Invoices</h1>
          <p className="text-xs text-[#9CA3AF] mt-0.5">SOW documents and invoice schedules</p>
        </div>

        <div className="flex gap-5 items-start">

          {/* ── Sidebar ─────────────────────────────────────────────────────── */}
          <div className="w-56 flex-shrink-0">
            <div className="bg-white rounded-2xl border border-[#E5E7EB] overflow-hidden shadow-sm">
              <div className="px-4 py-2.5 bg-[#F8FAFC] border-b border-[#E5E7EB]">
                <span className="text-[10px] font-bold text-[#64748B] uppercase tracking-widest">Clients</span>
              </div>

              {sidebarItems.length === 0 ? (
                <div className="px-4 py-6 text-center">
                  <p className="text-xs text-[#9CA3AF]">No clients with invoices yet.</p>
                  <p className="text-xs text-[#9CA3AF] mt-1">Attach a SOW to a revenue row in the P&L to get started.</p>
                </div>
              ) : (
                <div className="divide-y divide-[#F3F4F6]">
                  {sidebarItems.map(item => (
                    <button
                      key={item.itemId}
                      onClick={() => setSelectedId(item.itemId)}
                      className={`w-full text-left px-4 py-2.5 transition-colors ${
                        selectedId === item.itemId
                          ? 'bg-[#EFF9FF] border-l-2 border-[#61b5cc]'
                          : 'hover:bg-[#F9FAFB] border-l-2 border-transparent'
                      }`}
                    >
                      <p className="text-xs font-medium text-[#0F0F0F] truncate">{item.clientName ?? '(no name)'}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {item.podId && (
                          <span className="text-[10px] text-[#9CA3AF] truncate">{podNames.get(item.podId) ?? ''}</span>
                        )}
                        <span className="text-[10px] text-[#9CA3AF] ml-auto">{item.invoiceCount} inv</span>
                        {item.hasSow && (
                          <span className="text-[10px] text-[#61b5cc]">SOW</span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ── Main panel ──────────────────────────────────────────────────── */}
          <div className="flex-1 min-w-0 space-y-5">

            {!selectedId ? (
              <div className="bg-white rounded-2xl border border-[#E5E7EB] p-12 text-center shadow-sm">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-10 h-10 mx-auto text-[#D1D5DB] mb-3">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                </svg>
                <p className="text-sm text-[#6B7280]">Select a client from the sidebar, or attach a SOW to a revenue row in the P&L.</p>
              </div>
            ) : loadingMain ? (
              <div className="bg-white rounded-2xl border border-[#E5E7EB] p-8 shadow-sm">
                <div className="space-y-3">
                  {[80, 60, 90, 50].map((w, i) => (
                    <div key={i} className={`h-4 bg-[#F3F4F6] rounded animate-pulse`} style={{ width: `${w}%` }} />
                  ))}
                </div>
              </div>
            ) : (
              <>
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
                    <svg viewBox="0 0 16 16" fill="currentColor" className={`w-3 h-3 text-[#9CA3AF] transition-transform ${docHistoryOpen ? 'rotate-0' : '-rotate-90'}`}>
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
                                <button
                                  onClick={() => setReviewSow(doc)}
                                  className="text-[10px] text-[#61b5cc] hover:underline flex-shrink-0"
                                >
                                  Review
                                </button>
                              )}
                              <button
                                onClick={() => handleDownload(doc.storage_path)}
                                className="text-[#9CA3AF] hover:text-[#0F0F0F] flex-shrink-0"
                                title="Download"
                              >
                                <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                                  <path d="M.5 9.9a.5.5 0 01.5.5v2.5a1 1 0 001 1h12a1 1 0 001-1v-2.5a.5.5 0 011 0v2.5a2 2 0 01-2 2H2a2 2 0 01-2-2v-2.5a.5.5 0 01.5-.5z" />
                                  <path d="M7.646 11.854a.5.5 0 00.708 0l3-3a.5.5 0 00-.708-.708L8.5 10.293V1.5a.5.5 0 00-1 0v8.793L5.354 8.146a.5.5 0 10-.708.708l3 3z" />
                                </svg>
                              </button>
                              <button
                                onClick={() => handleDeleteSow(doc.id)}
                                className="text-[#D1D5DB] hover:text-[#DC2626] flex-shrink-0"
                                title="Delete document"
                              >
                                <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                                  <path d="M5.5 5.5A.5.5 0 016 6v6a.5.5 0 01-1 0V6a.5.5 0 01.5-.5zm5 0a.5.5 0 01.5.5v6a.5.5 0 01-1 0V6a.5.5 0 01.5-.5z" />
                                  <path fillRule="evenodd" d="M14.5 3a1 1 0 01-1 1H13v9a2 2 0 01-2 2H5a2 2 0 01-2-2V4h-.5a1 1 0 01-1-1V2a1 1 0 011-1H6a1 1 0 011-1h2a1 1 0 011 1h3.5a1 1 0 011 1v1zM4.118 4L4 4.059V13a1 1 0 001 1h6a1 1 0 001-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z" clipRule="evenodd" />
                                </svg>
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                      <button
                        onClick={() => setShowUpload(true)}
                        className="flex items-center gap-1.5 text-xs text-[#9CA3AF] hover:text-[#0F0F0F] transition-colors"
                      >
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
                    {drafts.length === 0 && sowDocs.length === 0 ? (
                      <div className="text-center py-6">
                        <p className="text-xs text-[#9CA3AF] mb-3">Upload a SOW document to generate an invoice schedule, or add invoices manually.</p>
                        <button
                          onClick={() => setShowUpload(true)}
                          className="px-4 py-2 text-xs font-medium text-white bg-[#0F0F0F] rounded-lg hover:bg-[#374151] transition-colors"
                        >
                          Upload SOW
                        </button>
                      </div>
                    ) : drafts.length === 0 && sowDocs.length > 0 ? (
                      <div className="text-center py-6">
                        <p className="text-xs text-[#9CA3AF] mb-3">No invoices yet. Generate from the latest SOW or add manually.</p>
                        <div className="flex justify-center gap-2">
                          {latestSow?.parse_status === 'done' && (
                            <button
                              onClick={() => setReviewSow(latestSow)}
                              className="px-4 py-2 text-xs font-medium text-white bg-[#0F0F0F] rounded-lg hover:bg-[#374151] transition-colors"
                            >
                              Generate from latest SOW
                            </button>
                          )}
                        </div>
                      </div>
                    ) : (
                      <InvoiceTable
                        drafts={drafts}
                        savedInvoices={invoices}
                        contractValueSek={contractValueSek}
                        onChange={setDrafts}
                        onStatusChange={handleStatusChange}
                      />
                    )}
                  </div>
                </div>

                {/* Cash flow chart */}
                {(Object.keys(planCells).length > 0 || invoices.length > 0) && (
                  <div className="bg-white rounded-2xl border border-[#E5E7EB] p-5 shadow-sm">
                    <SowCashFlowChart planCells={planCells} invoices={invoices} months={months} />
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Modals */}
      {showUpload && selectedId && (
        <SowUploadModal
          itemId={selectedId}
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
