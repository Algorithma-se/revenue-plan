'use client'

import { Suspense, useCallback, useEffect, useState } from 'react'
import { getAllDocumentsWithClients, getSowDownloadUrl, deleteSow, parseSow } from '@/app/actions/sow'
import { getAllInvoiceItems } from '@/app/actions/invoices'
import { SowUploadModal } from '@/components/sow/SowUploadModal'
import { SowTermsModal } from '@/components/sow/SowTermsModal'
import { useFeatureFlags } from '@/components/FeatureFlagsProvider'
import type { SowDocument, SowParsedRaw } from '@/types/database'

type AgreementDoc = {
  id: string
  manual_revenue_item_id: string
  document_type: string
  version_number: number
  file_name: string
  file_type: string
  storage_path: string
  file_size_bytes: number | null
  parsed_total_value_sek: number | null
  parsed_start_date: string | null
  parsed_end_date: string | null
  parsed_payment_terms: string | null
  parsed_raw: SowParsedRaw | null
  parse_status: string
  created_at: string
  clientName: string | null
  project: string | null
}

type ClientGroup = { key: string; docs: AgreementDoc[] }

const DOC_TYPE_BADGE: Record<string, string> = {
  original:       'bg-[#EFF6FF] text-[#2563EB]',
  amendment:      'bg-[#FFFBEB] text-[#B45309]',
  change_request: 'bg-[#FEF2F2] text-[#DC2626]',
}
const DOC_TYPE_LABEL: Record<string, string> = {
  original:       'Original',
  amendment:      'Amendment',
  change_request: 'CR',
}
const MODEL_BADGE: Record<string, string> = {
  capacity:          'bg-[#F0FDF4] text-[#16A34A]',
  milestone:         'bg-[#EFF6FF] text-[#2563EB]',
  time_and_materials:'bg-[#F5F3FF] text-[#7C3AED]',
  fixed_fee:         'bg-[#F3F4F6] text-[#6B7280]',
}
const MODEL_LABEL: Record<string, string> = {
  capacity:          'Capacity',
  milestone:         'Milestone',
  time_and_materials:'T&M',
  fixed_fee:         'Fixed fee',
}

function groupAndSort(docs: AgreementDoc[]): ClientGroup[] {
  const map = new Map<string, AgreementDoc[]>()
  for (const doc of docs) {
    const key = doc.clientName ?? doc.project ?? 'Unknown client'
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(doc)
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, ds]) => ({ key, docs: [...ds].sort((a, b) => a.version_number - b.version_number) }))
}

function fmtDate(iso: string | null) {
  return iso ? iso.slice(0, 7) : '—'
}

