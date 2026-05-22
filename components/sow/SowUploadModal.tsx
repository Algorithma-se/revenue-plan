'use client'

import { useRef, useState } from 'react'
import type { SowDocument, SowDocumentType } from '@/types/database'
import { uploadSow, parseSow } from '@/app/actions/sow'

interface Props {
  itemId: string
  clientName: string | null
  onDone: (sow: SowDocument) => void
  onClose: () => void
}

export function SowUploadModal({ itemId, clientName, onDone, onClose }: Props) {
  const [docType, setDocType]   = useState<SowDocumentType>('original')
  const [file, setFile]         = useState<File | null>(null)
  const [dragging, setDragging] = useState(false)
  const [phase, setPhase]       = useState<'idle' | 'uploading' | 'parsing' | 'error'>('idle')
  const [error, setError]       = useState<string | null>(null)
  const inputRef                = useRef<HTMLInputElement>(null)

  function handleFile(f: File) {
    const allowed = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
    if (!allowed.includes(f.type)) { setError('Only PDF and DOCX files are supported'); return }
    if (f.size > 20 * 1024 * 1024) { setError('File must be smaller than 20 MB'); return }
    setFile(f)
    setError(null)
  }

  async function submit() {
    if (!file) return
    setError(null)
    setPhase('uploading')
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('manual_revenue_item_id', itemId)
      fd.append('document_type', docType)

      const uploadResult = await uploadSow(fd)
      if (uploadResult.error || !uploadResult.data) {
        setError(uploadResult.error ?? 'Upload failed')
        setPhase('error')
        return
      }

      setPhase('parsing')
      const parseResult = await parseSow(uploadResult.data.id)
      if (parseResult.error || !parseResult.data) {
        setError(parseResult.error ?? 'Parse failed')
        setPhase('error')
        return
      }
      onDone(parseResult.data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed')
      setPhase('error')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-base font-bold text-[#0F0F0F]">Upload SOW document</h2>
          <button onClick={onClose} className="text-[#9CA3AF] hover:text-[#6B7280]">
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        {clientName && (
          <div className="flex items-center gap-2 mb-5 px-3 py-2 bg-[#FFF7ED] border border-[#FED7AA] rounded-xl">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5 text-[#D97706] flex-shrink-0">
              <path d="M13.5 8.5l-5.5 5.5a3.5 3.5 0 01-4.95-4.95l6-6a2 2 0 012.83 2.83l-6.01 6a.5.5 0 01-.71-.71l5.5-5.5" />
            </svg>
            <span className="text-xs text-[#92400E]">Attaching to <span className="font-semibold">{clientName}</span></span>
          </div>
        )}

        {/* Document type */}
        <div className="mb-4">
          <label className="block text-xs font-semibold text-[#374151] mb-1.5">Document type</label>
          <div className="flex gap-2">
            {(['original', 'amendment', 'change_request'] as SowDocumentType[]).map(t => (
              <button
                key={t}
                onClick={() => setDocType(t)}
                className={`flex-1 py-1.5 text-xs rounded-lg border font-medium transition-colors ${
                  docType === t
                    ? 'bg-[#0F0F0F] text-white border-[#0F0F0F]'
                    : 'border-[#E5E7EB] text-[#374151] hover:border-[#9CA3AF]'
                }`}
              >
                {t === 'original' ? 'Original' : t === 'amendment' ? 'Amendment' : 'Change Request'}
              </button>
            ))}
          </div>
        </div>

        {/* Drop zone */}
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
          onClick={() => inputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
            dragging ? 'border-[#61b5cc] bg-[#EFF9FF]' : 'border-[#E5E7EB] hover:border-[#9CA3AF]'
          }`}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
          />
          {file ? (
            <div>
              <p className="text-sm font-medium text-[#0F0F0F]">{file.name}</p>
              <p className="text-xs text-[#9CA3AF] mt-1">{(file.size / 1024).toFixed(0)} KB</p>
            </div>
          ) : (
            <div>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-8 h-8 mx-auto text-[#D1D5DB] mb-2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
              </svg>
              <p className="text-sm text-[#6B7280]">Drop PDF or DOCX here, or click to browse</p>
              <p className="text-xs text-[#9CA3AF] mt-1">Max 20 MB</p>
            </div>
          )}
        </div>

        {error && <p className="mt-3 text-xs text-[#DC2626]">{error}</p>}

        {/* Loading state */}
        {(phase === 'uploading' || phase === 'parsing') && (
          <div className="mt-4 p-3 bg-[#F0F9FF] rounded-lg">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 border-2 border-[#61b5cc] border-t-transparent rounded-full animate-spin flex-shrink-0" />
              <p className="text-xs text-[#0F0F0F]">
                {phase === 'uploading' ? 'Uploading document…' : 'Claude is reading the SOW (5–10 s)…'}
              </p>
            </div>
            {phase === 'parsing' && (
              <div className="mt-2 grid grid-cols-3 gap-1">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="h-2 bg-[#BFDBFE] rounded animate-pulse" style={{ animationDelay: `${i * 0.1}s` }} />
                ))}
              </div>
            )}
          </div>
        )}

        <div className="flex gap-2 mt-5">
          <button
            onClick={onClose}
            disabled={phase === 'uploading' || phase === 'parsing'}
            className="flex-1 py-2 text-sm font-medium text-[#6B7280] border border-[#E5E7EB] rounded-xl hover:bg-[#F9F9F8] transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!file || phase === 'uploading' || phase === 'parsing'}
            className="flex-1 py-2 text-sm font-medium text-white bg-[#0F0F0F] rounded-xl hover:bg-[#374151] transition-colors disabled:opacity-40"
          >
            Upload & parse
          </button>
        </div>
      </div>
    </div>
  )
}
