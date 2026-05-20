'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { RevenueItem, RevenueAllocation, Pod } from '@/types/database'
import { ItemModal } from '@/components/ItemModal'

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

  const filtered    = filterType === 'all' ? items : items.filter(i => i.type === filterType)
  const selectedItem = items.find(i => i.id === selectedId)

  const fcTotal        = items.filter(i => i.type === 'forecast').reduce((s, i) => s + (i.amount ?? 0), 0)
  const bookedTotal    = items.filter(i => i.type === 'booking').reduce((s, i) => s + (i.amount ?? 0), 0)
  const allocatedTotal = items.filter(i => i.allocatedTotal > 0).reduce((s, i) => s + i.allocatedTotal, 0)

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

      {/* Desktop table */}
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
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

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
            // Delete existing allocations and re-insert (amounts already in SEK from ItemModal)
            await supabase.from('revenue_allocations').delete().eq('revenue_item_id', selectedItem.id)
            if (rows.length > 0) {
              const { error: insertErr } = await supabase.from('revenue_allocations').insert(
                rows.map(r => ({ revenue_item_id: selectedItem.id, month: r.month, amount: r.amount }))
              )
              if (insertErr) throw insertErr
            }
            const updates: Record<string, unknown> = {}
            if (notes !== (selectedItem.notes ?? '')) updates.notes = notes || null
            if (podId !== (selectedItem.pod_id ?? null)) updates.pod_id = podId
            if (Object.keys(updates).length > 0) {
              await supabase.from('revenue_items').update(updates).eq('id', selectedItem.id)
            }
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