function AgreementsContent() {
  const { invoicesEnabled } = useFeatureFlags()

  const [groups,       setGroups]       = useState<ClientGroup[]>([])
  const [openGroups,   setOpenGroups]   = useState<Set<string>>(new Set())
  const [loading,      setLoading]      = useState(true)
  const [revenueItems, setRevenueItems] = useState<{ id: string; clientName: string | null; project: string | null }[]>([])
  const [showUpload,   setShowUpload]   = useState(false)
  const [editingDoc,   setEditingDoc]   = useState<AgreementDoc | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const [reparsingId,   setReparsingId]   = useState<string | null>(null)
  const [search,        setSearch]        = useState('')
  const [filterType,    setFilterType]    = useState<string | null>(null)
  const [filterModel,   setFilterModel]   = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const [docs, items] = await Promise.all([
        getAllDocumentsWithClients(),
        getAllInvoiceItems(),
      ])
      const grouped = groupAndSort(docs)
      setGroups(grouped)
      setOpenGroups(new Set(grouped.map(g => g.key)))
      setRevenueItems(items.map(i => ({ id: i.itemId, clientName: i.clientName, project: i.project })))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

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

  function toggleGroup(key: string) {
    setOpenGroups(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  function updateDoc(updated: AgreementDoc) {
    setGroups(prev => prev.map(g => ({
      ...g,
      docs: g.docs.map(d => d.id === updated.id ? updated : d),
    })))
  }

  function removeDoc(docId: string) {
    setGroups(prev =>
      prev
        .map(g => ({ ...g, docs: g.docs.filter(d => d.id !== docId) }))
        .filter(g => g.docs.length > 0)
    )
  }

  async function handleDownload(doc: AgreementDoc) {
    setDownloadingId(doc.id)
    try {
      const url = await getSowDownloadUrl(doc.storage_path)
      window.open(url, '_blank')
    } finally {
      setDownloadingId(null)
    }
  }

  async function handleReparse(doc: AgreementDoc) {
    setReparsingId(doc.id)
    updateDoc({ ...doc, parse_status: 'parsing' })
    try {
      const result = await parseSow(doc.id)
      if (result.data) updateDoc(result.data as unknown as AgreementDoc)
    } finally {
      setReparsingId(null)
    }
  }

  async function handleDelete(docId: string) {
    await deleteSow(docId)
    removeDoc(docId)
    setConfirmDelete(null)
  }

  function handleUploadDone(sow: SowDocument, itemId: string) {
    const item = revenueItems.find(i => i.id === itemId)
    const newDoc: AgreementDoc = {
      ...(sow as any),
      clientName: item?.clientName ?? null,
      project:    item?.project ?? null,
    }
    const key = newDoc.clientName ?? newDoc.project ?? 'Unknown client'
    setGroups(prev => {
      const existing = prev.find(g => g.key === key)
      if (existing) {
        return prev.map(g =>
          g.key === key
            ? { ...g, docs: [...g.docs, newDoc].sort((a, b) => a.version_number - b.version_number) }
            : g
        )
      }
      return [...prev, { key, docs: [newDoc] }].sort((a, b) => a.key.localeCompare(b.key))
    })
    setOpenGroups(prev => new Set([...prev, key]))
    setShowUpload(false)
  }

  const filteredGroups: ClientGroup[] = groups
    .map(g => {
      const q = search.trim().toLowerCase()
      const docs = g.docs.filter(doc => {
        if (filterType  && doc.document_type !== filterType)  return false
        if (filterModel && doc.parsed_raw?.invoicing_model !== filterModel) return false
        if (q) {
          const hay = [
            g.key,
            doc.file_name,
            doc.parsed_payment_terms ?? '',
            doc.project ?? '',
          ].join(' ').toLowerCase()
          if (!hay.includes(q)) return false
        }
        return true
      })
      return { ...g, docs }
    })
    .filter(g => g.docs.length > 0)

  const totalDocs   = groups.reduce((s, g) => s + g.docs.length, 0)
  const visibleDocs = filteredGroups.reduce((s, g) => s + g.docs.length, 0)
  const isFiltered  = !!search || !!filterType || !!filterModel

  return (
    <div className="min-h-screen bg-[#F9F9F8]">
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-5">

        {/* Heading + upload */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-[#0F0F0F] tracking-tight">Agreements</h1>
            <p className="text-xs text-[#9CA3AF] mt-0.5">SOW and contract documents by client</p>
          </div>
          <button
            onClick={() => setShowUpload(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-white bg-[#0F0F0F] rounded-xl hover:bg-[#374151] transition-colors whitespace-nowrap flex-shrink-0"
          >
            <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
              <path d="M.5 9.9a.5.5 0 01.5.5v2.5a1 1 0 001 1h12a1 1 0 001-1v-2.5a.5.5 0 011 0v2.5a2 2 0 01-2 2H2a2 2 0 01-2-2v-2.5a.5.5 0 01.5-.5z"/>
              <path d="M7.646 1.146a.5.5 0 01.708 0l3 3a.5.5 0 01-.708.708L8.5 2.707V11.5a.5.5 0 01-1 0V2.707L5.354 4.854a.5.5 0 11-.708-.708l3-3z"/>
            </svg>
            Upload agreement
          </button>
        </div>

        {/* Search + filters */}
        {!loading && totalDocs > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {/* Search input */}
            <div className="relative flex-1 min-w-[180px] max-w-xs">
              <svg viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3 text-[#9CA3AF] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none">
                <path d="M11.742 10.344a6.5 6.5 0 10-1.397 1.398h-.001c.03.04.062.078.098.115l3.85 3.85a1 1 0 001.415-1.414l-3.85-3.85a1.007 1.007 0 00-.115-.099zm-5.242 1.656a5.5 5.5 0 110-11 5.5 5.5 0 010 11z"/>
              </svg>
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search client, file…"
                className="w-full pl-7 pr-7 py-1.5 text-xs bg-white border border-[#EBEBEB] rounded-xl text-[#0F0F0F] placeholder-[#C4C9D4] focus:outline-none focus:ring-2 focus:ring-[#61b5cc] focus:border-transparent transition-all"
              />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-[#9CA3AF] hover:text-[#374151]">
                  <svg viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3"><path d="M4.646 4.646a.5.5 0 01.708 0L8 7.293l2.646-2.647a.5.5 0 01.708.708L8.707 8l2.647 2.646a.5.5 0 01-.708.708L8 8.707l-2.646 2.647a.5.5 0 01-.708-.708L7.293 8 4.646 5.354a.5.5 0 010-.708z"/></svg>
                </button>
              )}
            </div>

            {/* Doc type chips */}
            <div className="flex items-center gap-1">
              {(['original', 'amendment', 'change_request'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setFilterType(filterType === t ? null : t)}
                  className={`px-2.5 py-1 text-[11px] font-medium rounded-lg border transition-colors ${
                    filterType === t
                      ? `${DOC_TYPE_BADGE[t]} border-current`
                      : 'bg-white text-[#6B7280] border-[#E5E7EB] hover:border-[#9CA3AF]'
                  }`}
                >
                  {DOC_TYPE_LABEL[t]}
                </button>
              ))}
            </div>

            {/* Model chips */}
            <div className="flex items-center gap-1">
              {(['capacity', 'milestone', 'time_and_materials', 'fixed_fee'] as const).map(m => (
                <button
                  key={m}
                  onClick={() => setFilterModel(filterModel === m ? null : m)}
                  className={`px-2.5 py-1 text-[11px] font-medium rounded-lg border transition-colors ${
                    filterModel === m
                      ? `${MODEL_BADGE[m]} border-current`
                      : 'bg-white text-[#6B7280] border-[#E5E7EB] hover:border-[#9CA3AF]'
                  }`}
                >
                  {MODEL_LABEL[m]}
                </button>
              ))}
            </div>

            {/* Clear all */}
            {isFiltered && (
              <button
                onClick={() => { setSearch(''); setFilterType(null); setFilterModel(null) }}
                className="text-[11px] text-[#9CA3AF] hover:text-[#374151] transition-colors"
              >
                Clear
              </button>
            )}
          </div>
        )}

        {loading ? (
          <div className="space-y-3">
            {[1,2,3].map(i => (
              <div key={i} className="bg-white rounded-2xl border border-[#E5E7EB] p-5">
                <div className="h-4 bg-[#F3F4F6] rounded animate-pulse w-32 mb-4" />
                {[80, 60, 90].map((w, j) => (
                  <div key={j} className="h-3 bg-[#F3F4F6] rounded animate-pulse mb-2" style={{ width: `${w}%` }} />
                ))}
              </div>
            ))}
          </div>
        ) : groups.length === 0 ? (
          <div className="bg-white rounded-2xl border border-[#E5E7EB] p-12 text-center">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-10 h-10 mx-auto text-[#D1D5DB] mb-3">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
            </svg>
            <p className="text-sm text-[#6B7280]">No agreements on file. Upload your first document above.</p>
          </div>
        ) : (
          <>
            <p className="text-xs text-[#9CA3AF]">
              {isFiltered
                ? `${visibleDocs} of ${totalDocs} document${totalDocs !== 1 ? 's' : ''}`
                : `${totalDocs} document${totalDocs !== 1 ? 's' : ''} across ${groups.length} client${groups.length !== 1 ? 's' : ''}`
              }
            </p>
            {filteredGroups.length === 0 ? (
              <div className="bg-white rounded-2xl border border-[#E5E7EB] p-8 text-center">
                <p className="text-sm text-[#9CA3AF]">No documents match your search or filters.</p>
              </div>
            ) : filteredGroups.map(group => (
              <div key={group.key} className="bg-white rounded-2xl border border-[#E5E7EB] overflow-hidden shadow-sm">
                <button
                  onClick={() => toggleGroup(group.key)}
                  className="w-full flex items-center justify-between px-5 py-3 bg-[#F8FAFC] border-b border-[#E5E7EB] hover:bg-[#F1F5F9] transition-colors"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="text-sm font-semibold text-[#0F0F0F]">{group.key}</span>
                    <span className="text-[10px] font-medium text-[#9CA3AF] bg-[#F3F4F6] px-1.5 py-0.5 rounded-full">
                      {group.docs.length}
                    </span>
                  </div>
                  <svg viewBox="0 0 16 16" fill="currentColor" className={`w-3 h-3 text-[#9CA3AF] transition-transform ${openGroups.has(group.key) ? '' : '-rotate-90'}`}>
                    <path fillRule="evenodd" d="M1.646 4.646a.5.5 0 01.708 0L8 10.293l5.646-5.647a.5.5 0 01.708.708l-6 6a.5.5 0 01-.708 0l-6-6a.5.5 0 010-.708z" clipRule="evenodd" />
                  </svg>
                </button>

                {openGroups.has(group.key) && (
                  <>
                    {/* Mobile table */}
                    <table className="w-full text-sm sm:hidden">
                      <thead>
                        <tr className="border-b border-[#F3F4F6]">
                          <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">File / Type</th>
                          <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">Value / Period</th>
                          <th className="px-4 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.docs.map((doc, idx) => (
                          <tr key={doc.id} className={idx < group.docs.length - 1 ? 'border-b border-[#F3F4F6]' : ''}>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-1.5 mb-1">
                                <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${DOC_TYPE_BADGE[doc.document_type] ?? 'bg-[#F3F4F6] text-[#6B7280]'}`}>
                                  {DOC_TYPE_LABEL[doc.document_type] ?? doc.document_type}
                                </span>
                              </div>
                              {doc.file_type === 'manual' ? (
                                <p className="text-[11px] text-[#9CA3AF] italic">Manual terms</p>
                              ) : (
                                <button
                                  onClick={() => handleDownload(doc)}
                                  disabled={downloadingId === doc.id}
                                  className="flex items-center gap-1 text-[11px] text-[#2563EB] hover:underline disabled:opacity-50 text-left"
                                >
                                  {downloadingId === doc.id ? (
                                    <div className="w-2.5 h-2.5 border border-[#2563EB] border-t-transparent rounded-full animate-spin flex-shrink-0" />
                                  ) : (
                                    <svg viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3 flex-shrink-0">
                                      <path d="M.5 9.9a.5.5 0 01.5.5v2.5a1 1 0 001 1h12a1 1 0 001-1v-2.5a.5.5 0 011 0v2.5a2 2 0 01-2 2H2a2 2 0 01-2-2v-2.5a.5.5 0 01.5-.5z"/>
                                      <path d="M7.646 11.854a.5.5 0 00.708 0l3-3a.5.5 0 00-.708-.708L8.5 10.293V1.5a.5.5 0 00-1 0v8.793L5.354 8.146a.5.5 0 10-.708.708l3 3z"/>
                                    </svg>
                                  )}
                                  <span className="truncate max-w-[110px]">{doc.file_name}</span>
                                </button>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <p className="text-[11px] font-medium text-[#0F0F0F]">
                                {doc.parsed_total_value_sek ? `${Math.round(doc.parsed_total_value_sek / 1000)} kSEK` : '—'}
                              </p>
                              <p className="text-[11px] text-[#9CA3AF] mt-0.5">
                                {fmtDate(doc.parsed_start_date)} → {fmtDate(doc.parsed_end_date)}
                              </p>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <ParseStatusBadge status={doc.parse_status} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    {/* Desktop table */}
                    <div className="hidden sm:block overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-[#F3F4F6]">
                            <th className="px-5 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">Type</th>
                            <th className="px-5 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">File</th>
                            <th className="px-5 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">Value</th>
                            <th className="px-5 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">Period</th>
                            <th className="px-5 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">Model</th>
                            <th className="px-5 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">Terms</th>
                            <th className="px-5 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">Status</th>
                            <th className="px-5 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">Uploaded</th>
                            <th className="px-3 py-2.5 w-28" />
                          </tr>
                        </thead>
                        <tbody>
                          {group.docs.map((doc, idx) => (
                            confirmDelete === doc.id ? (
                              <tr key={doc.id} className={`${idx < group.docs.length - 1 ? 'border-b border-[#F3F4F6]' : ''} bg-[#FFF1F2]`}>
                                <td colSpan={9} className="px-5 py-3">
                                  <div className="flex items-center gap-3">
                                    <span className="text-xs text-[#DC2626] font-medium">Delete "{doc.file_name}"?</span>
                                    <button
                                      onClick={() => handleDelete(doc.id)}
                                      className="px-3 py-1 text-xs font-medium text-white bg-[#DC2626] rounded-lg hover:bg-[#B91C1C] transition-colors"
                                    >
                                      Delete
                                    </button>
                                    <button
                                      onClick={() => setConfirmDelete(null)}
                                      className="px-3 py-1 text-xs font-medium text-[#6B7280] border border-[#E5E7EB] rounded-lg hover:bg-[#F9F9F8] transition-colors"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ) : (
                              <tr key={doc.id} className={`${idx < group.docs.length - 1 ? 'border-b border-[#F3F4F6]' : ''} hover:bg-[#FAFAFA] group`}>
                                <td className="px-5 py-3">
                                  <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${DOC_TYPE_BADGE[doc.document_type] ?? 'bg-[#F3F4F6] text-[#6B7280]'}`}>
                                    {DOC_TYPE_LABEL[doc.document_type] ?? doc.document_type}
                                  </span>
                                </td>
                                <td className="px-5 py-3">
                                  {doc.file_type === 'manual' ? (
                                    <span className="text-xs text-[#9CA3AF] italic">Manual terms</span>
                                  ) : (
                                    <button
                                      onClick={() => handleDownload(doc)}
                                      disabled={downloadingId === doc.id}
                                      className="flex items-center gap-1.5 text-left group/file disabled:opacity-50"
                                      title="Open / download"
                                    >
                                      {downloadingId === doc.id ? (
                                        <div className="w-3 h-3 border border-[#61b5cc] border-t-transparent rounded-full animate-spin flex-shrink-0" />
                                      ) : (
                                        <svg viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3 text-[#9CA3AF] flex-shrink-0">
                                          <path d="M.5 9.9a.5.5 0 01.5.5v2.5a1 1 0 001 1h12a1 1 0 001-1v-2.5a.5.5 0 011 0v2.5a2 2 0 01-2 2H2a2 2 0 01-2-2v-2.5a.5.5 0 01.5-.5z"/>
                                          <path d="M7.646 11.854a.5.5 0 00.708 0l3-3a.5.5 0 00-.708-.708L8.5 10.293V1.5a.5.5 0 00-1 0v8.793L5.354 8.146a.5.5 0 10-.708.708l3 3z"/>
                                        </svg>
                                      )}
                                      <span className="text-xs text-[#2563EB] group-hover/file:underline truncate max-w-[160px]">{doc.file_name}</span>
                                    </button>
                                  )}
                                </td>
                                <td className="px-5 py-3 text-xs text-[#374151] text-right whitespace-nowrap">
                                  {doc.parsed_total_value_sek ? `${Math.round(doc.parsed_total_value_sek / 1000)} kSEK` : '—'}
                                </td>
                                <td className="px-5 py-3 text-xs text-[#6B7280] whitespace-nowrap">
                                  {fmtDate(doc.parsed_start_date)} → {fmtDate(doc.parsed_end_date)}
                                </td>
                                <td className="px-5 py-3">
                                  {(() => {
                                    const model = doc.parsed_raw?.invoicing_model ?? null
                                    return model ? (
                                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${MODEL_BADGE[model] ?? 'bg-[#F3F4F6] text-[#6B7280]'}`}>
                                        {MODEL_LABEL[model] ?? model}
                                      </span>
                                    ) : <span className="text-xs text-[#D1D5DB]">—</span>
                                  })()}
                                </td>
                                <td className="px-5 py-3 text-xs text-[#6B7280] max-w-[160px] truncate" title={doc.parsed_payment_terms ?? undefined}>
                                  {doc.parsed_payment_terms ? doc.parsed_payment_terms.slice(0, 30) + (doc.parsed_payment_terms.length > 30 ? '…' : '') : '—'}
                                </td>
                                <td className="px-5 py-3">
                                  <ParseStatusBadge status={doc.parse_status} />
                                </td>
                                <td className="px-5 py-3 text-xs text-[#9CA3AF] whitespace-nowrap">
                                  {doc.created_at.slice(0, 10)}
                                </td>
                                <td className="px-3 py-3">
                                  <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                    {doc.file_type !== 'manual' && (
                                      <button
                                        onClick={() => handleReparse(doc)}
                                        disabled={reparsingId === doc.id || doc.parse_status === 'parsing'}
                                        className="text-[#D1D5DB] hover:text-[#61b5cc] transition-colors"
                                        title="Re-parse with Claude"
                                      >
                                        {reparsingId === doc.id ? (
                                          <div className="w-3.5 h-3.5 border border-[#61b5cc] border-t-transparent rounded-full animate-spin" />
                                        ) : (
                                          <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                                            <path fillRule="evenodd" d="M8 3a5 5 0 104.546 2.914.5.5 0 00-.908-.417A4 4 0 118 4a.5.5 0 00-.5-.5h-.5A.5.5 0 007 4v1a1 1 0 001 1h1a.5.5 0 00.5-.5v-.5A.5.5 0 009.5 4.5H9V4a.5.5 0 00-.5-.5H8z" clipRule="evenodd"/>
                                            <path d="M8 3V1.5a.5.5 0 00-.854-.354l-2 2a.5.5 0 000 .708l2 2A.5.5 0 008 5.5V4z"/>
                                          </svg>
                                        )}
                                      </button>
                                    )}
                                    <button
                                      onClick={() => setEditingDoc(doc)}
                                      className="text-[#D1D5DB] hover:text-[#374151] transition-colors"
                                      title="Edit terms"
                                    >
                                      <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                                        <path d="M12.146.146a.5.5 0 01.708 0l3 3a.5.5 0 010 .708l-10 10a.5.5 0 01-.168.11l-5 2a.5.5 0 01-.65-.65l2-5a.5.5 0 01.11-.168l10-10zM11.207 2.5L13.5 4.793 14.793 3.5 12.5 1.207 11.207 2.5zm1.586 3L10.5 3.207 4 9.707V10h.5a.5.5 0 01.5.5v.5h.5a.5.5 0 01.5.5v.5h.293l6.5-6.5zm-9.761 5.175l-.106.106-1.528 3.821 3.821-1.528.106-.106A.5.5 0 015 12.5V12h-.5a.5.5 0 01-.5-.5V11h-.5a.5.5 0 01-.468-.325z"/>
                                      </svg>
                                    </button>
                                    <button
                                      onClick={() => setConfirmDelete(doc.id)}
                                      className="text-[#D1D5DB] hover:text-[#DC2626] transition-colors"
                                      title="Delete"
                                    >
                                      <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                                        <path d="M5.5 5.5A.5.5 0 016 6v6a.5.5 0 01-1 0V6a.5.5 0 01.5-.5zm2.5 0a.5.5 0 01.5.5v6a.5.5 0 01-1 0V6a.5.5 0 01.5-.5zm3 .5a.5.5 0 00-1 0v6a.5.5 0 001 0V6z"/>
                                        <path fillRule="evenodd" d="M14.5 3a1 1 0 01-1 1H13v9a2 2 0 01-2 2H5a2 2 0 01-2-2V4h-.5a1 1 0 01-1-1V2a1 1 0 011-1H6a1 1 0 011-1h2a1 1 0 011 1h3.5a1 1 0 011 1v1zM4.118 4L4 4.059V13a1 1 0 001 1h6a1 1 0 001-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z" clipRule="evenodd"/>
                                      </svg>
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            )
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>
            ))}
          </>
        )}
      </div>

      {showUpload && revenueItems.length > 0 && (
        <SowUploadModal
          items={revenueItems}
          onDone={handleUploadDone}
          onClose={() => setShowUpload(false)}
        />
      )}

      {editingDoc && (
        <SowTermsModal
          sow={editingDoc as unknown as SowDocument}
          allDocs={[editingDoc as unknown as SowDocument]}
          itemId={editingDoc.manual_revenue_item_id}
          onSaved={saved => {
            updateDoc(saved as unknown as AgreementDoc)
            setEditingDoc(null)
          }}
          onClose={() => setEditingDoc(null)}
        />
      )}
    </div>
  )
}

function ParseStatusBadge({ status }: { status: string }) {
  if (status === 'done') return (
    <span className="inline-flex items-center gap-1 text-[10px] font-medium text-[#16A34A]">
      <svg viewBox="0 0 12 12" fill="currentColor" className="w-3 h-3"><path d="M10.28 2.28a.75.75 0 00-1.06 0L4.5 7 2.78 5.28a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.06 0l5.25-5.25a.75.75 0 000-1.06z"/></svg>
      Done
    </span>
  )
  if (status === 'parsing' || status === 'pending') return (
    <span className="inline-flex items-center gap-1 text-[10px] font-medium text-[#9CA3AF]">
      <div className="w-2.5 h-2.5 border border-[#9CA3AF] border-t-transparent rounded-full animate-spin" />
      {status === 'parsing' ? 'Parsing…' : 'Pending'}
    </span>
  )
  if (status === 'error') return (
    <span className="inline-flex items-center gap-1 text-[10px] font-medium text-[#DC2626]">
      <svg viewBox="0 0 12 12" fill="currentColor" className="w-3 h-3"><path d="M6 1a5 5 0 100 10A5 5 0 006 1zm-.75 2.75a.75.75 0 011.5 0v2.5a.75.75 0 01-1.5 0v-2.5zm.75 5.5a.75.75 0 110-1.5.75.75 0 010 1.5z"/></svg>
      Error
    </span>
  )
  return <span className="text-[10px] text-[#9CA3AF]">{status}</span>
}

export default function AgreementsPage() {
  return (
    <Suspense>
      <AgreementsContent />
    </Suspense>
  )
}
