'use client'

import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { supabase } from '@/lib/supabase'

function JOracleMark() {
  return (
    <svg width="56" height="56" viewBox="0 0 56 56" fill="none" aria-hidden>
      <defs>
        <linearGradient id="cubeTop" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#A8DFF0" />
          <stop offset="100%" stopColor="#5BBBD4" />
        </linearGradient>
      </defs>
      {/* Top face — lightest */}
      <polygon points="28,5 52,18 28,31 4,18" fill="#7ECFE8" />
      {/* Left face — darkest */}
      <polygon points="4,18 28,31 28,51 4,38" fill="#2E8BAA" />
      {/* Right face — medium */}
      <polygon points="52,18 28,31 28,51 52,38" fill="#4AAFC8" />
    </svg>
  )
}

const PILLS = [
  { icon: '📊', label: 'Revenue Forecasting' },
  { icon: '🧾', label: 'Invoice Automation' },
  { icon: '📈', label: 'P&L Planning' },
  { icon: '🔄', label: 'Cash Flow Tracking' },
  { icon: '👥', label: 'Resource Planning' },
  { icon: '📦', label: 'Operations Hub' },
  { icon: '🤖', label: 'AI-Powered Insights' },
  { icon: '🌍', label: 'Multi-Entity Finance' },
  { icon: '⚡', label: 'Real-Time Reporting' },
  { icon: '🏆', label: 'SOW Management' },
]

function PillStrip() {
  const doubled = [...PILLS, ...PILLS]
  return (
    <div className="relative overflow-hidden w-full">
      <div
        className="flex gap-3 w-max"
        style={{ animation: 'scrollPills 28s linear infinite' }}
      >
        {doubled.map((p, i) => (
          <div
            key={i}
            className="flex items-center gap-2 px-4 py-2 rounded-full border border-white/10 bg-white/5 text-sm text-white/60 whitespace-nowrap flex-shrink-0"
          >
            <span>{p.icon}</span>
            <span>{p.label}</span>
          </div>
        ))}
      </div>
      <div className="absolute inset-y-0 left-0 w-24 pointer-events-none" style={{ background: 'linear-gradient(to right, #080f1c, transparent)' }} />
      <div className="absolute inset-y-0 right-0 w-24 pointer-events-none" style={{ background: 'linear-gradient(to left, #080f1c, transparent)' }} />
    </div>
  )
}

function LoginCard() {
  const searchParams = useSearchParams()
  const errorParam = searchParams.get('error')

  const errorMessage =
    errorParam === 'domain'      ? 'Your account is not authorised. Contact Jens to get access.' :
    errorParam === 'auth_failed' ? 'Sign-in failed. Please try again.' :
    null

  async function signInWithGoogle() {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
  }

  return (
    <div className="bg-white rounded-2xl p-8 shadow-2xl w-full max-w-[320px] mx-auto">
      <h2 className="text-lg font-bold text-[#0F0F0F] mb-1">Welcome back</h2>
      <p className="text-sm text-[#6B7280] mb-6">Sign in with your Algorithma Google account.</p>

      {errorMessage && (
        <p className="text-xs text-[#E11D48] bg-[#FFF1F2] border border-[#FECDD3] rounded-xl px-3 py-2 mb-4">
          {errorMessage}
        </p>
      )}

      <button
        onClick={signInWithGoogle}
        className="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-xl border border-[#E5E7EB] bg-white text-sm font-medium text-[#0F0F0F] hover:border-[#61b5cc] hover:bg-[#e6f8ff] transition-all"
      >
        <svg viewBox="0 0 24 24" className="w-5 h-5 flex-shrink-0">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
        </svg>
        Sign in with Google
      </button>
    </div>
  )
}

export default function LoginPage() {
  return (
    <div
      className="fixed inset-0 flex flex-col items-center justify-center gap-10 py-16 overflow-y-auto"
      style={{ background: 'linear-gradient(160deg, #060D18 0%, #0a1628 100%)' }}
    >
      {/* Section 1 — Logo + Headline */}
      <div className="text-center px-6">
        <div className="flex items-center justify-center gap-4 mb-6">
          <JOracleMark />
          <div className="text-left">
            <div className="text-[42px] font-black text-white tracking-tight leading-none">JOracle</div>
            <div className="text-[11px] font-semibold text-[#61b5cc] uppercase tracking-[0.2em] mt-1.5">by Algorithma</div>
          </div>
        </div>
        <h1 className="text-3xl font-bold text-white leading-snug max-w-lg mx-auto mb-4">
          The most powerful{' '}
          <span style={{ background: 'linear-gradient(90deg, #7ECFE8 0%, #4AAFC8 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
            AI-powered agentic ERP
          </span>
          {' '}in the world.
        </h1>
        <p className="text-sm text-white/45 max-w-sm mx-auto leading-relaxed">
          Built for operationally complex enterprises automating finance, HR, and operations across Europe.
        </p>
      </div>

      {/* Section 2 — Sign-in card */}
      <div className="w-full px-4">
        <Suspense fallback={<div className="bg-white rounded-2xl p-8 w-full max-w-[320px] mx-auto h-36 animate-pulse" />}>
          <LoginCard />
        </Suspense>
      </div>

      {/* Section 3 — Rolling pills */}
      <div className="w-full">
        <p className="text-center text-[10px] font-semibold text-white/30 uppercase tracking-[0.2em] mb-4">
          Everything you need to run your business
        </p>
        <PillStrip />
      </div>

      <p className="text-xs text-white/25">
        Powered by <span className="text-[#61b5cc]">Algorithma</span>
      </p>
    </div>
  )
}
