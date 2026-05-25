export function JOracleLogo() {
  return (
    <div className="flex items-center gap-2">
      {/* Oracle-style ellipse ring in teal gradient */}
      <svg width="34" height="22" viewBox="0 0 34 22" fill="none" aria-hidden>
        <defs>
          <linearGradient id="joracleGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#8ECFDF" />
            <stop offset="100%" stopColor="#4A9BB5" />
          </linearGradient>
        </defs>
        <ellipse cx="17" cy="11" rx="16.5" ry="10.5" fill="url(#joracleGrad)" />
        <ellipse cx="17" cy="11" rx="9" ry="5.5" fill="white" />
      </svg>
      <span className="font-bold text-[15px] tracking-tight text-[#0F0F0F]">
        JOracle
      </span>
    </div>
  )
}
