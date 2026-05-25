export function JOracleLogo() {
  return (
    <div className="flex items-center gap-2.5">
      {/* Oracle-style ellipse ring mark */}
      <svg width="34" height="22" viewBox="0 0 34 22" fill="none" aria-hidden>
        <ellipse cx="17" cy="11" rx="16.5" ry="10.5" fill="#C74634" />
        <ellipse cx="17" cy="11" rx="9" ry="5.5" fill="white" />
      </svg>
      <span className="font-bold text-[15px] tracking-tight text-[#C74634]">
        JOracle
      </span>
    </div>
  )
}
