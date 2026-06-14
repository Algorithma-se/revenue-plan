'use client'

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { getAggregatedCashFlow, getAllInvoicesWithClients, getBankBalanceEntries, getAllInvoiceItems } from '@/app/actions/invoices'
import { getBLBetaEnabled } from '@/app/actions/bl'
import { getCashOutEvents } from '@/app/actions/cash'
import type { CashOutEvent, CashBriefMonth } from '@/app/actions/cash'
import { SowCashFlowChart } from '@/components/sow/SowCashFlowChart'
import { InvoiceEditModal, type InvoiceEditData } from '@/components/sow/InvoiceEditModal'
import { ChatNotifyModal } from '@/components/sow/ChatNotifyModal'
import { CashPositionModal, type CashModalMode } from '@/components/invoice/CashPositionModal'
import { AllieCashBrief } from '@/components/invoice/AllieCashBrief'
import { ImportInvoicesModal } from '@/components/invoice/ImportInvoicesModal'
import { BLSubmitModal } from '@/components/invoice/BLSubmitModal'
import { BLApproveModal } from '@/components/invoice/BLApproveModal'
import { useFeatureFlags } from '@/components/FeatureFlagsProvider'
import type { Invoice, InvoiceDraft, InvoiceStatus, PaymentTrigger } from '@/types/database'

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

