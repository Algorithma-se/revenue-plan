'use client'

import { useEffect, useRef, useState } from 'react'
import type { PlanStatus } from '@/types/database'
import { StatusBadge } from './StatusBadge'

export function EditableCell({
  amount, status, readonly, isAging,
  onSaveAmount, onSaveStatus,
}: {
  amount: number
  status: PlanStatus
  readonly?: boolean
  isAging?: boolean
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
    if (readonly || editing) return
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

  const STATUS_BG: Record<string, string> = { A: 'bg-[#F0FDF4]', B: 'bg-[#EFF6FF]', F: '' }
  const cellBg = isAging && amount > 0 && !editing
    ? 'bg-[#FFFBEB]'
    : amount > 0 && !editing ? (STATUS_BG[status] ?? '') : ''

  if (editing) {
    return (
      <div className="flex items-center px-1 py-1 min-h-[36px]">
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
      </div>
    )
  }

  return (
    <div className={`flex items-center justify-end gap-1 px-1 py-1 min-h-[36px] ${cellBg} transition-colors`}>
      <StatusBadge status={status} onCycle={onSaveStatus} readonly={readonly || !onSaveStatus} />
      <div
        onClick={startEdit}
        className={`text-right text-xs leading-none min-w-[36px]
          ${amount === 0 ? 'text-[#D1D5DB]' : isAging ? 'text-[#B45309] font-medium' : 'text-[#0F0F0F] font-medium'}
          ${readonly ? '' : 'cursor-text hover:bg-[#F3F4F6] rounded px-0.5 transition-colors'}`}
      >
        {amount === 0 ? '—' : Math.round(amount / 1000).toLocaleString('sv-SE')}
      </div>
    </div>
  )
}
