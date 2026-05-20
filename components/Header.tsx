'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

interface UserInfo {
  email:  string | null
  name:   string | null
  avatar: string | null
}

const NAV_LINKS = [
  { href: '/',      label: 'Work List' },
  { href: '/plan',  label: 'P&L Plan'  },
]

export default function Header() {
  const pathname = usePathname()
  const router   = useRouter()
  const [user, setUser]             = useState<UserInfo | null>(null)
  const [menuOpen, setMenuOpen]     = useState(false)
  const [navOpen, setNavOpen]       = useState(false)
  const [avatarError, setAvatarError] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user: u } }) => {
      if (!u) return
      setUser({
        email:  u.email ?? null,
        name:   u.user_metadata?.full_name ?? u.user_metadata?.name ?? null,
        avatar: u.user_metadata?.avatar_url ?? u.user_metadata?.picture ?? null,
      })
    })
  }, [])

  // Close mobile nav on route change
  useEffect(() => { setNavOpen(false) }, [pathname])

  const isHidden = pathname === '/login' || pathname?.startsWith('/auth')
  if (isHidden) return null

  const displayName = user?.name ?? user?.email ?? ''
  const initial     = displayName[0]?.toUpperCase() ?? '?'

  return (
    <header className="bg-white border-b border-[#EBEBEB] sticky top-0 z-30">
      <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">

        {/* Wordmark */}
        <div className="flex items-center gap-5">
          <div className="flex items-center gap-2.5">
            <Image
              src="/logo.svg"
              alt="Algorithma"
              width={20}
              height={20}
              className="w-5 h-5 flex-shrink-0"
              style={{ color: '#61b5cc' }}
            />
            <span className="font-semibold text-[14px] tracking-tight text-[#0F0F0F]">
              algorithma
              <span className="text-[#6B7280] font-normal ml-1.5 hidden sm:inline">| Revenue Plan</span>
            </span>
          </div>

          {/* Desktop nav */}
          <nav className="hidden sm:flex items-center gap-0.5">
            {NAV_LINKS.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  pathname === href
                    ? 'bg-[#e6f8ff] text-[#61b5cc]'
                    : 'text-[#6B7280] hover:text-[#0F0F0F] hover:bg-[#F9F9F8]'
                }`}
              >
                {label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-1">
          {/* Hamburger — mobile only */}
          <button
            onClick={() => setNavOpen(o => !o)}
            className="sm:hidden p-2 rounded-lg text-[#6B7280] hover:bg-[#F9F9F8] transition-colors"
            aria-label="Toggle menu"
          >
            {navOpen ? (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>

          {/* User dropdown */}
          {user && (
            <div className="relative">
              <button
                onClick={() => setMenuOpen(o => !o)}
                className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-sm text-[#6B7280] hover:bg-[#F9F9F8] transition-colors"
              >
                {user.avatar && !avatarError ? (
                  <Image
                    src={user.avatar}
                    alt={displayName}
                    width={24}
                    height={24}
                    className="w-6 h-6 rounded-full object-cover flex-shrink-0"
                    onError={() => setAvatarError(true)}
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <span className="w-6 h-6 rounded-full bg-[#61b5cc] flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0">
                    {initial}
                  </span>
                )}
                <span className="hidden sm:block text-xs max-w-[160px] truncate">
                  {user.name ?? user.email}
                </span>
                <svg className="w-3 h-3 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                  <div className="absolute right-0 top-full mt-1.5 bg-white border border-[#EBEBEB] rounded-xl shadow-xl shadow-black/5 z-50 py-1 min-w-[160px]">
                    <div className="px-4 py-2 border-b border-[#F3F4F6] mb-1">
                      {user.name && (
                        <p className="text-[12px] font-medium text-[#0F0F0F] truncate">{user.name}</p>
                      )}
                      <p className="text-[11px] text-[#9CA3AF] truncate">{user.email}</p>
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
      </div>

      {/* Mobile nav drawer */}
      {navOpen && (
        <div className="sm:hidden border-t border-[#F3F4F6] bg-white px-4 py-2">
          {NAV_LINKS.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className={`flex items-center px-3 py-2.5 rounded-lg text-sm font-medium transition-colors mb-0.5 ${
                pathname === href
                  ? 'bg-[#e6f8ff] text-[#61b5cc]'
                  : 'text-[#374151] hover:bg-[#F9F9F8]'
              }`}
            >
              {label}
            </Link>
          ))}
        </div>
      )}
    </header>
  )
}
