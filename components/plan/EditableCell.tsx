'use client'

import { useEffect, useRef, useState } from 'react'
import type { PlanStatus } from '@/types/database'
import { StatusBadge } from './StatusBadge'

export function EditableCell({
  amount,
  status,
  readonly,
  onSaveAmount,
  onSaveStatus,
}: {
  amount: number
  status: PlanStatus
  readonly?: boolean
  onSaveAmount?: (v: number) => Promise<void>
  onSaveStatus?: (s: PlanStatus) => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft]     = useState('')
  const inputRef              = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) inputRef.current?.select()
  }, [editing])

  function startEdit() {
    if (readonly) return
    setDraft(amount === 0 ? '' : String(Math.round(amount / 1000)))
    setEditing(true)
  }

  async function commit() {
    setEditing(false)
    if (!onSaveAmount) return
    const parsed = parseFloat(draft)
    const newAmount = isNaN(parsed) ? 0 : Math.round(parsed * 1000)
    if (newAmount !== amount) await onSaveAmount(newAmount)
  }

  return (
    <div className="flex flex-col items-end gap-0.5 px-1 py-1 min-h-[36px] justify-center">
      {editing ? (
        <input
          ref={inputRef}
          type="number"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); commit() }
            if (e.key === 'Escape') setEditing(false)
          }}
          className="w-full text-right text-xs bg-[#EFF6FF] border border-[#61b5cc] rounded px-1 py-0.5 outline-none"
        />
      ) : (
        <div
          onClick={startEdit}
          className={`text-right text-xs w-full leading-none
            ${amount === 0 ? 'text-[#D1D5DB]' : 'text-[#0F0F0F] font-medium'}
            ${readonly ? '' : 'cursor-text hover:bg-[#F9F9F8] rounded transition-colors'}`}
        >
          {amount === 0 ? '—' : Math.round(amount / 1000).toLocaleString('sv-SE')}
        </div>
      )}
      <StatusBadge status={status} onCycle={onSaveStatus} readonly={readonly || !onSaveStatus} />
    </div>
  )
}