function getThreeRollingMonths(): string[] {
  const now = new Date()
  const months: string[] = []
  for (let i = -1; i <= 1; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1)
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`)
  }
  return months
}
const THREE_ROLLING_MONTHS = getThreeRollingMonths()
const TODAY = new Date().toISOString().slice(0, 10)

const STATUS_STYLE: Record<string, string> = {
  draft: 'bg-[#F3F4F6] text-[#6B7280]',
  sent:  'bg-[#EFF6FF] text-[#2563EB]',
  paid:  'bg-[#F0FDF4] text-[#16A34A]',
}

type InvoiceRow = InvoiceEditData

function alertReason(inv: InvoiceRow): string | null {
  if (inv.status === 'draft' && inv.issue_date && inv.issue_date < TODAY)
    return `Issue date ${inv.issue_date} has passed — invoice not yet sent`
  if ((inv.status === 'draft' || inv.status === 'sent') && inv.due_date && inv.due_date < TODAY)
    return `Due date ${inv.due_date} has passed — invoice unpaid`
  return null
}

function sortByDate(rows: InvoiceRow[]): InvoiceRow[] {
  return [...rows].sort((a, b) => a.issue_date.localeCompare(b.issue_date))
}

function InvoiceOverviewContent() {
  const { invoicesEnabled } = useFeatureFlags()

  const [showImport,     setShowImport]     = useState(false)
  const [aggregateOpen,  setAggregateOpen]  = useState(true)
  const [cashPosOpen,    setCashPosOpen]    = useState(false)
  const [cashOutEvents,   setCashOutEvents]   = useState<CashOutEvent[]>([])
  const [breakdownMonth,  setBreakdownMonth]  = useState<string | null>(null)
  const [breakdownMode,   setBreakdownMode]   = useState<CashModalMode>('cash_out')
  const [monthNotes,      setMonthNotes]      = useState<Record<string, string>>({})
  const [editingNote,     setEditingNote]     = useState<string | null>(null)
  const [aggData,        setAggData]        = useState<{
    planByMonth:     Record<string, number>
    invoicedByMonth: Record<string, number>
    expectedByMonth: Record<string, number>
    costsByMonth:    Record<string, number>
  } | null>(null)
  const [bankEntries,    setBankEntries]    = useState<Record<string, number>>({})

  const [invoices,         setInvoices]         = useState<InvoiceRow[]>([])
  const [clientItems,      setClientItems]      = useState<{ itemId: string; clientName: string | null }[]>([])
  const [loading,          setLoading]          = useState(true)
  const [editingInvoice,   setEditingInvoice]   = useState<InvoiceRow | null>(null)
  const [notifyingInvoice, setNotifyingInvoice] = useState<InvoiceRow | null>(null)
  const [search,           setSearch]           = useState('')
  const [blBetaEnabled,    setBlBetaEnabled]    = useState(false)
  const [blIsStub,         setBlIsStub]         = useState(true)
  const [blSubmitRow,      setBlSubmitRow]      = useState<InvoiceRow | null>(null)
  const [blApproveRow,     setBlApproveRow]     = useState<InvoiceRow | null>(null)
  const [paidOpen,         setPaidOpen]         = useState(false)
  const [paidYear,         setPaidYear]         = useState(new Date().getFullYear())

  const load = useCallback(async () => {
    try {
      const [agg, invs, entries, cashOuts, items] = await Promise.all([
        getAggregatedCashFlow(),
        getAllInvoicesWithClients(),
        getBankBalanceEntries(),
        getCashOutEvents(),
        getAllInvoiceItems(),
      ])
      setAggData(agg)
      setInvoices(sortByDate(invs))
      setBankEntries(entries)
      setCashOutEvents(cashOuts)
      setClientItems(items.map(i => ({ itemId: i.itemId, clientName: i.clientName })))
    } catch {
      setAggData({ planByMonth: {}, invoicedByMonth: {}, expectedByMonth: {}, costsByMonth: {} })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    getBLBetaEnabled().then(enabled => {
      setBlBetaEnabled(enabled)
      if (enabled) {
        import('@/app/actions/admin').then(({ getAppSetting }) =>
          getAppSetting('bl_client_id').then(cid => setBlIsStub(!cid))
        )
      }
    })
  }, [])

  // Load/save month notes from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('asap-month-notes')
      if (saved) setMonthNotes(JSON.parse(saved))
    } catch {}
  }, [])

  function saveNote(month: string, note: string) {
    setMonthNotes(prev => {
      const next = note.trim() ? { ...prev, [month]: note.trim() } : (() => { const n = { ...prev }; delete n[month]; return n })()
      try { localStorage.setItem('asap-month-notes', JSON.stringify(next)) } catch {}
      return next
    })
    setEditingNote(null)
  }

  // Split events into outflows vs manual inflows
  const outflowEvents = useMemo(() => cashOutEvents.filter(e => !e.is_inflow), [cashOutEvents])
  const inflowEvents  = useMemo(() => cashOutEvents.filter(e =>  e.is_inflow), [cashOutEvents])

  const cashOutByMonth = useMemo(() => {
    const result: Record<string, number> = {}
    const monthsWithEvents = new Set(outflowEvents.map(e => e.date.slice(0, 7) + '-01'))
    for (const e of outflowEvents) {
      const m = e.date.slice(0, 7) + '-01'
      result[m] = (result[m] ?? 0) + e.amount_sek
    }
    // Months without confirmed events fall back to P&L costs estimate
    for (const m of ROLLING_MONTHS) {
      if (!monthsWithEvents.has(m) && aggData) {
        result[m] = aggData.costsByMonth[m] ?? 0
      }
    }
    return result
  }, [outflowEvents, aggData])

  const cashInManualByMonth = useMemo(() => {
    const result: Record<string, number> = {}
    for (const e of inflowEvents) {
      const m = e.date.slice(0, 7) + '-01'
      result[m] = (result[m] ?? 0) + e.amount_sek
    }
    return result
  }, [inflowEvents])

  const cashOutConfirmedMonths = useMemo(() =>
    new Set(outflowEvents.map(e => e.date.slice(0, 7) + '-01')),
  [outflowEvents])

  // Per-invoice VAT: 25% on domestic invoices, 0% on foreign (exclude_vat=true)
  // Manual inflows (tax refunds etc.) are entered as actual amounts — no multiplier
  const vatAdjustedCashByMonth = useMemo(() => {
    const result: Record<string, number> = {}
    for (const inv of invoices) {
      const cashDate = (inv.status === 'paid' && inv.paid_date) ? inv.paid_date : inv.due_date
      if (!cashDate) continue
      const m = cashDate.slice(0, 7) + '-01'
      const multiplier = inv.exclude_vat ? 1 : 1.25
      result[m] = (result[m] ?? 0) + inv.amount_sek * multiplier
    }
    return result
  }, [invoices])

  function totalCashIn(m: string): number {
    return (vatAdjustedCashByMonth[m] ?? 0) + (cashInManualByMonth[m] ?? 0)
  }

  function computeBankBalance(months: readonly string[]): Record<string, number | null> {
    const result: Record<string, number | null> = {}
    let running: number | null = null
    for (const m of months) {
      if (bankEntries[m] != null) {
        running = bankEntries[m]
      } else if (running != null) {
        running = running + totalCashIn(m) - (cashOutByMonth[m] ?? 0)
      }
      result[m] = running
    }
    return result
  }

  const bankBalanceByMonth       = useMemo(() => computeBankBalance(ROLLING_MONTHS),       [bankEntries, aggData, cashOutByMonth])
  const bankBalanceByMonthMobile = useMemo(() => computeBankBalance(THREE_ROLLING_MONTHS), [bankEntries, aggData, cashOutByMonth])

  // Monthly summaries for Allie
  const allieMonthlySummaries = useMemo((): CashBriefMonth[] => {
    if (!aggData) return []
    const curMonth = new Date().toISOString().slice(0, 7) + '-01'
    // 3-month horizon: current month + next 2
    const horizon = ROLLING_MONTHS.filter(m => m >= curMonth).slice(0, 3)
    return horizon.map(m => {
      const cashIn  = totalCashIn(m)
      const cashOut = cashOutByMonth[m] ?? 0
      return {
        month:            m,
        label:            new Date(m + 'T12:00:00').toLocaleString('en-SE', { month: 'short', year: '2-digit' }),
        cashIn,
        cashOut,
        cashOutConfirmed: cashOutConfirmedMonths.has(m),
        net:              cashIn - cashOut,
        balance:          bankBalanceByMonth[m] ?? null,
      }
    })
  }, [aggData, cashOutByMonth, cashOutConfirmedMonths, bankBalanceByMonth])

  // RAG computation: worst-case = ingoing - cashOut (all outflows before inflows)
  function computeRag(ingoing: number | null, cashOut: number): 'red' | 'orange' | 'green' | null {
    if (ingoing == null) return null
    const worst = ingoing - cashOut
    if (worst < 0)           return 'red'
    if (worst < 1_000_000)   return 'orange'
    return 'green'
  }

  function rowToInvoice(inv: InvoiceRow): Invoice {
    return {
      id:                     inv.id,
      manual_revenue_item_id: inv.manual_revenue_item_id ?? null,
      sow_document_id:        null,
      invoice_number:         inv.invoice_number,
      issue_date:             inv.issue_date,
      due_date:               inv.due_date,
      amount_sek:             inv.amount_sek,
      payment_trigger:        inv.payment_trigger as PaymentTrigger,
      milestone_label:        inv.milestone_label,
      status:                 inv.status as InvoiceStatus,
      paid_date:              inv.paid_date ?? null,
      notes:                  inv.notes,
      exclude_vat:            inv.exclude_vat,
      client_name:            inv.clientName,
      sort:                   0,
      created_at:             '',
      updated_at:             '',
      bl_status:              (inv.bl_status ?? null) as any,
      bl_invoice_id:          inv.bl_invoice_id    ?? null,
      bl_line_desc:           inv.bl_line_desc     ?? null,
      bl_reject_reason:       inv.bl_reject_reason ?? null,
      bl_rejected_at:         inv.bl_rejected_at   ?? null,
      bl_your_reference:      inv.bl_your_reference ?? null,
      bl_our_reference:       inv.bl_our_reference  ?? null,
      bl_po_number:           inv.bl_po_number      ?? null,
      bl_marking:             inv.bl_marking          ?? null,
      bl_allie_initiated:     inv.bl_allie_initiated  ?? false,
    }
  }

  function handleSaved(updated: InvoiceRow) {
    setInvoices(prev => sortByDate(prev.map(inv => inv.id === updated.id ? updated : inv)))
    setEditingInvoice(null)
  }

  const filteredInvoices = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return invoices
    return invoices.filter(inv =>
      (inv.clientName  ?? '').toLowerCase().includes(q) ||
      (inv.project     ?? '').toLowerCase().includes(q) ||
      inv.invoice_number.toLowerCase().includes(q) ||
      (inv.milestone_label ?? '').toLowerCase().includes(q) ||
      (inv.notes       ?? '').toLowerCase().includes(q)
    )
  }, [invoices, search])

  const activeInvoices = useMemo(() => {
    const active = filteredInvoices.filter(inv => inv.status !== 'paid')
    return [...active].sort((a, b) => {
      const aAlert = alertReason(a)
      const bAlert = alertReason(b)
      if (!!aAlert !== !!bAlert) return aAlert ? -1 : 1
      return a.due_date.localeCompare(b.due_date)
    })
  }, [filteredInvoices])

  const allPaid = useMemo(() => filteredInvoices.filter(inv => inv.status === 'paid'), [filteredInvoices])

  const paidYears = useMemo(() => {
    const ys = new Set(
      invoices
        .filter(i => i.status === 'paid')
        .map(i => parseInt((i.paid_date ?? i.issue_date).slice(0, 4)))
        .filter(y => !isNaN(y))
    )
    return [...ys].sort((a, b) => b - a)
  }, [invoices])

  const paidInvoices = useMemo(() =>
    allPaid
      .filter(inv => (inv.paid_date ?? inv.issue_date).startsWith(String(paidYear)))
      .sort((a, b) => (b.paid_date ?? b.issue_date).localeCompare(a.paid_date ?? a.issue_date)),
  [allPaid, paidYear])

  const paidOpenEffective = paidOpen || (!!search.trim() && allPaid.length > 0)

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

  const totalSek   = invoices.reduce((s, i) => s + i.amount_sek, 0)
  const paidSek    = invoices.filter(i => i.status === 'paid').reduce((s, i) => s + i.amount_sek, 0)
  const sentSek    = invoices.filter(i => i.status === 'sent').reduce((s, i) => s + i.amount_sek, 0)
  const alertCount = invoices.filter(i => alertReason(i) !== null).length

  const notifyChatDraft: InvoiceDraft | null = notifyingInvoice ? {
    id:              notifyingInvoice.id,
    invoice_number:  notifyingInvoice.invoice_number,
    issue_date:      notifyingInvoice.issue_date,
    due_date:        notifyingInvoice.due_date,
    amount_sek:      notifyingInvoice.amount_sek,
    payment_trigger: notifyingInvoice.payment_trigger as 'date' | 'milestone',
    milestone_label: notifyingInvoice.milestone_label ?? '',
    status:          notifyingInvoice.status as any,
    notes:           notifyingInvoice.notes ?? '',
  } : null

  return (
    <div className="min-h-screen bg-[#F9F9F8]">
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-5">

        <div>
          <div className="flex items-center justify-between gap-4">
            <div>
              <h1 className="text-xl font-bold text-[#0F0F0F] tracking-tight">Invoice Overview</h1>
              <p className="text-xs text-[#9CA3AF] mt-0.5">All invoices in chronological order</p>
            </div>
            <button
              onClick={() => setShowImport(true)}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-[#6B7280] border border-[#E5E7EB] rounded-xl hover:bg-[#F9F9F8] transition-colors flex-shrink-0"
            >
              <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                <path d="M14 4.5V14a2 2 0 01-2 2H4a2 2 0 01-2-2V2a2 2 0 012-2h5.5L14 4.5zm-3 0A1.5 1.5 0 019.5 3V1H4a1 1 0 00-1 1v12a1 1 0 001 1h8a1 1 0 001-1V4.5h-2z"/>
                <path d="M8 6.5a.5.5 0 01.5.5v3.793l1.146-1.147a.5.5 0 01.708.708l-2 2a.5.5 0 01-.708 0l-2-2a.5.5 0 01.708-.708L7.5 10.793V7a.5.5 0 01.5-.5z"/>
              </svg>
              Import Excel
            </button>
          </div>
        </div>

        {/* Summary tiles */}
        {!loading && invoices.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white rounded-2xl border border-[#EBEBEB] px-4 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF] mb-1">Total planned</p>
              <p className="text-lg font-bold text-[#0F0F0F]">{Math.round(totalSek / 1000).toLocaleString('sv-SE')} <span className="text-xs font-semibold text-[#6B7280]">kSEK</span></p>
            </div>
            <div className="bg-white rounded-2xl border border-[#EBEBEB] px-4 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF] mb-1">Paid</p>
              <p className="text-lg font-bold text-[#16A34A]">{Math.round(paidSek / 1000).toLocaleString('sv-SE')} <span className="text-xs font-semibold text-[#6B7280]">kSEK</span></p>
            </div>
            <div className="bg-white rounded-2xl border border-[#EBEBEB] px-4 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF] mb-1">Sent / outstanding</p>
              <p className="text-lg font-bold text-[#2563EB]">{Math.round(sentSek / 1000).toLocaleString('sv-SE')} <span className="text-xs font-semibold text-[#6B7280]">kSEK</span></p>
            </div>
            <div className="bg-white rounded-2xl border border-[#EBEBEB] px-4 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF] mb-1">Needs attention</p>
              <p className={`text-lg font-bold ${alertCount > 0 ? 'text-[#DC2626]' : 'text-[#9CA3AF]'}`}>
                {alertCount}
                <span className="text-xs font-semibold text-[#9CA3AF] ml-1">invoice{alertCount !== 1 ? 's' : ''}</span>
              </p>
            </div>
          </div>
        )}

        {/* Aggregate cash flow chart */}
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
                <>
                  <div className="sm:hidden">
                    <SowCashFlowChart
                      planCells={aggData.planByMonth}
                      invoicedByMonth={aggData.invoicedByMonth}
                      expectedByMonth={aggData.expectedByMonth}
                      costsByMonth={aggData.costsByMonth}
                      bankBalanceByMonth={bankBalanceByMonthMobile}
                      months={THREE_ROLLING_MONTHS}
                      minWidth={280}
                    />
                  </div>
                  <div className="hidden sm:block">
                    <SowCashFlowChart
                      planCells={aggData.planByMonth}
                      invoicedByMonth={aggData.invoicedByMonth}
                      expectedByMonth={aggData.expectedByMonth}
                      costsByMonth={aggData.costsByMonth}
                      bankBalanceByMonth={bankBalanceByMonth}
                      months={ROLLING_MONTHS}
                    />
                  </div>
                </>
              ) : (
                <div className="h-[220px] flex items-center justify-center">
                  <div className="w-5 h-5 border-2 border-[#61b5cc] border-t-transparent rounded-full animate-spin" />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Allie's cash brief */}
        <AllieCashBrief input={{ months: allieMonthlySummaries }} />

        {/* Cash position table */}
        <div className="bg-white rounded-2xl border border-[#E5E7EB] overflow-hidden shadow-sm">
          <button
            onClick={() => setCashPosOpen(o => !o)}
            className="w-full flex items-center justify-between px-5 py-3 bg-[#F8FAFC] border-b border-[#E5E7EB] hover:bg-[#F1F5F9] transition-colors"
          >
            <span className="text-[10px] font-bold text-[#64748B] uppercase tracking-widest">
              Cash position — monthly
            </span>
            <svg viewBox="0 0 16 16" fill="currentColor" className={`w-3 h-3 text-[#9CA3AF] transition-transform ${cashPosOpen ? '' : '-rotate-90'}`}>
              <path fillRule="evenodd" d="M1.646 4.646a.5.5 0 01.708 0L8 10.293l5.646-5.647a.5.5 0 01.708.708l-6 6a.5.5 0 01-.708 0l-6-6a.5.5 0 010-.708z" clipRule="evenodd" />
            </svg>
          </button>
          {cashPosOpen && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#F3F4F6]">
                    <th className="px-5 py-2.5 text-left  text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF] whitespace-nowrap">Month</th>
                    <th className="px-5 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF] whitespace-nowrap">Cash in (inc. VAT) ✎</th>
                    <th className="px-5 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF] whitespace-nowrap">Cash out ✎</th>
                    <th className="px-5 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF] whitespace-nowrap">Net</th>
                    <th className="px-5 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF] whitespace-nowrap">Ingoing balance (1st) ✎</th>
                    <th className="px-5 py-2.5 text-left  text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF] whitespace-nowrap">Risk</th>
                  </tr>
                </thead>
                <tbody>
                  {ROLLING_MONTHS.map((m, idx) => {
                    const cashIn   = totalCashIn(m)
                    const cashOut  = cashOutByMonth[m] ?? 0
                    const net      = cashIn - cashOut
                    const balance  = bankBalanceByMonth[m]
                    const isActual  = bankEntries[m] != null
                    const confirmed = cashOutConfirmedMonths.has(m)
                    const label   = new Date(m + 'T12:00:00').toLocaleString('en-SE', { month: 'short', year: '2-digit' })
                    const now     = new Date().toISOString().slice(0, 7) + '-01'
                    const rag     = computeRag(balance ?? null, cashOut)
                    const note    = monthNotes[m] ?? ''
                    const cellCls = 'cursor-pointer hover:bg-[#EFF9FF] transition-colors rounded'
                    const rowHighlight = rag === 'red' ? 'bg-[#FFF1F2]' : rag === 'orange' ? 'bg-[#FFFBEB]' : m === now ? 'bg-[#F0F9FF]' : ''
                    return (
                      <tr key={m} className={`${idx < ROLLING_MONTHS.length - 1 ? 'border-b border-[#F3F4F6]' : ''} ${rowHighlight}`}>
                        <td className="px-5 py-2.5 text-xs text-[#374151] whitespace-nowrap font-medium">{label}</td>
                        <td
                          className={`px-5 py-2.5 text-xs text-right whitespace-nowrap text-[#16A34A] ${cellCls}`}
                          onClick={() => { setBreakdownMode('cash_in'); setBreakdownMonth(m) }}
                          title="Edit cash in"
                        >
                          {cashIn ? `${Math.round(cashIn / 1000).toLocaleString('sv-SE')} k` : '—'}
                        </td>
                        <td
                          className={`px-5 py-2.5 text-xs text-right whitespace-nowrap ${cellCls}`}
                          onClick={() => { setBreakdownMode('cash_out'); setBreakdownMonth(m) }}
                          title="Edit cash out"
                        >
                          {cashOut ? (
                            <span className={confirmed ? 'text-[#DC2626] font-medium' : 'text-[#DC2626] opacity-50 italic'}>
                              {Math.round(cashOut / 1000).toLocaleString('sv-SE')} k
                            </span>
                          ) : <span className="text-[#9CA3AF]">—</span>}
                        </td>
                        <td className={`px-5 py-2.5 text-xs text-right whitespace-nowrap font-medium ${net > 0 ? 'text-[#16A34A]' : net < 0 ? 'text-[#DC2626]' : 'text-[#9CA3AF]'}`}>
                          {net !== 0 ? `${net > 0 ? '+' : ''}${Math.round(net / 1000).toLocaleString('sv-SE')} k` : '—'}
                        </td>
                        <td
                          className={`px-5 py-2.5 text-right whitespace-nowrap ${cellCls}`}
                          onClick={() => { setBreakdownMode('bank'); setBreakdownMonth(m) }}
                          title="Set bank balance anchor"
                        >
                          {balance != null ? (
                            <span className={`text-xs font-medium ${isActual ? 'text-[#0B7A9E]' : 'text-[#6B7280]'}`}>
                              {Math.round(balance / 1000).toLocaleString('sv-SE')} kSEK
                              {isActual && <span className="ml-1 text-[10px] font-normal opacity-60">actual</span>}
                            </span>
                          ) : <span className="text-xs text-[#D1D5DB]">—</span>}
                        </td>
                        {/* RAG dot + manual note */}
                        <td className="px-5 py-2.5 min-w-[180px]">
                          <div className="flex items-center gap-2">
                            {rag ? (
                              <span className={`w-3 h-3 rounded-full flex-shrink-0 ${
                                rag === 'red'    ? 'bg-[#DC2626]' :
                                rag === 'orange' ? 'bg-[#F59E0B]' :
                                'bg-[#16A34A]'
                              }`} />
                            ) : (
                              <span className="w-3 h-3 rounded-full flex-shrink-0 bg-[#E5E7EB]" />
                            )}
                            {editingNote === m ? (
                              <input
                                autoFocus
                                defaultValue={note}
                                onBlur={e => saveNote(m, e.target.value)}
                                onKeyDown={e => {
                                  if (e.key === 'Enter') saveNote(m, e.currentTarget.value)
                                  if (e.key === 'Escape') setEditingNote(null)
                                }}
                                className="flex-1 text-xs px-1.5 py-0.5 border border-[#61b5cc] rounded focus:outline-none"
                                placeholder="Add note…"
                              />
                            ) : (
                              <button
                                onClick={() => setEditingNote(m)}
                                className="flex-1 text-left text-xs text-[#374151] hover:text-[#0B7A9E] transition-colors truncate"
                              >
                                {note || <span className="text-[#D1D5DB]">Add note…</span>}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              <p className="px-5 py-3 text-[10px] text-[#9CA3AF] border-t border-[#F3F4F6]">
                Click Cash In, Cash Out, or Bank Balance cells to edit. Cash out faded = P&L estimate (no events entered yet).
              </p>
            </div>
          )}
        </div>

        {/* Active invoices */}
        <div className="bg-white rounded-2xl border border-[#E5E7EB] overflow-hidden shadow-sm">
          <div className="flex items-center gap-3 px-5 py-3 bg-[#F8FAFC] border-b border-[#E5E7EB]">
            <span className="text-[10px] font-bold text-[#64748B] uppercase tracking-widest whitespace-nowrap">
              Active invoices ({activeInvoices.length}{search ? ` of ${invoices.filter(i => i.status !== 'paid').length}` : ''})
            </span>
            <div className="flex-1 min-w-0 relative">
              <svg viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3 text-[#9CA3AF] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none">
                <path d="M11.742 10.344a6.5 6.5 0 10-1.397 1.398h-.001c.03.04.062.078.098.115l3.85 3.85a1 1 0 001.415-1.414l-3.85-3.85a1.007 1.007 0 00-.115-.099zm-5.242 1.656a5.5 5.5 0 110-11 5.5 5.5 0 010 11z"/>
              </svg>
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search client, invoice #…"
                className="w-full pl-7 pr-7 py-1 text-xs bg-white border border-[#EBEBEB] rounded-lg text-[#0F0F0F] placeholder-[#C4C9D4] focus:outline-none focus:ring-2 focus:ring-[#61b5cc] focus:border-transparent transition-all"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-[#9CA3AF] hover:text-[#374151]"
                >
                  <svg viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
                    <path d="M4.646 4.646a.5.5 0 01.708 0L8 7.293l2.646-2.647a.5.5 0 01.708.708L8.707 8l2.647 2.646a.5.5 0 01-.708.708L8 8.707l-2.646 2.647a.5.5 0 01-.708-.708L7.293 8 4.646 5.354a.5.5 0 010-.708z"/>
                  </svg>
                </button>
              )}
            </div>
          </div>

          {loading ? (
            <div className="p-5 space-y-3">
              {[80, 60, 90, 70, 50].map((w, i) => (
                <div key={i} className="h-4 bg-[#F3F4F6] rounded animate-pulse" style={{ width: `${w}%` }} />
              ))}
            </div>
          ) : activeInvoices.length === 0 ? (
            <p className="px-5 py-8 text-sm text-[#9CA3AF] text-center">
              {search ? 'No active invoices match your search.' : 'No active invoices.'}
            </p>
          ) : (
            <>
              {/* Mobile table — 3 columns, tap row to edit */}
              <table className="w-full text-sm sm:hidden">
                <thead>
                  <tr className="border-b border-[#F3F4F6]">
                    <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">Date / Client</th>
                    <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">Invoice</th>
                    <th className="px-4 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {activeInvoices.map((inv, idx) => {
                    const alert = alertReason(inv)
                    return (
                      <tr
                        key={inv.id}
                        onClick={() => setEditingInvoice(inv)}
                        className={`${idx < activeInvoices.length - 1 ? 'border-b border-[#F3F4F6]' : ''} active:bg-[#FAFAFA]`}
                      >
                        <td className="px-4 py-3">
                          <p className="text-[11px] text-[#9CA3AF] tabular-nums">{inv.issue_date}</p>
                          <p className="text-xs font-medium text-[#0F0F0F] mt-0.5">{inv.clientName ?? '—'}</p>
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-[11px] font-mono text-[#374151]">{inv.invoice_number}</p>
                          {inv.milestone_label && (
                            <p className="text-[11px] text-[#9CA3AF] mt-0.5 truncate max-w-[110px]">{inv.milestone_label}</p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {alert && <span className="w-1.5 h-1.5 rounded-full bg-[#DC2626] flex-shrink-0" title={alert} />}
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${STATUS_STYLE[inv.status] ?? 'bg-[#F3F4F6] text-[#6B7280]'}`}>
                              {inv.status.charAt(0).toUpperCase() + inv.status.slice(1)}
                            </span>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>

              {/* Desktop table — full columns */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#F3F4F6]">
                      <th className="px-5 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">Date</th>
                      <th className="px-5 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">Client</th>
                      <th className="px-5 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">Invoice #</th>
                      <th className="px-5 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">Description</th>
                      <th className="px-5 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">Amount</th>
                      <th className="px-5 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">Due</th>
                      <th className="px-5 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">Status</th>
                      {blBetaEnabled && <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">BL</th>}
                      <th className="px-3 py-2.5 w-8" />
                      <th className="px-3 py-2.5 w-8" />
                    </tr>
                  </thead>
                  <tbody>
                    {activeInvoices.map((inv, idx) => {
                      const alert = alertReason(inv)
                      return (
                        <tr
                          key={inv.id}
                          className={`${idx < activeInvoices.length - 1 ? 'border-b border-[#F3F4F6]' : ''} hover:bg-[#FAFAFA] group`}
                        >
                          <td className="px-5 py-3 text-xs text-[#374151] whitespace-nowrap">{inv.issue_date}</td>
                          <td className="px-5 py-3 text-xs font-medium text-[#0F0F0F]">
                            {inv.clientName ?? '—'}
                            {inv.project && (
                              <span className="ml-1.5 text-[#9CA3AF] font-normal">{inv.project}</span>
                            )}
                          </td>
                          <td className="px-5 py-3 text-xs text-[#374151] font-mono whitespace-nowrap">{inv.invoice_number}</td>
                          <td className="px-5 py-3 text-xs text-[#6B7280] max-w-[200px] truncate">{inv.milestone_label ?? '—'}</td>
                          <td className="px-5 py-3 text-xs font-medium text-[#0F0F0F] text-right whitespace-nowrap">
                            {inv.amount_sek.toLocaleString('sv-SE')} kr
                          </td>
                          <td className={`px-5 py-3 text-xs whitespace-nowrap ${alert && inv.due_date < TODAY && inv.status !== 'paid' ? 'text-[#DC2626] font-medium' : 'text-[#374151]'}`}>
                            {inv.due_date}
                          </td>
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-1.5">
                              {alert && (
                                <span className="w-1.5 h-1.5 rounded-full bg-[#DC2626] flex-shrink-0" title={alert} />
                              )}
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${STATUS_STYLE[inv.status] ?? 'bg-[#F3F4F6] text-[#6B7280]'}`}>
                                {inv.status.charAt(0).toUpperCase() + inv.status.slice(1)}
                              </span>
                            </div>
                          </td>
                          {blBetaEnabled && (
                            <td className="px-3 py-3">
                              {!inv.bl_status && inv.status === 'draft' && (
                                <button
                                  onClick={() => setBlSubmitRow(inv)}
                                  title="Send to Björn Lundén"
                                  className="text-[#D1D5DB] hover:text-[#0369A1] transition-colors opacity-0 group-hover:opacity-100"
                                >
                                  <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                                    <path d="M8 1a7 7 0 100 14A7 7 0 008 1zm3.5 7.5h-3v3a.5.5 0 01-1 0v-3h-3a.5.5 0 010-1h3v-3a.5.5 0 011 0v3h3a.5.5 0 010 1z"/>
                                  </svg>
                                </button>
                              )}
                              {inv.bl_status && (
                                <div className="flex items-center gap-1 group/bl">
                                  {inv.bl_status === 'pending' && (
                                    <button
                                      onClick={() => setBlApproveRow(inv)}
                                      className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium rounded-full bg-[#FFFBEB] text-[#B45309] hover:bg-[#FDE68A] transition-colors"
                                    >
                                      Pending
                                    </button>
                                  )}
                                  {inv.bl_status === 'approved' && (
                                    <span className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium rounded-full bg-[#F0FDF4] text-[#16A34A]">BL ✓</span>
                                  )}
                                  {inv.bl_status === 'rejected' && (
                                    <span title={inv.bl_reject_reason ?? 'Rejected'} className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium rounded-full bg-[#FFF1F2] text-[#DC2626] cursor-default">Rejected</span>
                                  )}
                                  <button
                                    onClick={() => setBlSubmitRow(inv)}
                                    title="Re-submit to BL"
                                    className="text-[#D1D5DB] hover:text-[#0369A1] transition-colors opacity-0 group-hover/bl:opacity-100"
                                  >
                                    <svg viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
                                      <path d="M11.534 7h3.932a.25.25 0 01.192.41l-1.966 2.36a.25.25 0 01-.384 0l-1.966-2.36a.25.25 0 01.192-.41zm-11 2h3.932a.25.25 0 00.192-.41L2.692 6.23a.25.25 0 00-.384 0L.342 8.59A.25.25 0 00.534 9z"/>
                                      <path fillRule="evenodd" d="M8 3c-1.552 0-2.94.707-3.857 1.818a.5.5 0 11-.771-.636A6.002 6.002 0 0113.917 7H12.9A5.002 5.002 0 008 3zM3.1 9a5.002 5.002 0 008.757 2.182.5.5 0 11.771.636A6.002 6.002 0 012.083 9H3.1z" clipRule="evenodd"/>
                                    </svg>
                                  </button>
                                </div>
                              )}
                            </td>
                          )}
                          <td className="px-3 py-3">
                            <button
                              onClick={() => setNotifyingInvoice(inv)}
                              className="text-[#D1D5DB] hover:text-[#61b5cc] transition-colors opacity-0 group-hover:opacity-100"
                              title="Notify team"
                            >
                              <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                                <path d="M14 1a1 1 0 011 1v8a1 1 0 01-1 1H4.414A2 2 0 003 11.586l-2 2V2a1 1 0 011-1h12zM2 0a2 2 0 00-2 2v12.793a.5.5 0 00.854.353l2.853-2.853A1 1 0 014.414 12H14a2 2 0 002-2V2a2 2 0 00-2-2H2z"/>
                              </svg>
                            </button>
                          </td>
                          <td className="px-3 py-3">
                            <button
                              onClick={() => setEditingInvoice(inv)}
                              className="text-[#D1D5DB] hover:text-[#374151] transition-colors opacity-0 group-hover:opacity-100"
                              title="Edit invoice"
                            >
                              <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                                <path d="M12.146.146a.5.5 0 01.708 0l3 3a.5.5 0 010 .708l-10 10a.5.5 0 01-.168.11l-5 2a.5.5 0 01-.65-.65l2-5a.5.5 0 01.11-.168l10-10zM11.207 2.5L13.5 4.793 14.793 3.5 12.5 1.207 11.207 2.5zm1.586 3L10.5 3.207 4 9.707V10h.5a.5.5 0 01.5.5v.5h.5a.5.5 0 01.5.5v.5h.293l6.5-6.5zm-9.761 5.175l-.106.106-1.528 3.821 3.821-1.528.106-.106A.5.5 0 015 12.5V12h-.5a.5.5 0 01-.5-.5V11h-.5a.5.5 0 01-.468-.325z"/>
                              </svg>
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        {/* Paid invoices */}
        {!loading && (
          <div className="bg-white rounded-2xl border border-[#E5E7EB] overflow-hidden shadow-sm">
            <button
              onClick={() => setPaidOpen(o => !o)}
              className="w-full flex items-center justify-between px-5 py-3 bg-[#F8FAFC] hover:bg-[#F3F4F6] transition-colors"
            >
              <div className="flex items-center gap-3">
                <span className="text-[10px] font-bold text-[#64748B] uppercase tracking-widest">
                  Paid invoices
                </span>
                {allPaid.length > 0 && (
                  <span className="text-[10px] text-[#9CA3AF]">
                    {allPaid.length} invoice{allPaid.length !== 1 ? 's' : ''} · {Math.round(allPaid.reduce((s, i) => s + i.amount_sek, 0) / 1000).toLocaleString('sv-SE')} kSEK
                  </span>
                )}
              </div>
              <svg viewBox="0 0 16 16" fill="currentColor" className={`w-3.5 h-3.5 text-[#9CA3AF] transition-transform flex-shrink-0 ${paidOpenEffective ? 'rotate-180' : ''}`}>
                <path d="M8 11L2 5h12z"/>
              </svg>
            </button>

            {paidOpenEffective && (
              <>
                {allPaid.length === 0 ? (
                  <p className="px-5 py-6 text-sm text-[#9CA3AF] text-center">
                    {search ? 'No paid invoices match your search.' : 'No paid invoices yet.'}
                  </p>
                ) : (
                  <>
                    {paidYears.length > 1 && (
                      <div className="flex gap-1.5 px-5 py-2.5 border-b border-[#F3F4F6] bg-[#FAFAFA]">
                        {paidYears.map(y => (
                          <button
                            key={y}
                            onClick={() => setPaidYear(y)}
                            className={`px-3 py-1 text-xs rounded-lg transition-colors ${paidYear === y ? 'bg-[#0F0F0F] text-white' : 'text-[#6B7280] hover:bg-[#F3F4F6]'}`}
                          >
                            {y}
                          </button>
                        ))}
                      </div>
                    )}
                    {paidInvoices.length === 0 ? (
                      <p className="px-5 py-6 text-sm text-[#9CA3AF] text-center">No paid invoices for {paidYear}.</p>
                    ) : (
                      <>
                        {/* Mobile paid */}
                        <table className="w-full text-sm sm:hidden">
                          <thead>
                            <tr className="border-b border-[#F3F4F6]">
                              <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">Paid / Client</th>
                              <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">Invoice</th>
                              <th className="px-4 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">Amount</th>
                            </tr>
                          </thead>
                          <tbody>
                            {paidInvoices.map((inv, idx) => (
                              <tr
                                key={inv.id}
                                onClick={() => setEditingInvoice(inv)}
                                className={`${idx < paidInvoices.length - 1 ? 'border-b border-[#F3F4F6]' : ''} active:bg-[#FAFAFA]`}
                              >
                                <td className="px-4 py-3">
                                  <p className="text-[11px] text-[#9CA3AF] tabular-nums">{inv.paid_date ?? inv.issue_date}</p>
                                  <p className="text-xs font-medium text-[#0F0F0F] mt-0.5">{inv.clientName ?? '—'}</p>
                                </td>
                                <td className="px-4 py-3">
                                  <p className="text-[11px] font-mono text-[#374151]">{inv.invoice_number}</p>
                                  {inv.milestone_label && (
                                    <p className="text-[11px] text-[#9CA3AF] mt-0.5 truncate max-w-[110px]">{inv.milestone_label}</p>
                                  )}
                                </td>
                                <td className="px-4 py-3 text-right text-xs font-medium text-[#0F0F0F] whitespace-nowrap">
                                  {Math.round(inv.amount_sek / 1000).toLocaleString('sv-SE')} k
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>

                        {/* Desktop paid */}
                        <div className="hidden sm:block overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b border-[#F3F4F6]">
                                <th className="px-5 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">Date</th>
                                <th className="px-5 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">Client</th>
                                <th className="px-5 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">Invoice #</th>
                                <th className="px-5 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">Description</th>
                                <th className="px-5 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">Amount</th>
                                <th className="px-5 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">Paid date</th>
                                <th className="px-3 py-2.5 w-8" />
                              </tr>
                            </thead>
                            <tbody>
                              {paidInvoices.map((inv, idx) => (
                                <tr
                                  key={inv.id}
                                  className={`${idx < paidInvoices.length - 1 ? 'border-b border-[#F3F4F6]' : ''} hover:bg-[#FAFAFA] group`}
                                >
                                  <td className="px-5 py-3 text-xs text-[#374151] whitespace-nowrap">{inv.issue_date}</td>
                                  <td className="px-5 py-3 text-xs font-medium text-[#0F0F0F]">
                                    {inv.clientName ?? '—'}
                                    {inv.project && <span className="ml-1.5 text-[#9CA3AF] font-normal">{inv.project}</span>}
                                  </td>
                                  <td className="px-5 py-3 text-xs text-[#374151] font-mono whitespace-nowrap">{inv.invoice_number}</td>
                                  <td className="px-5 py-3 text-xs text-[#6B7280] max-w-[200px] truncate">{inv.milestone_label ?? '—'}</td>
                                  <td className="px-5 py-3 text-xs font-medium text-[#0F0F0F] text-right whitespace-nowrap">
                                    {inv.amount_sek.toLocaleString('sv-SE')} kr
                                  </td>
                                  <td className="px-5 py-3 text-xs text-[#374151] whitespace-nowrap">
                                    {inv.paid_date ?? <span className="text-[#D1D5DB]">—</span>}
                                  </td>
                                  <td className="px-3 py-3">
                                    <button
                                      onClick={() => setEditingInvoice(inv)}
                                      className="text-[#D1D5DB] hover:text-[#374151] transition-colors opacity-0 group-hover:opacity-100"
                                      title="Edit invoice"
                                    >
                                      <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                                        <path d="M12.146.146a.5.5 0 01.708 0l3 3a.5.5 0 010 .708l-10 10a.5.5 0 01-.168.11l-5 2a.5.5 0 01-.65-.65l2-5a.5.5 0 01.11-.168l10-10zM11.207 2.5L13.5 4.793 14.793 3.5 12.5 1.207 11.207 2.5zm1.586 3L10.5 3.207 4 9.707V10h.5a.5.5 0 01.5.5v.5h.5a.5.5 0 01.5.5v.5h.293l6.5-6.5zm-9.761 5.175l-.106.106-1.528 3.821 3.821-1.528.106-.106A.5.5 0 015 12.5V12h-.5a.5.5 0 01-.5-.5V11h-.5a.5.5 0 01-.468-.325z"/>
                                      </svg>
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        )}

      </div>

      {/* Edit modal */}
      {editingInvoice && (
        <InvoiceEditModal
          invoice={editingInvoice}
          clients={clientItems}
          onSaved={handleSaved}
          onClose={() => setEditingInvoice(null)}
        />
      )}

      {blSubmitRow && (
        <BLSubmitModal
          invoice={rowToInvoice(blSubmitRow)}
          onDone={patch => {
            setInvoices(ivs => ivs.map(i => i.id === blSubmitRow.id ? { ...i, ...patch, client_name: undefined, clientName: i.clientName } as InvoiceRow : i))
            setBlSubmitRow(null)
          }}
          onClose={() => setBlSubmitRow(null)}
        />
      )}

      {blApproveRow && (
        <BLApproveModal
          invoice={rowToInvoice(blApproveRow)}
          isStub={blIsStub}
          onDone={patch => {
            setInvoices(ivs => ivs.map(i => i.id === blApproveRow.id ? { ...i, ...patch } as InvoiceRow : i))
            setBlApproveRow(null)
          }}
          onClose={() => setBlApproveRow(null)}
          onEdit={() => { setBlSubmitRow(blApproveRow); setBlApproveRow(null) }}
        />
      )}

      {/* Chat notify modal (direct from row icon) */}
      {notifyingInvoice && notifyChatDraft && (
        <ChatNotifyModal
          draft={notifyChatDraft}
          saved={null}
          clientName={notifyingInvoice.clientName}
          onClose={() => setNotifyingInvoice(null)}
        />
      )}

      {showImport && (
        <ImportInvoicesModal
          onImported={() => load()}
          onClose={() => setShowImport(false)}
        />
      )}

      {/* Cash position modal — column-specific */}
      {breakdownMonth && aggData && (
        <CashPositionModal
          mode={breakdownMode}
          month={breakdownMonth}
          invoiceRows={invoices.filter(inv =>
            inv.status !== 'paid' && inv.due_date.slice(0, 7) + '-01' === breakdownMonth
          )}
          manualInflows={inflowEvents.filter(e => e.date.slice(0, 7) + '-01' === breakdownMonth)}
          cashOutEvents={outflowEvents.filter(e => e.date.slice(0, 7) + '-01' === breakdownMonth)}
          bankEntry={bankEntries[breakdownMonth] ?? null}
          onEventsSaved={(updated, isInflow) => {
            const mStr = breakdownMonth
            setCashOutEvents(prev => [
              ...prev.filter(e => e.date.slice(0, 7) + '-01' !== mStr || e.is_inflow !== isInflow),
              ...updated,
            ].sort((a, b) => a.date.localeCompare(b.date)))
          }}
          onBankSaved={balance => {
            setBankEntries(prev => {
              const next = { ...prev }
              if (balance == null) delete next[breakdownMonth]
              else next[breakdownMonth] = balance
              return next
            })
          }}
          onClose={() => setBreakdownMonth(null)}
        />
      )}
    </div>
  )
}

export default function InvoiceOverviewPage() {
  return (
    <Suspense>
      <InvoiceOverviewContent />
    </Suspense>
  )
}
