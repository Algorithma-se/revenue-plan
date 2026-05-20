'use client'

import { useEffect, useState, useTransition } from 'react'
import { getAllowedEmails, addAllowedEmail, removeAllowedEmail } from '@/app/actions/admin'

interface Entry { email: string; created_at: string; last_login_at: string | null }

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins  = Math.floor(diff / 60_000)
  const hours = Math.floor(diff / 3_600_000)
  const days  = Math.floor(diff / 86_400_000)
  if (mins  < 2)   return 'just now'
  if (mins  < 60)  return `${mins}m ago`
  if (hours < 24)  return `${hours}h ago`
  if (days  < 7)   return `${days}d ago`
  return new Date(iso).toLocaleDateString('sv-SE')
}

export default function AdminPage() {
  const [entries, setEntries]   = useState<Entry[]>([])
  const [loading, setLoading]   = useState(true)
  const [newEmail, setNewEmail] = useState('')
  const [error, setError]       = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  async function load() {
    try {
      setEntries(await getAllowedEmails())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    const email = newEmail.trim()
    if (!email) return
    setError(null)
    startTransition(async () => {
      try {
        await addAllowedEmail(email)
        setNewEmail('')
        await load()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to add')
      }
    })
  }

  function handleRemove(email: string) {
    setError(null)
    startTransition(async () => {
      try {
        await removeAllowedEmail(email)
        await load()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to remove')
      }
    })
  }

  const neverLogged  = entries.filter(e => !e.last_login_at)
  const everLogged   = entries.filter(e =>  e.last_login_at)
  const recentCutoff = Date.now() - 7 * 24 * 60 * 60 * 1000

  return (
    <div className="max-w-xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-[#0F0F0F] tracking-tight">Access Management</h1>
        <p className="text-sm text-[#6B7280] mt-1">
          Only @algorithma.ai accounts can sign in. Login activity updates on each sign-in.
        </p>
      </div>

      {/* Activity summary */}
      {!loading && entries.length > 0 && (
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="bg-white rounded-2xl border border-[#EBEBEB] px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[#9CA3AF] mb-1">Total users</p>
            <p className="text-2xl font-bold text-[#0F0F0F]">{entries.length}</p>
          </div>
          <div className="bg-white rounded-2xl border border-[#EBEBEB] px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[#9CA3AF] mb-1">Active this week</p>
            <p className="text-2xl font-bold text-[#0F0F0F]">
              {entries.filter(e => e.last_login_at && new Date(e.last_login_at).getTime() > recentCutoff).length}
            </p>
          </div>
          <div className="bg-white rounded-2xl border border-[#EBEBEB] px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[#9CA3AF] mb-1">Never signed in</p>
            <p className="text-2xl font-bold text-[#0F0F0F]">{neverLogged.length}</p>
          </div>
        </div>
      )}

      {/* Add form */}
      <form onSubmit={handleAdd} className="flex gap-2 mb-6">
        <input
          type="email"
          value={newEmail}
          onChange={e => setNewEmail(e.target.value)}
          placeholder="name@algorithma.ai"
          className="flex-1 px-3 py-2 rounded-xl border border-[#EBEBEB] text-sm text-[#0F0F0F] bg-white focus:outline-none focus:border-[#61b5cc] transition-colors"
          disabled={isPending}
        />
        <button
          type="submit"
          disabled={isPending || !newEmail.trim()}
          className="px-4 py-2 rounded-xl bg-[#61b5cc] text-white text-sm font-medium hover:bg-[#4fa0b8] transition-colors disabled:opacity-40"
        >
          Add
        </button>
      </form>

      {error && (
        <p className="text-xs text-[#DC2626] bg-[#FFF1F2] border border-[#FECDD3] rounded-xl px-3 py-2 mb-4">
          {error}
        </p>
      )}

      {/* User list */}
      <div className="bg-white rounded-2xl border border-[#EBEBEB] overflow-hidden">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-5 py-3.5 border-b border-[#F3F4F6]">
              <div className="h-4 bg-[#F3F4F6] rounded animate-pulse flex-1" />
            </div>
          ))
        ) : entries.length === 0 ? (
          <p className="px-5 py-8 text-sm text-[#9CA3AF] text-center">No users yet.</p>
        ) : [...everLogged.sort((a, b) =>
              new Date(b.last_login_at!).getTime() - new Date(a.last_login_at!).getTime()
            ), ...neverLogged
          ].map((entry, idx, arr) => {
            const isRecent = entry.last_login_at && new Date(entry.last_login_at).getTime() > recentCutoff
            return (
              <div
                key={entry.email}
                className={`flex items-center justify-between px-5 py-3 ${idx < arr.length - 1 ? 'border-b border-[#F3F4F6]' : ''}`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  {/* Online indicator */}
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                    isRecent ? 'bg-[#16A34A]' : entry.last_login_at ? 'bg-[#D1D5DB]' : 'bg-[#FCA5A5]'
                  }`} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[#0F0F0F] truncate">{entry.email}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {entry.last_login_at ? (
                        <p className="text-[11px] text-[#9CA3AF]">
                          Last login {timeAgo(entry.last_login_at)}
                        </p>
                      ) : (
                        <p className="text-[11px] text-[#FCA5A5]">Never signed in</p>
                      )}
                      <span className="text-[#E5E7EB]">·</span>
                      <p className="text-[11px] text-[#D1D5DB]">
                        Added {new Date(entry.created_at).toLocaleDateString('sv-SE')}
                      </p>
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => handleRemove(entry.email)}
                  disabled={isPending}
                  className="text-xs px-3 py-1.5 rounded-lg text-[#9CA3AF] hover:text-[#DC2626] hover:bg-[#FFF1F2] transition-colors disabled:opacity-40 flex-shrink-0 ml-3"
                >
                  Remove
                </button>
              </div>
            )
          })}
      </div>
    </div>
  )
}
