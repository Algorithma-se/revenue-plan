'use client'

import { useRef, useState } from 'react'

export function AddRowButton({
  label,
  placeholder,
  onAdd,
  colSpan,
}: {
  label: string
  placeholder: string
  onAdd: (name: string) => Promise<void>
  colSpan: number
}) {
  const [open, setOpen]     = useState(false)
  const [value, setValue]   = useState('')
  const [saving, setSaving] = useState(false)
  const inputRef            = useRef<HTMLInputElement>(null)

  function startAdd() {
    setOpen(true)
    setValue('')
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  async function commit() {
    const trimmed = value.trim()
    if (!trimmed) { setOpen(false); return }
    setSaving(true)
    await onAdd(trimmed)
    setSaving(false)
    setOpen(false)
    setValue('')
  }

  if (open) {
    return (
      <div className="grid col-span-full" style={{ gridColumn: `1 / span ${colSpan}` }}>
        <div className="flex items-center gap-2 px-3 py-2">
          <input
            ref={inputRef}
            type="text"
            value={value}
            placeholder={placeholder}
            onChange={e => setValue(e.target.value)}
            onBlur={commit}
            onKeyDown={e => {
              if (e.key === 'Enter') commit()
              if (e.key === 'Escape') { setOpen(false); setValue('') }
            }}
            disabled={saving}
            className="flex-1 text-sm border border-[#61b5cc] rounded-lg px-3 py-1.5 bg-[#EFF6FF] focus:outline-none focus:ring-2 focus:ring-[#61b5cc] disabled:opacity-50"
          />
        </div>
      </div>
    )
  }

  return (
    <div className="col-span-full">
      <button
        onClick={startAdd}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-[#9CA3AF] hover:text-[#61b5cc] transition-colors"
      >
        <span className="text-base leading-none">+</span>
        {label}
      </button>
    </div>
  )
}
