'use client'

import { useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { getFiscalMonths, monthLabel } from '@/lib/plan-utils'
import { importBudgetScenario } from '@/app/actions/budget'
import type { ImportRow } from '@/app/actions/budget'

interface Pod { id: string; name: string }

export function ImportScenarioModal({
  open, onClose, fyStart, pods, onImported,
}: {
  open:       boolean
  onClose:    () => void
  fyStart:    number
  pods:       Pod[]
  onImported: (scenarioId: string) => void
}) {
  const [name,       setName]       = useState('')
  const [rows,       setRows]       = useState<ImportRow[] | null>(null)
  const [warnings,   setWarnings]   = useState<string[]>([])
  const [parseError, setParseError] = useState<string | null>(null)
  const [importing,  setImporting]  = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const months = getFiscalMonths(fyStart)

  // Build label→month lookup: "aug 25" | "aug-25" → "2025-08-01"
  function buildMonthMap(): Record<string, string> {
    const map: Record<string, string> = {}
    for (const m of months) {
      const abbr = monthLabel(m).toLowerCase() // "aug"
      const yr   = m.slice(2, 4)               // "25"
      map[`${abbr} ${yr}`]  = m
      map[`${abbr}-${yr}`]  = m
      map[`${abbr}/${yr}`]  = m
    }
    return map
  }

  function downloadTemplate() {
    const monthHeaders = months.map(m => `${monthLabel(m)} ${m.slice(2, 4)}`)
    const podNames     = pods.map(p => p.name).join(' / ') || 'Pod A'

    const headers = ['Segment', 'Pod', 'Account Code', 'Type', 'Label', ...monthHeaders]
    const note    = ['# Amounts in kSEK. Segment: Platform | Services | Leadership. Type: Revenue | Cost.', ...Array(headers.length - 1).fill('')]
    const examples = [
      ['Platform', '',       '3100', 'Revenue', 'AOS Setup fees',           ...months.map(() => '')],
      ['Platform', '',       '4100', 'Cost',    'Hosting och Cloud Ops',    ...months.map(() => '')],
      [`Services`, podNames, '3400', 'Revenue', 'Client X',                 ...months.map(() => '')],
      [`Services`, podNames, '4400', 'Cost',    'Subcontractors',           ...months.map(() => '')],
      ['Leadership', '',     'corp', 'Cost',    'Leadership overhead',      ...months.map(() => '')],
    ]

    const ws = XLSX.utils.aoa_to_sheet([headers, note, ...examples])
    ws['!cols'] = [
      { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 10 }, { wch: 28 },
      ...months.map(() => ({ wch: 9 })),
    ]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Budget')
    XLSX.writeFile(wb, `budget-template-fy${fyStart}-${fyStart + 1}.xlsx`)
  }

  function parseFile(file: File) {
    const reader = new FileReader()
    reader.onload = e => {
      try {
        const wb  = XLSX.read(e.target?.result, { type: 'array' })
        const ws  = wb.Sheets[wb.SheetNames[0]]
        const raw = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: '' }) as any[][]

        if (raw.length < 2) { setParseError('File appears empty'); return }

        const hdrs     = (raw[0] as any[]).map(h => String(h ?? '').toLowerCase().trim())
        const segIdx   = hdrs.findIndex(h => h === 'segment')
        const podIdx   = hdrs.findIndex(h => h === 'pod')
        const codeIdx  = hdrs.findIndex(h => h.includes('code'))
        const typeIdx  = hdrs.findIndex(h => h === 'type')
        const labelIdx = hdrs.findIndex(h => h === 'label' || h === 'description')

        if (segIdx < 0 || typeIdx < 0 || labelIdx < 0) {
          setParseError('Missing required columns: Segment, Type, Label. Use the template.')
          return
        }

        const monthMap = buildMonthMap()
        const monthCols: { idx: number; month: string }[] = []
        hdrs.forEach((h, i) => {
          const m = monthMap[h.replace(/\s+/, ' ').trim()]
          if (m) monthCols.push({ idx: i, month: m })
        })

        if (monthCols.length === 0) {
          setParseError('No month columns matched. Ensure headers match the template (e.g. "Aug 25").')
          return
        }

        const podByName: Record<string, string> = {}
        for (const p of pods) podByName[p.name.toLowerCase()] = p.id

        const parsed: ImportRow[] = []
        const warns: string[] = []

        for (let ri = 1; ri < raw.length; ri++) {
          const row     = raw[ri] as any[]
          const segRaw  = String(row[segIdx]  ?? '').toLowerCase().trim()
          const label   = String(row[labelIdx] ?? '').trim()

          // Skip blank or comment rows
          if (!segRaw || segRaw.startsWith('#') || !label || label.startsWith('#')) continue

          let segment: ImportRow['segment']
          if      (segRaw === 'platform')   segment = 'platform'
          else if (segRaw === 'services')   segment = 'services'
          else if (segRaw === 'leadership') segment = 'leadership'
          else { warns.push(`Row ${ri + 1}: unknown segment "${segRaw}" — skipped`); continue }

          const typeRaw = String(row[typeIdx] ?? '').toLowerCase().trim()
          let lineType: ImportRow['lineType']
          if      (typeRaw === 'revenue' || typeRaw === 'rev') lineType = 'revenue'
          else if (typeRaw === 'cost'    || typeRaw === 'costs') lineType = 'cost'
          else { warns.push(`Row ${ri + 1}: unknown type "${typeRaw}" — skipped`); continue }

          let podId: string | null = null
          if (segment === 'services' && podIdx >= 0) {
            const podName = String(row[podIdx] ?? '').trim()
            if (podName) {
              podId = podByName[podName.toLowerCase()] ?? null
              if (!podId) warns.push(`Row ${ri + 1}: pod "${podName}" not found — imported without pod assignment`)
            }
          }

          const accountCode = codeIdx >= 0 ? String(row[codeIdx] ?? '').trim() : ''

          const amounts: Record<string, number> = {}
          for (const { idx, month } of monthCols) {
            const raw = row[idx]
            const num = typeof raw === 'number' ? raw : parseFloat(String(raw ?? '').replace(/[^0-9.-]/g, ''))
            if (!isNaN(num) && num !== 0) amounts[month] = num
          }

          parsed.push({ segment, podId, accountCode, lineType, label, amounts })
        }

        if (parsed.length === 0) {
          setParseError(warns.length > 0 ? warns.join('\n') : 'No valid data rows found.')
          return
        }

        setRows(parsed)
        setWarnings(warns)
        setParseError(null)
      } catch (err) {
        setParseError('Failed to read file: ' + (err instanceof Error ? err.message : String(err)))
      }
    }
    reader.readAsArrayBuffer(file)
  }

  async function handleImport() {
    if (!rows || !name.trim() || importing) return
    setImporting(true)
    const result = await importBudgetScenario(name.trim(), fyStart, rows)
    setImporting(false)
    if (result.ok) {
      onImported(result.scenarioId)
      handleClose()
    } else {
      setParseError(result.error)
    }
  }

  function handleClose() {
    setName(''); setRows(null); setWarnings([]); setParseError(null); setImporting(false)
    onClose()
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={e => e.target === e.currentTarget && handleClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 p-6">

        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-bold text-[#0F0F0F]">Import scenario from Excel</h2>
          <button onClick={handleClose} className="p-1.5 rounded-lg text-[#9CA3AF] hover:text-[#374151] hover:bg-[#F3F4F6] transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Scenario name */}
        <div className="mb-4">
          <label className="block text-xs font-semibold text-[#374151] mb-1.5">Scenario name</label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. Base Case FY25/26"
            className="w-full text-sm border border-[#E5E7EB] rounded-lg px-3 py-2 outline-none focus:border-[#61b5cc] focus:ring-1 focus:ring-[#61b5cc] transition-colors"
          />
        </div>

        {/* Template download */}
        <div className="mb-4 p-3 bg-[#EFF6FF] border border-[#BFDBFE] rounded-xl flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold text-[#1E40AF]">Download the template first</p>
            <p className="text-[11px] text-[#6B82A0] mt-0.5">Fill in amounts in kSEK, then upload below</p>
          </div>
          <button onClick={downloadTemplate}
            className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-white border border-[#BFDBFE] rounded-lg text-xs font-medium text-[#2563EB] hover:bg-[#EFF6FF] transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Template
          </button>
        </div>

        {/* File upload zone */}
        <div
          onClick={() => fileRef.current?.click()}
          className={`mb-4 border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
            rows
              ? 'border-[#16A34A] bg-[#F0FDF4]'
              : 'border-[#E5E7EB] hover:border-[#61b5cc] hover:bg-[#EFF9FC]'
          }`}
        >
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={e => {
              const file = e.target.files?.[0]
              if (!file) return
              if (!name) setName(file.name.replace(/\.[^.]+$/, ''))
              setRows(null); setWarnings([]); setParseError(null)
              parseFile(file)
              e.target.value = ''
            }}
          />
          {rows ? (
            <>
              <svg className="w-6 h-6 text-[#16A34A] mx-auto mb-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              <p className="text-sm font-semibold text-[#16A34A]">{rows.length} row{rows.length !== 1 ? 's' : ''} ready to import</p>
              <p className="text-xs text-[#6B7280] mt-0.5">Click to choose a different file</p>
            </>
          ) : (
            <>
              <svg className="w-6 h-6 text-[#9CA3AF] mx-auto mb-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l4-4m0 0l4 4m-4-4v12" />
              </svg>
              <p className="text-sm text-[#6B7280]">Click to upload <span className="font-medium text-[#374151]">.xlsx</span> file</p>
            </>
          )}
        </div>

        {/* Warnings */}
        {warnings.length > 0 && (
          <div className="mb-4 p-3 bg-[#FFFBEB] border border-[#FDE68A] rounded-xl">
            <p className="text-xs font-semibold text-[#92400E] mb-1">Imported with warnings</p>
            <ul className="text-xs text-[#92400E] space-y-0.5">
              {warnings.map((w, i) => <li key={i}>· {w}</li>)}
            </ul>
          </div>
        )}

        {/* Parse error */}
        {parseError && (
          <div className="mb-4 p-3 bg-[#FEF2F2] border border-[#FECACA] rounded-xl">
            <p className="text-xs text-[#DC2626] whitespace-pre-line">{parseError}</p>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end gap-2">
          <button onClick={handleClose}
            className="px-4 py-2 text-sm text-[#6B7280] hover:bg-[#F3F4F6] rounded-lg transition-colors">
            Cancel
          </button>
          <button
            onClick={handleImport}
            disabled={!rows || !name.trim() || importing}
            className="px-4 py-2 text-sm font-semibold bg-[#2563EB] text-white rounded-lg hover:bg-[#1D4ED8] disabled:opacity-40 transition-colors"
          >
            {importing ? 'Importing…' : 'Import scenario'}
          </button>
        </div>
      </div>
    </div>
  )
}
