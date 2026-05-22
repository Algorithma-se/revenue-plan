interface SowIconProps {
  hasSow: boolean
  onClick: (e: React.MouseEvent) => void
}

export function SowIcon({ hasSow, onClick }: SowIconProps) {
  return (
    <button
      onClick={e => { e.stopPropagation(); onClick(e) }}
      title={hasSow ? 'View SOW & invoices' : 'Attach SOW'}
      className={`flex-shrink-0 w-5 h-5 rounded flex items-center justify-center transition-colors ${
        hasSow
          ? 'text-[#61b5cc] hover:text-[#4a9ab0]'
          : 'text-[#D1D5DB] hover:text-[#9CA3AF]'
      }`}
    >
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
        <path d="M13.5 8.5l-5.5 5.5a3.5 3.5 0 01-4.95-4.95l6-6a2 2 0 012.83 2.83l-6.01 6a.5.5 0 01-.71-.71l5.5-5.5" />
      </svg>
    </button>
  )
}
