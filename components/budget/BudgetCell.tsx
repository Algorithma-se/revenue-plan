'use client'

import { useRef, useState } from 'react'

function kFmt(v: number) {
  return Math.round(v / 1000).toLocaleString('sv-SE')
}

export function BudgetCell({
  amount,
  onSave,
  actual,
}: {
  amount:  number
  onSave?: (v: number) => Promise<void>
  actual?: { a: number; b: number }
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

  const displayText  = amount === 0 ? '—' : kFmt(amount)
  const hasActual    = actual && (actual.a > 0 || actual.b > 0)

  return (
    <div
      ref={containerRef}
      data-budget-cell=""
      onClick={editing ? undefined : startEdit}
      className={`relative px-1 py-1 min-w-[52px] flex flex-col items-end justify-center
        ${hasActual ? 'min-h-[44px]' : 'min-h-[36px]'}
        ${onSave && !editing ? 'cursor-text hover:bg-[#F9FAFB] rounded transition-colors' : ''}`}
    >
      <span className={`text-xs tabular-nums select-none
        ${editing ? 'invisible' : amount === 0 ? 'text-[#D1D5DB]' : 'text-[#0F0F0F] font-medium'}`}>
        {displayText}
      </span>

      {hasActual && !editing && (
        <span className="flex items-center gap-0.5 text-[10px] tabular-nums leading-tight mt-0.5">
          {actual!.a > 0 && (
            <span className="text-[#16A34A] font-medium">A {kFmt(actual!.a)}</span>
          )}
          {actual!.a > 0 && actual!.b > 0 && (
            <span className="text-[#D1D5DB] text-[9px]">·</span>
          )}
          {actual!.b > 0 && (
            <span className="text-[#D97706] font-medium">B {kFmt(actual!.b)}</span>
          )}
        </span>
      )}

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
