'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function Header() {
  const pathname = usePathname()
  const router = useRouter()
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUserEmail(user?.email ?? null)
    })
  }, [])

  const isHidden = pathname === '/login' || pathname?.startsWith('/auth')
  if (isHidden) return null

  return (
    <header className="bg-white border-b border-[#EBEBEB] sticky top-0 z-30">
      <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">

        {/* Wordmark + nav */}
        <div className="flex items-center gap-5">
          <div className="flex items-center gap-2">
            <span
              className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ background: 'linear-gradient(135deg, #65deff 0%, #61b5cc 100%)' }}
            >
              <svg viewBox="0 0 20 20" fill="white" className="w-3.5 h-3.5">
                <path fillRule="evenodd" d="M4 4a2 2 0 00-2 2v4a2 2 0 002 2V6h10a2 2 0 00-2-2H4zm2 6a2 2 0 012-2h8a2 2 0 012 2v4a2 2 0 01-2 2H8a2 2 0 01-2-2v-4zm6 4a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
              </svg>
            </span>
            <span className="font-semibold text-[14px] tracking-tight text-[#0F0F0F]">
              Revenue Plan
            </span>
          </div>

          <nav className="hidden sm:flex items-center gap-0.5">
            <Link
              href="/"
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                pathname === '/'
                  ? 'bg-[#e6f8ff] text-[#61b5cc]'
                  : 'text-[#6B7280] hover:text-[#0F0F0F] hover:bg-[#F9F9F8]'
              }`}
            >
              Work List
            </Link>
          </nav>
        </div>

        {/* User dropdown */}
        {userEmail && (
          <div className="relative">
            <button
              onClick={() => setMenuOpen(o => !o)}
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-sm text-[#6B7280] hover:bg-[#F9F9F8] transition-colors"
            >
              <span className="w-6 h-6 rounded-full bg-[#61b5cc] flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0">
                {userEmail[0].toUpperCase()}
              </span>
              <span className="hidden sm:block text-xs max-w-[180px] truncate">{userEmail}</span>
              <svg className="w-3 h-3 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {menuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 top-full mt-1.5 bg-white border border-[#EBEBEB] rounded-xl shadow-xl shadow-black/5 z-50 py-1 min-w-[160px]">
                  <div className="px-4 py-2 border-b border-[#F3F4F6] mb-1">
                    <p className="text-[11px] text-[#9CA3AF] truncate">{userEmail}</p>
                  </div>
                  <button
                    onClick={async () => {
                      setMenuOpen(false)
                      await supabase.auth.signOut()
                      router.push('/login')
                    }}
                    className="w-full text-left px-4 py-2 text-sm text-[#0F0F0F] hover:bg-[#F9F9F8] transition-colors"
                  >
                    Sign out
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </header>
  )
}
