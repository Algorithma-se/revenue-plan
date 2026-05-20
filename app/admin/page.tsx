'use client'

import { useEffect, useState, useTransition } from 'react'
import { getAllowedEmails, addAllowedEmail, removeAllowedEmail } from '@/app/actions/admin'

interface Entry { email: string; created_at: string }

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

  return (
    <div className="max-w-xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-[#0F0F0F] tracking-tight">Access Management</h1>
        <p className="text-sm text-[#6B7280] mt-1">
          Users with a Google account matching one of these emails can sign in.
        </p>
      </div>

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

      {/* List */}
      <div className="bg-white rounded-2xl border border-[#EBEBEB] overflow-hidden">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-5 py-3.5 border-b border-[#F3F4F6]">
              <div className="h-4 bg-[#F3F4F6] rounded animate-pulse flex-1" />
            </div>
          ))
        ) : entries.length === 0 ? (
          <p className="px-5 py-8 text-sm text-[#9CA3AF] text-center">No users yet.</p>
        ) : entries.map((entry, idx) => (
          <div
            key={entry.email}
            className={`flex items-center justify-between px-5 py-3 ${idx < entries.length - 1 ? 'border-b border-[#F3F4F6]' : ''}`}
          >
            <div>
              <p className="text-sm font-medium text-[#0F0F0F]">{entry.email}</p>
              {entry.created_at && (
                <p className="text-[11px] text-[#9CA3AF]">
                  Added {new Date(entry.created_at).toLocaleDateString('sv-SE')}
                </p>
              )}
            </div>
            <button
              onClick={() => handleRemove(entry.email)}
              disabled={isPending}
              className="text-xs px-3 py-1.5 rounded-lg text-[#9CA3AF] hover:text-[#DC2626] hover:bg-[#FFF1F2] transition-colors disabled:opacity-40"
            >
              Remove
            </button>
          </div>
        ))}
      </div>

      <p className="text-[11px] text-[#9CA3AF] mt-4">
        {entries.length} user{entries.length !== 1 ? 's' : ''} with access
      </p>
    </div>
  )
}
