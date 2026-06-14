'use client'

import { useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { importInvoices } from '@/app/actions/invoices'
import type { ImportInvoiceRow } from '@/app/actions/invoices'
import type { InvoiceStatus } from '@/types/database'

interface Props {
  onImported: () => void
  onClose:    () => void
}

const TEMPLATE_HEADERS = [
  'Client name', 'Invoice #', 'Issue date', 'Due date',
  'Amount (kSEK)', 'Label', 'Notes', 'Status',
]

const STATUS_OPTIONS: InvoiceStatus[] = ['draft', 'sent', 'paid']

function parseDate(raw: unknown): string {
  if (!raw) return ''
  // Excel serial date number
  if (typeof raw === 'number') {
    const d = XLSX.SSF.parse_date_code(raw)
    return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`
  }
  const s = String(raw).trim()
  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  // Try DD/MM/YYYY or MM/DD/YYYY
  const parts = s.split(/[\/\-\.]/)
  if (parts.length === 3) {
    const [a, b, c] = parts.map(Number)
    if (c > 1900) return `${c}-${String(b).padStart(2, '0')}-${String(a).padStart(2, '0')}`
    if (a > 1900) return `${a}-${String(b).padStart(2, '0')}-${String(c).padStart(2, '0')}`
  }
  return s
}

function normaliseStatus(raw: unknown): InvoiceStatus {
  const s = String(raw ?? '').toLowerCase().trim()
  if (s === 'sent') return 'sent'
  if (s === 'paid') return 'paid'
  return 'draft'
}

function downloadTemplate() {
  const wb = XLSX.utils.book_new()
  const exampleRows = [
    ['Autoliv', 'AUT-001', '2026-06-30', '2026-07-30', 500, 'May capacity', '', 'draft'],
    ['BHG',     'BHG-001', '2026-06-30', '2026-07-30', 250, '',             '', 'sent'],
  ]
  const ws = XLSX.utils.aoa_to_sheet([TEMPLATE_HEADERS, ...exampleRows])
  ws['!cols'] = [16, 14, 12, 12, 14, 24, 24, 10].map(w => ({ wch: w }))
  XLSX.utils.book_append_sheet(wb, ws, 'Invoices')
  XLSX.writeFile(wb, 'asap-invoice-template.xlsx')
}

export function ImportInvoicesModal({ onImported, onClose }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [rows,     setRows]     = useState<ImportInvoiceRow[]>([])
  const [errors,   setErrors]   = useState<string[]>([])
  const [fileName, setFileName] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [result,   setResult]   = useState<{ imported: number; unmatched: string[] } | null>(null)

  function handleFile(file: File) {
    if (!file) return
    setFileName(file.name)
    setErrors([])
    setRows([])
    setResult(null)

    const reader = new FileReader()
    reader.onload = e => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer)
        const wb   = XLSX.read(data, { type: 'array', cellDates: false })
        const ws   = wb.Sheets[wb.SheetNames[0]]
        const raw  = XLSX.utils.sheet_to_json(ws, { header: 1 }) as unknown[][]

        if (raw.length < 2) { setErrors(['No data rows found.']); return }

        const header = (raw[0] as string[]).map(h => String(h ?? '').toLowerCase().trim())
        const colIdx = (name: string) => header.indexOf(name.toLowerCase())

        const iClient  = colIdx('client name')
        const iNum     = colIdx('invoice #')
        const iIssue   = colIdx('issue date')
        const iDue     = colIdx('due date')
        const iAmount  = colIdx('amount (ksek)')
        const iLabel   = colIdx('label')
        const iNotes   = colIdx('notes')
        const iStatus  = colIdx('status')

        const missing: string[] = []
        if (iClient < 0)  missing.push('Client name')
        if (iIssue  < 0)  missing.push('Issue date')
        if (iDue    < 0)  missing.push('Due date')
        if (iAmount < 0)  missing.push('Amount (kSEK)')
        if (missing.length) { setErrors([`Missing required columns: ${missing.join(', ')}`]); return }

        const rowErrors: string[] = []
        const parsed: ImportInvoiceRow[] = []

        raw.slice(1).forEach((row, i) => {
          const client = String(row[iClient] ?? '').trim()
          if (!client) return  // skip blank rows
          const amountK = parseFloat(String(row[iAmount] ?? '0').replace(',', '.'))
          if (isNaN(amountK) || amountK <= 0) {
            rowErrors.push(`Row ${i + 2}: amount "${row[iAmount]}" is not a valid number`)
            return
          }
          const issue = parseDate(row[iIssue])
          const due   = parseDate(row[iDue])
          if (!issue || !due) {
            rowErrors.push(`Row ${i + 2}: could not parse dates`)
            return
          }
          const num = String(row[iNum] ?? `INV-${String(i + 1).padStart(3, '0')}`).trim()
          parsed.push({
            clientName:    client,
            invoiceNumber: num,
            issueDate:     issue,
            dueDate:       due,
            amountSek:     Math.round(amountK * 1000),
            label:         iLabel >= 0 ? String(row[iLabel] ?? '').trim() || null : null,
            notes:         iNotes >= 0 ? String(row[iNotes] ?? '').trim() || null : null,
            status:        normaliseStatus(row[iStatus]),
          })
        })

        setErrors(rowErrors)
        setRows(parsed)
      } catch (err) {
        setErrors([`Could not read file: ${err instanceof Error ? err.message : 'Unknown error'}`])
      }
    }
    reader.readAsArrayBuffer(file)
  }

  async function handleImport() {
    if (rows.length === 0) return
    setImporting(true)
    try {
      const res = await importInvoices(rows)
      setResult(res)
      onImported()
    } catch (err) {
      setErrors([err instanceof Error ? err.message : 'Import failed'])
    } finally {
      setImporting(false)
    }
  }

  const uniqueClients = [...new Set(rows.map(r => r.clientName))]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#F3F4F6] flex-shrink-0">
          <div>
            <h2 className="text-sm font-bold text-[#0F0F0F]">Import invoices from Excel</h2>
            <p className="text-[10px] text-[#9CA3AF] mt-0.5">Upload a spreadsheet to bulk-add invoices</p>
          </div>
          <button onClick={onClose} className="text-[#9CA3AF] hover:text-[#6B7280] transition-colors">
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">

          {/* Template download */}
          <div className="flex items-center justify-between px-4 py-3 bg-[#F8FAFC] border border-[#E5E7EB] rounded-xl">
            <div>
              <p className="text-xs font-medium text-[#374151]">Step 1 — Download the template</p>
              <p className="text-[10px] text-[#9CA3AF] mt-0.5">
                Columns: {TEMPLATE_HEADERS.join(' · ')}
              </p>
            </div>
            <button
              onClick={downloadTemplate}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#2563EB] border border-[#BFDBFE] bg-[#EFF6FF] rounded-lg hover:bg-[#DBEAFE] transition-colors flex-shrink-0 ml-3"
            >
              <svg viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
                <path d="M.5 9.9a.5.5 0 01.5.5v2.5a1 1 0 001 1h12a1 1 0 001-1v-2.5a.5.5 0 011 0v2.5a2 2 0 01-2 2H2a2 2 0 01-2-2v-2.5a.5.5 0 01.5-.5z"/>
                <path d="M7.646 11.854a.5.5 0 00.708 0l3-3a.5.5 0 00-.708-.708L8.5 10.293V1.5a.5.5 0 00-1 0v8.793L5.354 8.146a.5.5 0 10-.708.708l3 3z"/>
              </svg>
              Template
            </button>
          </div>

          {/* Upload */}
          <div>
            <p className="text-xs font-medium text-[#374151] mb-2">Step 2 — Upload your file</p>
            <div
              onClick={() => inputRef.current?.click()}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
              className="border-2 border-dashed border-[#E5E7EB] rounded-xl p-6 text-center cursor-pointer hover:border-[#61b5cc] transition-colors"
            >
              <input
                ref={inputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
              />
              {fileName ? (
                <p className="text-sm font-medium text-[#374151]">{fileName}</p>
              ) : (
                <>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-8 h-8 mx-auto text-[#D1D5DB] mb-2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                  </svg>
                  <p className="text-sm text-[#6B7280]">Drop .xlsx or .csv here, or click to browse</p>
                </>
              )}
            </div>
          </div>

          {/* Errors */}
          {errors.length > 0 && (
            <div className="px-3 py-2.5 bg-[#FFF1F2] border border-[#FECDD3] rounded-xl space-y-1">
              {errors.map((e, i) => (
                <p key={i} className="text-xs text-[#DC2626]">{e}</p>
              ))}
            </div>
          )}

          {/* Preview */}
          {rows.length > 0 && !result && (
            <div>
              <p className="text-xs font-medium text-[#374151] mb-2">
                Step 3 — Preview ({rows.length} invoice{rows.length !== 1 ? 's' : ''} across {uniqueClients.length} client{uniqueClients.length !== 1 ? 's' : ''})
              </p>
              <div className="border border-[#E5E7EB] rounded-xl overflow-hidden max-h-52 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-[#F8FAFC] border-b border-[#E5E7EB]">
                      <th className="px-3 py-2 text-left text-[10px] font-semibold text-[#9CA3AF]">Client</th>
                      <th className="px-3 py-2 text-left text-[10px] font-semibold text-[#9CA3AF]">Invoice #</th>
                      <th className="px-3 py-2 text-left text-[10px] font-semibold text-[#9CA3AF]">Issue</th>
                      <th className="px-3 py-2 text-left text-[10px] font-semibold text-[#9CA3AF]">Due</th>
                      <th className="px-3 py-2 text-right text-[10px] font-semibold text-[#9CA3AF]">kSEK</th>
                      <th className="px-3 py-2 text-left text-[10px] font-semibold text-[#9CA3AF]">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={i} className={`${i < rows.length - 1 ? 'border-b border-[#F3F4F6]' : ''}`}>
                        <td className="px-3 py-2 text-[#374151] truncate max-w-[120px]">{r.clientName}</td>
                        <td className="px-3 py-2 font-mono text-[#374151]">{r.invoiceNumber}</td>
                        <td className="px-3 py-2 text-[#374151] tabular-nums">{r.issueDate}</td>
                        <td className="px-3 py-2 text-[#374151] tabular-nums">{r.dueDate}</td>
                        <td className="px-3 py-2 text-right text-[#374151] tabular-nums">
                          {Math.round(r.amountSek / 1000).toLocaleString('sv-SE')}
                        </td>
                        <td className="px-3 py-2 text-[#6B7280]">{r.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Success */}
          {result && (
            <div className="px-4 py-3 bg-[#F0FDF4] border border-[#BBF7D0] rounded-xl space-y-1">
              <p className="text-sm font-medium text-[#16A34A]">
                ✓ {result.imported} invoice{result.imported !== 1 ? 's' : ''} imported
              </p>
              {result.unmatched.length > 0 && (
                <p className="text-xs text-[#D97706]">
                  {result.unmatched.length} client{result.unmatched.length !== 1 ? 's' : ''} not found in Invoice Planning — invoices saved to Unassigned: {result.unmatched.join(', ')}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-6 py-4 border-t border-[#F3F4F6] flex-shrink-0">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-[#6B7280] border border-[#E5E7EB] rounded-xl hover:bg-[#F9F9F8] transition-colors">
            {result ? 'Close' : 'Cancel'}
          </button>
          {!result && (
            <button
              onClick={handleImport}
              disabled={rows.length === 0 || importing}
              className="flex-1 py-2 text-sm font-medium text-white bg-[#0F0F0F] rounded-xl hover:bg-[#374151] transition-colors disabled:opacity-40 flex items-center justify-center gap-2"
            >
              {importing
                ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Importing…</>
                : `Import ${rows.length > 0 ? rows.length + ' invoice' + (rows.length !== 1 ? 's' : '') : ''}`}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
