'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { RevenueItem, RevenueAllocation, Pod } from '@/types/database'
import { ItemModal } from '@/components/ItemModal'
import { monthLabel } from '@/lib/plan-utils'

interface ItemWithAllocations extends RevenueItem {
  allocations: RevenueAllocation[]
  allocatedTotal: number
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function WorkListPage() {
  const [items,      setItems]      = useState<ItemWithAllocations[]>([])
  const [pods,       setPods]       = useState<Pod[]>([])
  const [loading,    setLoading]    = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [filterType, setFilterType] = useState<'all' | 'forecast' | 'booking'>('all')
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [processedOpen, setProcessedOpen] = useState(false)

  async function removeItem(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    if (!confirm('Remove this item? This will also clear it from Sales Weekly.')) return
    setDeletingId(id)
    await fetch('/api/remove-item', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item_id: id }),
    })
    setDeletingId(null)
    loadData()
  }

  async function bringBack(id: string) {
    await supabase.from('revenue_items').update({ status: 'active' }).eq('id', id)
    loadData()
  }

  async function markProcessed(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    await supabase.from('revenue_items').update({ status: 'processed' }).eq('id', id)
    loadData()
  }

  async function loadData() {
    const [{ data: itemsData }, { data: allocsData }, { data: podsData }] = await Promise.all([
      supabase.from('revenue_items').select('*').order('synced_at', { ascending: false }),
      supabase.from('revenue_allocations').select('*'),
      supabase.from('pods').select('*').order('sort'),
    ])
    setPods((podsData ?? []) as Pod[])

    const allocs = (allocsData ?? []) as RevenueAllocation[]
    const withAllocs: ItemWithAllocations[] = ((itemsData ?? []) as RevenueItem[]).map(item => {
      const itemAllocs = allocs.filter(a => a.revenue_item_id === item.id)
      return {
        ...item,
        allocations: itemAllocs,
        allocatedTotal: itemAllocs.reduce((s, a) => s + a.amount, 0),
      }
    })
    setItems(withAllocs)
    setLoading(false)
  }

  useEffect(() => { loadData() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Split by status (default 'active' for rows without the column yet)
  const activeItems    = items.filter(i => (i.status ?? 'active') === 'active')
  const processedItems = items.filter(i => i.status === 'processed')

  const filtered       = filterType === 'all' ? activeItems : activeItems.filter(i => i.type === filterType)
  const selectedItem   = items.find(i => i.id === selectedId)

  const fcTotal        = activeItems.filter(i => i.type === 'forecast').reduce((s, i) => s + (i.amount ?? 0), 0)
  const bookedTotal    = activeItems.filter(i => i.type === 'booking').reduce((s, i) => s + (i.amount ?? 0), 0)
  const allocatedTotal = activeItems.filter(i => i.allocatedTotal > 0).reduce((s, i) => s + i.allocatedTotal, 0)

  const fmtKSEK = (v: number) => Math.round(v / 1000).toLocaleString('sv-SE')

  const btnBase   = "px-3 py-1.5 rounded-full text-sm font-medium border transition-all"
  const btnIdle   = "bg-white border-[#EBEBEB] text-[#6B7280] hover:border-[#D1D5DB] hover:text-[#0F0F0F]"
  const btnActive = "bg-[#F9F9F8] border-[#D1D5DB] text-[#0F0F0F]"

  // Build initial rows for modal — convert SEK→kSEK, or prepopulate from date range
  function getInitialRows(item: ItemWithAllocations): { month: string; amount: string }[] {
    if (item.allocations.length > 0) {
      return item.allocations
        .map(a => ({ month: a.month.slice(0, 7), amount: String(Math.round(a.amount / 1000)) }))
        .sort((a, b) => a.month.localeCompare(b.month))
    }
    if (item.start_month && item.end_month) {
      const months: string[] = []
      let [y, m] = item.start_month.slice(0, 7).split('-').map(Number)
      const [ey, em] = item.end_month.slice(0, 7).split('-').map(Number)
      let i = 0
      while ((y < ey || (y === ey && m <= em)) && i < 120) {
        months.push(`${y}-${String(m).padStart(2, '0')}`)
        m++; if (m > 12) { m = 1; y++ }; i++
      }
      const perMonthKSEK = months.length > 0 ? String(Math.round((item.amount ?? 0) / months.length / 1000)) : ''
      return months.map(month => ({ month, amount: perMonthKSEK }))
    }
    return []
  }

  // Push item to Revenue Plan: creates/updates a manual_revenue_item and marks as processed
  async function pushToPlan(item: ItemWithAllocations, data: {
    podId: string | null
    rows: { month: string; amount: number }[]
    notes: string
  }) {
    let manualItemId = item.plan_manual_item_id

    if (!manualItemId) {
      const { data: newItem, error } = await supabase
        .from('manual_revenue_items')
        .insert({
          pod_id: data.podId,
          client_name: item.client_name,
          project: null,
          sort: Math.floor(Date.now() / 1000),
        })
        .select()
        .single()
      if (error || !newItem) throw new Error(error?.message ?? 'Failed to create plan item')
      manualItemId = newItem.id
    } else {
      await supabase
        .from('manual_revenue_items')
        .update({ pod_id: data.podId, client_name: item.client_name })
        .eq('id', manualItemId)
    }

    // Replace cells
    await supabase.from('plan_revenue_cells').delete().eq('manual_revenue_item_id', manualItemId)
    if (data.rows.length > 0) {
      await supabase.from('plan_revenue_cells').insert(
        data.rows.map(r => ({
          manual_revenue_item_id: manualItemId,
          month: r.month,
          amount: r.amount,
          status: 'F',
        }))
      )
    }

    // Mark revenue_item as processed and link to plan row
    await supabase.from('revenue_items').update({
      status: 'processed',
      plan_manual_item_id: manualItemId,
      notes: data.notes || null,
      pod_id: data.podId,
    }).eq('id', item.id)
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-[#0F0F0F] tracking-tight">Work List</h1>
        <p className="text-sm text-[#6B7280] mt-1">Revenue pushed from Sales Weekly — allocate to months for P&L.</p>
      </div>

      {/* Hero tiles */}
      {!loading && (fcTotal > 0 || bookedTotal > 0) && (
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="bg-[#EFF6FF] border border-[#BFDBFE] rounded-2xl px-5 py-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-[#3B82F6] mb-1">Forecasted</p>
            <p className="text-2xl font-bold text-[#0F0F0F]">
              {fmtKSEK(fcTotal)} <span className="text-sm font-semibold text-[#6B7280]">kSEK</span>
            </p>
          </div>
          <div className="bg-[#F0FDF4] border border-[#BBF7D0] rounded-2xl px-5 py-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-[#16A34A] mb-1">Booked</p>
            <p className="text-2xl font-bold text-[#0F0F0F]">
              {fmtKSEK(bookedTotal)} <span className="text-sm font-semibold text-[#6B7280]">kSEK</span>
            </p>
          </div>
          <div className="bg-white border border-[#EBEBEB] rounded-2xl px-5 py-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-[#9CA3AF] mb-1">Allocated</p>
            <p className="text-2xl font-bold text-[#0F0F0F]">
              {fmtKSEK(allocatedTotal)} <span className="text-sm font-semibold text-[#6B7280]">kSEK</span>
            </p>
          </div>
        </div>
      )}

      {/* Filter bar */}
      <div className="flex gap-2 mb-4">
        <button onClick={() => setFilterType('all')}      className={`${btnBase} ${filterType === 'all'      ? btnActive : btnIdle}`}>All</button>
        <button onClick={() => setFilterType('forecast')} className={`${btnBase} ${filterType === 'forecast' ? btnActive : btnIdle}`}>FC only</button>
        <button onClick={() => setFilterType('booking')}  className={`${btnBase} ${filterType === 'booking'  ? btnActive : btnIdle}`}>Booked only</button>
      </div>

      {/* Mobile cards */}
      <div className="sm:hidden space-y-2 mb-6">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-[#EBEBEB] p-4 animate-pulse h-20" />
          ))
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-xl border border-[#EBEBEB] px-5 py-12 text-center text-[#9CA3AF] text-sm">
            No items yet. Push a forecast or booking from Sales Weekly.
          </div>
        ) : filtered.map(item => {
          const isFullyAllocated = item.amount != null && item.allocatedTotal >= item.amount && item.allocatedTotal > 0
          const isPartial = item.allocatedTotal > 0 && !isFullyAllocated
          return (
            <div
              key={item.id}
              onClick={() => setSelectedId(item.id)}
              className="bg-white rounded-xl border border-[#EBEBEB] p-4 cursor-pointer hover:border-[#61b5cc] transition-colors"
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold flex-shrink-0 ${
                    item.type === 'booking' ? 'bg-[#F0FDF4] text-[#16A34A]' : 'bg-[#EFF6FF] text-[#3B82F6]'
                  }`}>
                    {item.type === 'booking' ? 'Booked' : 'FC'}
                  </span>
                  <span className="font-semibold text-[#0F0F0F] truncate">{item.client_name ?? '—'}</span>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {isFullyAllocated ? (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold bg-[#F0FDF4] text-[#16A34A]">✓ Done</span>
                  ) : isPartial ? (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold bg-[#FFFBEB] text-[#B45309]">Partial</span>
                  ) : null}
                  <button
                    onClick={e => markProcessed(item.id, e)}
                    className="p-1 rounded-lg text-[#D1D5DB] hover:text-[#16A34A] hover:bg-[#F0FDF4] transition-colors"
                    title="Mark as processed (already in Revenue Plan)"
                  >
                    <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                      <path fillRule="evenodd" d="M13.854 3.646a.5.5 0 010 .708l-7 7a.5.5 0 01-.708 0l-3.5-3.5a.5.5 0 11.708-.708L6.5 10.293l6.646-6.647a.5.5 0 01.708 0z" clipRule="evenodd"/>
                    </svg>
                  </button>
                  <button
                    onClick={e => removeItem(item.id, e)}
                    disabled={deletingId === item.id}
                    className="p-1 rounded-lg text-[#D1D5DB] hover:text-[#EF4444] hover:bg-[#FFF1F2] transition-colors disabled:opacity-40"
                    title="Remove"
                  >
                    <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                      <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L8 6.586l2.293-2.293a1 1 0 111.414 1.414L9.414 8l2.293 2.293a1 1 0 01-1.414 1.414L8 9.414l-2.293 2.293a1 1 0 01-1.414-1.414L6.586 8 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-3 text-xs text-[#6B7280]">
                {item.rep_name && <span>{item.rep_name}</span>}
                {item.amount != null && <span className="font-semibold text-[#0F0F0F]">{fmtKSEK(item.amount)} kSEK</span>}
                {item.event_date && <span>{new Date(item.event_date).toLocaleDateString('sv-SE')}</span>}
              </div>
            </div>
          )
        })}
      </div>

      {/* Desktop table — active items */}
      <div className="hidden sm:block bg-white rounded-2xl border border-[#EBEBEB] overflow-hidden">
        <div className="overflow-y-auto max-h-[calc(100vh-300px)]">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10">
              <tr className="border-b border-[#EBEBEB] bg-[#F9F9F8]">
                <th className="text-left px-5 py-3.5 text-xs font-semibold uppercase tracking-wider text-[#6B7280]">Type</th>
                <th className="text-left px-5 py-3.5 text-xs font-semibold uppercase tracking-wider text-[#6B7280]">Client</th>
                <th className="text-left px-5 py-3.5 text-xs font-semibold uppercase tracking-wider text-[#6B7280]">Rep</th>
                <th className="text-right px-5 py-3.5 text-xs font-semibold uppercase tracking-wider text-[#6B7280]">Amount</th>
                <th className="text-left px-5 py-3.5 text-xs font-semibold uppercase tracking-wider text-[#6B7280]">Event date</th>
                <th className="text-left px-5 py-3.5 text-xs font-semibold uppercase tracking-wider text-[#6B7280]">Synced</th>
                <th className="text-left px-5 py-3.5 text-xs font-semibold uppercase tracking-wider text-[#6B7280]">Allocated</th>
                <th className="px-5 py-3.5" />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-[#F9F9F8]">
                    {Array.from({ length: 8 }).map((_, j) => (
                      <td key={j} className="px-5 py-3">
                        <div className="h-4 bg-[#F3F4F6] rounded-lg animate-pulse w-20" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-16 text-center text-[#9CA3AF] text-sm">
                    No items yet. Push a forecast or booking from Sales Weekly.
                  </td>
                </tr>
              ) : filtered.map(item => {
                const isFullyAllocated = item.amount != null && item.allocatedTotal >= item.amount && item.allocatedTotal > 0
                const isPartial = item.allocatedTotal > 0 && !isFullyAllocated
                return (
                  <tr
                    key={item.id}
                    onClick={() => setSelectedId(item.id)}
                    className="border-b border-[#F9F9F8] hover:bg-[#F9F9F8] transition-colors cursor-pointer"
                  >
                    <td className="px-5 py-3.5">
                      <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${
                        item.type === 'booking'
                          ? 'bg-[#F0FDF4] text-[#16A34A]'
                          : 'bg-[#EFF6FF] text-[#3B82F6]'
                      }`}>
                        {item.type === 'booking' ? 'Booked' : 'FC'}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 font-medium text-[#0F0F0F]">{item.client_name ?? '—'}</td>
                    <td className="px-5 py-3.5 text-[#6B7280]">{item.rep_name ?? '—'}</td>
                    <td className="px-5 py-3.5 text-right font-semibold text-[#0F0F0F] whitespace-nowrap">
                      {item.amount != null ? `${fmtKSEK(item.amount)} kSEK` : '—'}
                    </td>
                    <td className="px-5 py-3.5 text-[#6B7280] whitespace-nowrap">
                      {item.event_date ? new Date(item.event_date).toLocaleDateString('sv-SE') : '—'}
                    </td>
                    <td className="px-5 py-3.5 text-[#9CA3AF] whitespace-nowrap text-xs">
                      {new Date(item.synced_at).toLocaleDateString('sv-SE')}
                    </td>
                    <td className="px-5 py-3.5">
                      {isFullyAllocated ? (
                        <span className="text-[11px] px-2 py-0.5 rounded-full font-semibold bg-[#F0FDF4] text-[#16A34A]">✓ Done</span>
                      ) : isPartial ? (
                        <span className="text-[11px] px-2 py-0.5 rounded-full font-semibold bg-[#FFFBEB] text-[#B45309]">
                          {fmtKSEK(item.allocatedTotal)} kSEK
                        </span>
                      ) : (
                        <span className="text-xs text-[#D1D5DB]">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3.5">
                      <div className="flex items-center gap-0.5">
                        <button
                          onClick={e => markProcessed(item.id, e)}
                          className="p-1.5 rounded-lg text-[#D1D5DB] hover:text-[#16A34A] hover:bg-[#F0FDF4] transition-colors"
                          title="Mark as processed (already in Revenue Plan)"
                        >
                          <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                            <path fillRule="evenodd" d="M13.854 3.646a.5.5 0 010 .708l-7 7a.5.5 0 01-.708 0l-3.5-3.5a.5.5 0 11.708-.708L6.5 10.293l6.646-6.647a.5.5 0 01.708 0z" clipRule="evenodd"/>
                          </svg>
                        </button>
                        <button
                          onClick={e => removeItem(item.id, e)}
                          disabled={deletingId === item.id}
                          className="p-1.5 rounded-lg text-[#D1D5DB] hover:text-[#EF4444] hover:bg-[#FFF1F2] transition-colors disabled:opacity-40"
                          title="Remove"
                        >
                          <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L8 6.586l2.293-2.293a1 1 0 111.414 1.414L9.414 8l2.293 2.293a1 1 0 01-1.414 1.414L8 9.414l-2.293 2.293a1 1 0 01-1.414-1.414L6.586 8 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Processed section */}
      {!loading && processedItems.length > 0 && (
        <div className="mt-8">
          <button
            onClick={() => setProcessedOpen(o => !o)}
            className="flex items-center gap-2 mb-3 group"
          >
            <svg
              viewBox="0 0 16 16"
              fill="currentColor"
              className={`w-3.5 h-3.5 text-[#9CA3AF] transition-transform duration-200 ${processedOpen ? 'rotate-0' : '-rotate-90'}`}
            >
              <path fillRule="evenodd" d="M1.646 4.646a.5.5 0 01.708 0L8 10.293l5.646-5.647a.5.5 0 01.708.708l-6 6a.5.5 0 01-.708 0l-6-6a.5.5 0 010-.708z" clipRule="evenodd" />
            </svg>
            <h2 className="text-sm font-semibold text-[#6B7280] group-hover:text-[#374151] transition-colors">
              Processed
            </h2>
            <span className="text-xs text-white bg-[#9CA3AF] px-1.5 py-0.5 rounded-full font-medium">
              {processedItems.length}
            </span>
          </button>

          {processedOpen && (
            <div className="bg-white rounded-2xl border border-[#EBEBEB] overflow-hidden">
              {processedItems.map((item, idx) => (
                <div
                  key={item.id}
                  className={`flex items-center justify-between px-5 py-3 transition-colors hover:bg-[#F9F9F8] ${idx < processedItems.length - 1 ? 'border-b border-[#F3F4F6]' : ''}`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold flex-shrink-0 ${
                      item.type === 'booking' ? 'bg-[#F0FDF4] text-[#16A34A]' : 'bg-[#EFF6FF] text-[#3B82F6]'
                    }`}>
                      {item.type === 'booking' ? 'Booked' : 'FC'}
                    </span>
                    <span className="text-sm font-medium text-[#374151] truncate">{item.client_name ?? '—'}</span>
                    {item.amount != null && (
                      <span className="text-xs text-[#9CA3AF] whitespace-nowrap">{fmtKSEK(item.amount)} kSEK</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0 ml-4">
                    <span className="text-[11px] text-[#9CA3AF] flex items-center gap-1">
                      <svg viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
                        <path fillRule="evenodd" d="M1 8a.5.5 0 01.5-.5h11.793l-3.147-3.146a.5.5 0 01.708-.708l4 4a.5.5 0 010 .708l-4 4a.5.5 0 01-.708-.708L13.293 8.5H1.5A.5.5 0 011 8z" clipRule="evenodd" />
                      </svg>
                      P&L
                    </span>
                    <button
                      onClick={() => bringBack(item.id)}
                      className="text-xs px-3 py-1.5 rounded-lg font-medium text-[#6B7280] bg-[#F3F4F6] hover:bg-[#E5E7EB] hover:text-[#374151] transition-colors"
                    >
                      Bring back
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Item modal */}
      {selectedItem && (
        <ItemModal
          mode="synced"
          displayName={selectedItem.client_name ?? 'Unknown client'}
          subtitle={[
            selectedItem.rep_name,
            selectedItem.amount != null ? `${fmtKSEK(selectedItem.amount)} kSEK` : null,
            selectedItem.type === 'booking' ? 'Booked' : 'FC',
            selectedItem.event_date ? new Date(selectedItem.event_date).toLocaleDateString('sv-SE') : null,
          ].filter(Boolean).join(' · ')}
          pods={pods}
          initialPodId={selectedItem.pod_id ?? null}
          initialRows={getInitialRows(selectedItem)}
          referenceKSEK={selectedItem.amount != null ? Math.round(selectedItem.amount / 1000) : undefined}
          initialNotes={selectedItem.notes ?? ''}
          onClose={() => setSelectedId(null)}
          onSave={async ({ podId, rows, notes }) => {
            if (rows.length === 0) {
              // No allocation rows — just update metadata without pushing to plan
              const updates: Record<string, unknown> = {}
              if (notes !== (selectedItem.notes ?? '')) updates.notes = notes || null
              if (podId !== (selectedItem.pod_id ?? null)) updates.pod_id = podId
              if (Object.keys(updates).length > 0) {
                await supabase.from('revenue_items').update(updates).eq('id', selectedItem.id)
              }
              setSelectedId(null)
              loadData()
              return
            }

            // Show confirmation before pushing to Revenue Plan
            const pod      = pods.find(p => p.id === podId)
            const total    = rows.reduce((s, r) => s + r.amount, 0)
            const monthBreakdown = rows
              .map(r => {
                const label = monthLabel(r.month)
                return `${label}: ${Math.round(r.amount / 1000)} kSEK`
              })
              .join(', ')

            const confirmed = confirm(
              `Push to Revenue Plan?\n\n` +
              `Client: ${selectedItem.client_name ?? '—'}\n` +
              `Pod: ${pod?.name ?? '—'}\n` +
              `Total: ${Math.round(total / 1000).toLocaleString('sv-SE')} kSEK\n` +
              `Months: ${monthBreakdown}\n\n` +
              `This will create/update the row in the P&L and move the item to Processed.`
            )

            if (!confirmed) return  // onSave resolves (saving → false), modal stays open

            await pushToPlan(selectedItem, { podId, rows, notes })
            setSelectedId(null)
            loadData()
          }}
          onDelete={async () => {
            await fetch('/api/remove-item', {
              method: 'DELETE',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ item_id: selectedItem.id }),
            })
            setSelectedId(null)
            loadData()
          }}
        />
      )}
    </div>
  )
}
