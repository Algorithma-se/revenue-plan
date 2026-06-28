'use client'

import { useRef, useState } from 'react'

export function BudgetCell({
  amount,
  onSave,
}: {
  amount:  number
  onSave?: (v: number) => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [draft,   setDraft]   = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const skipBlur     = useRef(false)

  function startEdit() {
    if (!onSave || editing) return
    setDraft(amount === 0 ? '' : String(Math.round(amount / 1000)))
    setEditing(true)
  }

  async function commit() {
    setEditing(false)
    if (!onSave) return
    const parsed    = parseFloat(draft.replace(',', '.'))
    const newAmount = isNaN(parsed) ? 0 : Math.round(parsed * 1000)
    if (newAmount !== amount) await onSave(newAmount)
  }

  function navigateCell(direction: 1 | -1) {
    const all = Array.from(document.querySelectorAll<HTMLElement>('[data-budget-cell]'))
    const idx  = all.findIndex(el => el === containerRef.current)
    const next = all[idx + direction]
    if (next) setTimeout(() => next.click(), 0)
  }

  const displayText = amount === 0 ? '—' : Math.round(amount / 1000).toLocaleString('sv-SE')

  return (
    <div
      ref={containerRef}
      data-budget-cell=""
      onClick={editing ? undefined : startEdit}
      className={`relative px-1 py-1 min-h-[36px] min-w-[52px] flex items-center justify-end
        ${onSave && !editing ? 'cursor-text hover:bg-[#F9FAFB] rounded transition-colors' : ''}`}
    >
      <span className={`text-xs tabular-nums select-none
        ${editing ? 'invisible' : amount === 0 ? 'text-[#D1D5DB]' : 'text-[#0F0F0F] font-medium'}`}>
        {displayText}
      </span>

      {editing && (
        <input
          autoFocus
          type="text"
          inputMode="decimal"
          value={draft}
          onChange={e => setDraft(e.target.value.replace(/[^0-9.,]/g, ''))}
          onBlur={() => {
            if (!skipBlur.current) commit()
            skipBlur.current = false
          }}
          onKeyDown={e => {
            if (e.key === 'Escape') {
              e.preventDefault()
              skipBlur.current = true
              setEditing(false)
            }
            if (e.key === 'Enter') {
              e.preventDefault()
              commit()
            }
            if (e.key === 'Tab') {
              e.preventDefault()
              skipBlur.current = true
              commit()
              navigateCell(e.shiftKey ? -1 : 1)
            }
          }}
          className="absolute inset-0 text-right text-xs ring-1 ring-[#61b5cc] bg-[#EFF6FF] rounded px-1 outline-none"
        />
      )}
    </div>
  )
}
