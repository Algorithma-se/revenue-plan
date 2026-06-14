'use client'

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import type {
  SowDocument, Invoice, InvoiceDraft, InvoiceSuggestion, InvoiceStatus, SowParsedRaw,
} from '@/types/database'
import { getInvoices, getInvoicesByClientName, getUnassignedInvoices, getAllInvoiceItems, saveInvoicesForClient, setClientVat } from '@/app/actions/invoices'
import { getBLBetaEnabled } from '@/app/actions/bl'
import { getSowDocuments, getSowDownloadUrl, deleteSow } from '@/app/actions/sow'
import { SowTermsModal } from '@/components/sow/SowTermsModal'
import { InvoiceTable } from '@/components/sow/InvoiceTable'
import { BLApproveModal } from '@/components/invoice/BLApproveModal'
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
  excludeVat:   boolean
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

function VatBadge({ excludeVat, onToggle }: { excludeVat: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      title={excludeVat ? 'No VAT — click to enable 25% VAT' : 'VAT 25% — click to mark as foreign (no VAT)'}
      className={`inline-flex items-center px-2 py-0.5 text-[11px] font-medium rounded-full transition-colors ${
        excludeVat
          ? 'bg-[#F3F4F6] text-[#9CA3AF] hover:bg-[#FEF2F2] hover:text-[#DC2626]'
          : 'bg-[#F0FDF4] text-[#16A34A] hover:bg-[#DCFCE7]'
      }`}
    >
      {excludeVat ? 'No VAT' : 'VAT 25%'}
    </button>
  )
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
  const [sidebarSearch, setSidebarSearch]  = useState('')

  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [showTermsModal, setShowTermsModal] = useState(false)
  const [showUpload, setShowUpload]   = useState(false)
  const [reviewSow, setReviewSow]     = useState<SowDocument | null>(null)
  const [suggestions, setSuggestions] = useState<InvoiceSuggestion[] | null>(null)
  const [blBetaEnabled, setBlBetaEnabled] = useState(false)
  const [blIsStub,      setBlIsStub]      = useState(true)
  const [blDeepLinkId,  setBlDeepLinkId]  = useState<string | null>(null)

  const { invoicesEnabled } = useFeatureFlags()

  const UNASSIGNED_ID = '__unassigned__'

  const loadSidebar = useCallback(async () => {
    try {
      const [items, { data: pods }, unassignedResult] = await Promise.all([
        getAllInvoiceItems(),
        supabase.from('pods').select('id, name'),
        supabase.from('invoices').select('id', { count: 'exact', head: true }).is('manual_revenue_item_id', null),
      ])
      const count = unassignedResult?.count ?? 0
      setSidebarItems(items)
      setPodNames(new Map((pods ?? []).map((p: { id: string; name: string }) => [p.id, p.name])))
      if (count > 0) {
        setSidebarItems(prev => {
          if (prev.some(i => i.itemId === UNASSIGNED_ID)) return prev
          return [...prev, {
            itemId:       UNASSIGNED_ID,
            clientName:   'Unassigned invoices',
            project:      null,
            podId:        null,
            invoiceCount: count,
            hasSow:       false,
            excludeVat:   false,
          }]
        })
      }
    } catch (err) {
      console.error('loadSidebar failed:', err)
    }
  }, [])

  useEffect(() => { loadSidebar() }, [loadSidebar])

  useEffect(() => {
    getBLBetaEnabled().then(enabled => {
      setBlBetaEnabled(enabled)
      if (enabled) {
        // check stub by looking at bl_client_id via the already-loaded settings
        import('@/app/actions/admin').then(({ getAppSetting }) =>
          getAppSetting('bl_client_id').then(cid => setBlIsStub(!cid))
        )
      }
    })
  }, [])

  const [blDeepLinkInvoice, setBlDeepLinkInvoice] = useState<Invoice | null>(null)

  useEffect(() => {
    const approveId = searchParams.get('bl_approve')
    if (!approveId) return
    setBlDeepLinkId(approveId)
    // Fetch the invoice directly so the modal works even before sidebar selection
    supabase.from('invoices').select('*').eq('id', approveId).single()
      .then(({ data }) => { if (data) setBlDeepLinkInvoice(data as Invoice) })
  }, [searchParams])

  useEffect(() => {
    const itemFromUrl = searchParams.get('item')
    if (itemFromUrl) setSelectedId(itemFromUrl)
  }, [searchParams])

  // Keep a ref so effects can read current sidebarItems without adding it as a dep
  const sidebarItemsRef = useRef(sidebarItems)
  useEffect(() => { sidebarItemsRef.current = sidebarItems }, [sidebarItems])

  // Primary load: fires only when selectedId changes
  useEffect(() => {
    if (!selectedId) return
    router.replace(`/invoices?item=${selectedId}`, { scroll: false })
    setLoadingMain(true)
    const isUnassigned = selectedId === UNASSIGNED_ID
    const item         = sidebarItemsRef.current.find(i => i.itemId === selectedId) ?? null
    const clientName   = item?.clientName ?? null

    const invoicePromise = isUnassigned
      ? getUnassignedInvoices()
      : clientName
        ? getInvoicesByClientName(clientName)
        : getInvoices(selectedId)       // fallback before sidebar has loaded

    const sowPromise = isUnassigned ? Promise.resolve([]) : getSowDocuments(selectedId)

    Promise.all([sowPromise, invoicePromise]).then(([docs, invs]) => {
      setSowDocs(docs as any)
      setInvoices(invs)
      setDrafts(invoicesToDrafts(invs))
    }).catch(err => {
      console.error('Invoice load failed:', err)
    }).finally(() => setLoadingMain(false))
  }, [selectedId, router]) // eslint-disable-line react-hooks/exhaustive-deps

  // Upgrade: once sidebar loads, re-fetch by client name if we only had item-level data
  const upgradedRef = useRef<string | null>(null)
  // Reset upgrade tracker when item changes so switching clients always re-upgrades
  useEffect(() => { upgradedRef.current = null }, [selectedId])
  useEffect(() => {
    if (!selectedId || sidebarItems.length === 0) return
    if (upgradedRef.current === selectedId) return   // already upgraded for this item
    upgradedRef.current = selectedId
    const isUnassigned = selectedId === UNASSIGNED_ID
    if (isUnassigned) return
    const item       = sidebarItems.find(i => i.itemId === selectedId) ?? null
    const clientName = item?.clientName ?? null
    if (!clientName) return
    getInvoicesByClientName(clientName).then(invs => {
      setInvoices(invs)
      setDrafts(invoicesToDrafts(invs))
    })
  }, [sidebarItems, selectedId]) // eslint-disable-line react-hooks/exhaustive-deps

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
      exclude_vat:     i.exclude_vat,
    }))
  }

  async function handleSave() {
    if (!selectedId) return
    setSaving(true)
    setSaveMsg(null)
    try {
      const latestSow    = sowDocs[sowDocs.length - 1] ?? null
      const isUnassigned = selectedId === UNASSIGNED_ID
      const primaryItemId = isUnassigned ? null : selectedId
      const clientName    = selectedItem?.clientName ?? ''
      const originalIds   = invoices.map(i => i.id)
      const saved = await saveInvoicesForClient(primaryItemId, clientName, drafts, latestSow?.id ?? null, originalIds)
      setInvoices(saved)
      setDrafts(invoicesToDrafts(saved))
      setSaveMsg('Saved')
      setTimeout(() => setSaveMsg(null), 2000)
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
  }

  async function handleDownload(storagePath: string) {
    try {
      const url = await getSowDownloadUrl(storagePath)
      window.open(url, '_blank')
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Download failed')
    }
  }

  function handleParsed(sow: SowDocument, _itemId?: string) {
    setSowDocs(ds => [...ds, sow])
    setShowUpload(false)
    setReviewSow(sow)
    loadSidebar()
  }

  function handleGenerated(newInvoices: Invoice[], updatedSow: SowDocument, replace = false) {
    setSowDocs(ds => ds.map(d => d.id === updatedSow.id ? updatedSow : d))
    if (replace) {
      setInvoices(newInvoices)
      setDrafts(invoicesToDrafts(newInvoices))
    } else {
      setInvoices(prev => {
        const merged = [...prev, ...newInvoices]
        setDrafts(invoicesToDrafts(merged))
        return merged
      })
    }
    setReviewSow(null)
    loadSidebar()
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

  const latestSow        = sowDocs[sowDocs.length - 1] ?? null
  const contractValueSek = latestSow?.parsed_total_value_sek != null
    ? Number(latestSow.parsed_total_value_sek) : null
  const paymentTermsDays = (() => {
    const terms = latestSow?.parsed_payment_terms ?? ''
    const m = terms.match(/(\d+)/)
    return m ? parseInt(m[1], 10) : 0
  })()
  const latestRaw        = latestSow?.parsed_raw as SowParsedRaw | null

  const termsConflict = sowDocs.length > 1 && sowDocs.some(d => {
    const raw = d.parsed_raw as SowParsedRaw | null
    return d.parsed_payment_terms !== sowDocs[0].parsed_payment_terms ||
      raw?.invoicing_model !== (sowDocs[0].parsed_raw as SowParsedRaw | null)?.invoicing_model
  })

  async function handleToggleVat() {
    if (!selectedId) return
    const next = !clientExcludeVat
    await setClientVat(selectedId, next)
    setSidebarItems(prev => prev.map(i => i.itemId === selectedId ? { ...i, excludeVat: next } : i))
    setDrafts(prev => prev.map(d => ({ ...d, exclude_vat: next })))
  }

  function handleTermsSaved(updatedSow: SowDocument) {
    setSowDocs(prev => {
      const exists = prev.some(d => d.id === updatedSow.id)
      return exists ? prev.map(d => d.id === updatedSow.id ? updatedSow : d) : [...prev, updatedSow]
    })
    setShowTermsModal(false)
  }

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
        exclude_vat:            d.exclude_vat ?? false,
        client_name:            null,
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

  const pods = Array.from(new Set(sidebarItems.map(i => i.podId)))
    .map(id => ({ id, name: id ? (podNames.get(id) ?? id) : 'No pod' }))
    .sort((a, b) => a.name.localeCompare(b.name))

  const podFilteredItems = selectedPodId
    ? sidebarItems.filter(i => i.podId === selectedPodId)
    : sidebarItems

  // Alphabetical, deduplicated client groups for the sidebar
  const clientGroups = useMemo(() => {
    const q = sidebarSearch.trim().toLowerCase()
    const filtered = q
      ? podFilteredItems.filter(i =>
          (i.clientName ?? '').toLowerCase().includes(q) ||
          (i.project    ?? '').toLowerCase().includes(q)
        )
      : podFilteredItems
    const byClient = new Map<string, SidebarItem[]>()
    for (const item of filtered) {
      const key = item.clientName ?? '(no name)'
      byClient.set(key, [...(byClient.get(key) ?? []), item])
    }
    return Array.from(byClient.entries()).sort(([a], [b]) =>
      a.localeCompare(b, 'sv', { sensitivity: 'base' })
    )
  }, [podFilteredItems, sidebarSearch])

  // Auto-select first client on initial load only (ref prevents re-firing after user clears selection)
  const hasAutoSelected = useRef(false)
  useEffect(() => {
    if (hasAutoSelected.current || selectedId || clientGroups.length === 0) return
    hasAutoSelected.current = true
    setSelectedId(clientGroups[0][1][0].itemId)
  }, [clientGroups, selectedId])

  const selectedItem     = sidebarItems.find(i => i.itemId === selectedId) ?? null
  const clientExcludeVat = selectedItem?.excludeVat ?? false
  const isUnassignedView = selectedId === UNASSIGNED_ID

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
    <div className="flex bg-[#F9F9F8] min-h-screen p-4 sm:p-5 gap-4 sm:gap-5">

      {/* ── Left sidebar (card) ───────────────────────────────────────────── */}
      <aside className={`bg-white rounded-2xl border border-[#E5E7EB] shadow-sm flex-col overflow-hidden flex-shrink-0 sticky top-[4.75rem] max-h-[calc(100vh-5.25rem)] ${
        selectedId ? 'hidden sm:flex sm:w-56' : 'flex w-full sm:w-56'
      } ${!sidebarOpen ? 'sm:!hidden' : ''}`}>

        {/* Sidebar header */}
        <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-[#F3F4F6]">
          <h1 className="text-sm font-bold text-[#0F0F0F] tracking-tight">Clients</h1>
          <button
            onClick={() => setSidebarOpen(false)}
            className="hidden sm:flex items-center justify-center w-6 h-6 rounded-lg text-[#C4C9D4] hover:text-[#374151] hover:bg-[#F3F4F6] transition-colors"
            title="Collapse"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        {/* Client list */}
        <div className="flex-1 overflow-y-auto py-1 flex flex-col">
          <div className="flex-1">
            {clientGroups.length === 0 ? (
              <p className="px-4 py-6 text-xs text-[#9CA3AF] text-center">No clients yet.</p>
            ) : clientGroups.filter(([name]) => name !== 'Unassigned invoices').map(([clientName, items]) => {
              const primaryItem   = items[0]
              const isSelected    = items.some(i => i.itemId === selectedId)
              const totalInvoices = items.reduce((s, i) => s + i.invoiceCount, 0)
              const anyHasSow     = items.some(i => i.hasSow)
              return (
                <button
                  key={clientName}
                  onClick={() => setSelectedId(primaryItem.itemId)}
                  className={`w-full text-left px-4 py-2.5 flex items-center justify-between gap-2 transition-colors ${
                    isSelected ? 'bg-[#EFF6FF]' : 'hover:bg-[#F9F9F8]'
                  }`}
                >
                  <span className={`text-xs font-medium truncate ${isSelected ? 'text-[#2563EB]' : 'text-[#0F0F0F]'}`}>
                    {clientName}
                  </span>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {anyHasSow && <span className="w-1.5 h-1.5 rounded-full bg-[#61b5cc]" title="Has SOW" />}
                    {totalInvoices > 0 && (
                      <span className={`text-[10px] font-semibold tabular-nums ${isSelected ? 'text-[#93C5FD]' : 'text-[#C4C9D4]'}`}>
                        {totalInvoices}
                      </span>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
          {/* Unassigned invoices — shown at bottom when present */}
          {sidebarItems.some(i => i.itemId === UNASSIGNED_ID) && (
            <div className="border-t border-[#F3F4F6] pt-1 pb-1">
              <button
                onClick={() => setSelectedId(UNASSIGNED_ID)}
                className={`w-full text-left px-4 py-2.5 flex items-center justify-between gap-2 transition-colors ${
                  selectedId === UNASSIGNED_ID ? 'bg-[#FFF7ED]' : 'hover:bg-[#F9F9F8]'
                }`}
              >
                <span className={`text-xs font-medium truncate ${selectedId === UNASSIGNED_ID ? 'text-[#B45309]' : 'text-[#9CA3AF]'}`}>
                  ⚠ Unassigned invoices
                </span>
                <span className={`text-[10px] font-semibold tabular-nums ${selectedId === UNASSIGNED_ID ? 'text-[#D97706]' : 'text-[#C4C9D4]'}`}>
                  {sidebarItems.find(i => i.itemId === UNASSIGNED_ID)?.invoiceCount}
                </span>
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* ── Right panel ───────────────────────────────────────────────────── */}
      <main className={`flex-1 min-w-0 ${!selectedId ? 'hidden sm:block' : 'block'}`}>

        {/* Mobile back button */}
        {selectedId && (
          <button
            onClick={() => setSelectedId(null)}
            className="sm:hidden flex items-center gap-1.5 text-xs font-medium text-[#6B7280] hover:text-[#0F0F0F] transition-colors mb-4"
          >
            <svg viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
              <path fillRule="evenodd" d="M9.707 3.293a1 1 0 010 1.414L6.414 8l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
            All clients
          </button>
        )}

        {/* Desktop: reopen collapsed sidebar */}
        {!sidebarOpen && (
          <button
            onClick={() => setSidebarOpen(true)}
            className="hidden sm:flex items-center gap-1.5 text-xs font-medium text-[#6B7280] hover:text-[#0F0F0F] px-2.5 py-1.5 rounded-lg bg-white border border-[#EBEBEB] hover:border-[#C4C9D4] transition-all shadow-sm mb-4"
            title="Show client list"
          >
            <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
              <path fillRule="evenodd" d="M2.5 12a.5.5 0 01.5-.5h10a.5.5 0 010 1H3a.5.5 0 01-.5-.5zm0-4a.5.5 0 01.5-.5h10a.5.5 0 010 1H3a.5.5 0 01-.5-.5zm0-4a.5.5 0 01.5-.5h10a.5.5 0 010 1H3a.5.5 0 01-.5-.5z" clipRule="evenodd" />
            </svg>
            Clients
          </button>
        )}

        {!selectedId ? (
          <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-10 h-10 text-[#D1D5DB] mb-3">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
            </svg>
            <p className="text-sm font-medium text-[#6B7280]">Select a client to view their invoice plan</p>
          </div>
        ) : loadingMain ? (
          <div className="bg-white rounded-2xl border border-[#E5E7EB] p-8 shadow-sm max-w-4xl">
            <div className="space-y-3">
              {[80, 60, 90, 50].map((w, i) => (
                <div key={i} className="h-4 bg-[#F3F4F6] rounded animate-pulse" style={{ width: `${w}%` }} />
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-5 max-w-4xl">

            {/* Client header */}
            {selectedItem && (
              <div className="bg-white rounded-2xl border border-[#E5E7EB] shadow-sm overflow-hidden">
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
                </div>

                <div className="flex flex-wrap items-center gap-1.5 px-5 pb-4">
                  {!latestSow ? (
                    <>
                      <button
                        onClick={() => setShowTermsModal(true)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded-full border border-dashed border-[#D1D5DB] text-[#9CA3AF] hover:border-[#61b5cc] hover:text-[#61b5cc] transition-colors"
                      >
                        <span className="text-sm font-light leading-none">+</span> Set terms
                      </button>
                      <VatBadge excludeVat={clientExcludeVat} onToggle={handleToggleVat} />
                    </>
                  ) : termsConflict ? (
                    <>
                      <span className="inline-flex items-center px-2 py-0.5 text-[11px] font-medium rounded-full bg-[#FFFBEB] text-[#B45309]">
                        Multiple agreements
                      </span>
                      <button
                        onClick={() => setShowTermsModal(true)}
                        className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded-full border border-[#E5E7EB] text-[#6B7280] hover:border-[#61b5cc] hover:text-[#61b5cc] transition-colors"
                        title="Edit terms"
                      >
                        <svg viewBox="0 0 20 20" fill="currentColor" className="w-2.5 h-2.5">
                          <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                        </svg>
                        Edit
                      </button>
                      <VatBadge excludeVat={clientExcludeVat} onToggle={handleToggleVat} />
                    </>
                  ) : (
                    <>
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
                      <button
                        onClick={() => setShowTermsModal(true)}
                        className="inline-flex items-center p-1 rounded-full text-[#D1D5DB] hover:text-[#61b5cc] hover:bg-[#F0F9FF] transition-colors"
                        title="Edit terms"
                      >
                        <svg viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3">
                          <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                        </svg>
                      </button>
                      <VatBadge excludeVat={clientExcludeVat} onToggle={handleToggleVat} />
                    </>
                  )}
                </div>
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
              {drafts.length === 0 && (
                <div className="flex items-center gap-3 px-5 py-4 border-b border-[#F3F4F6]">
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
                contractValueSek={isUnassignedView ? null : contractValueSek}
                clientName={selectedItem?.clientName ?? null}
                paymentTermsDays={paymentTermsDays || undefined}
                clientExcludeVat={clientExcludeVat}
                disableAdd={isUnassignedView}
                blBetaEnabled={blBetaEnabled}
                isStubMode={blIsStub}
                onChange={setDrafts}
                onStatusChange={handleStatusChange}
                onBLChange={(invoiceId, patch) => {
                  setInvoices(ivs => ivs.map(i => i.id === invoiceId ? { ...i, ...patch } : i))
                }}
              />
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
          </div>
        )}
      </main>

      {/* Modals */}
      {showTermsModal && selectedId && (
        <SowTermsModal
          sow={latestSow}
          allDocs={sowDocs}
          itemId={selectedId}
          onSaved={handleTermsSaved}
          onClose={() => setShowTermsModal(false)}
        />
      )}
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

      {blDeepLinkId && (() => {
        const inv = invoices.find(i => i.id === blDeepLinkId) ?? blDeepLinkInvoice
        if (!inv) return null
        return (
          <BLApproveModal
            invoice={inv}
            isStub={blIsStub}
            onDone={patch => {
              setInvoices(ivs => ivs.map(i => i.id === blDeepLinkId ? { ...i, ...patch } : i))
              setBlDeepLinkInvoice(null)
              setBlDeepLinkId(null)
              router.replace(selectedId ? `/invoices?item=${selectedId}` : '/invoices', { scroll: false })
            }}
            onClose={() => {
              setBlDeepLinkInvoice(null)
              setBlDeepLinkId(null)
              router.replace(selectedId ? `/invoices?item=${selectedId}` : '/invoices', { scroll: false })
            }}
          />
        )
      })()}
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
