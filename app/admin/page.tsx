'use client'

import { useEffect, useState, useTransition } from 'react'
import { getAllowedEmails, addAllowedEmail, removeAllowedEmail, getFeatureFlag, setFeatureFlag, getAppSetting, setAppSetting } from '@/app/actions/admin'
import { getBLBetaEnabled, getAllieInvoiceEnabled, initiateAllieInvoices, getBLCredentialsConfigured } from '@/app/actions/bl'
import { sendGoogleChatNotification } from '@/app/actions/invoices'

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
  const [entries, setEntries]           = useState<Entry[]>([])
  const [loading, setLoading]           = useState(true)
  const [newEmail, setNewEmail]         = useState('')
  const [error, setError]               = useState<string | null>(null)
  const [isPending, startTransition]    = useTransition()
  const [invoicesEnabled, setInvoicesEnabled] = useState(true)
  const [flagSaving, setFlagSaving]     = useState(false)
  const [webhookUrl,  setWebhookUrl]    = useState('')
  const [webhookSaving, setWebhookSaving] = useState(false)
  const [webhookSaved,  setWebhookSaved]  = useState(false)
  const [blBetaEnabled,   setBlBetaEnabled]   = useState(false)
  const [blBetaSaving,    setBlBetaSaving]    = useState(false)
  const [blCredsConfigured, setBlCredsConfigured] = useState(false)
  const [allieInvoiceEnabled,  setAllieInvoiceEnabled]  = useState(false)
  const [allieInvoiceSaving,   setAllieInvoiceSaving]   = useState(false)
  const [cronEnabled,          setCronEnabled]          = useState(true)
  const [cronSaving,           setCronSaving]           = useState(false)
  const [allieRunning,         setAllieRunning]         = useState(false)
  const [allieResult,          setAllieResult]          = useState<{ initiated: number; errors: string[] } | null>(null)
  const [testChatMsg,          setTestChatMsg]          = useState('')
  const [testChatSending,      setTestChatSending]      = useState(false)
  const [testChatResult,       setTestChatResult]       = useState<string | null>(null)

  async function load() {
    try {
      const [emails, flag] = await Promise.all([
        getAllowedEmails(),
        getFeatureFlag('invoices'),
      ])
      setEntries(emails)
      setInvoicesEnabled(flag)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
    // Load app settings separately — columns may not exist yet
    const [webhook, blBeta, blCreds, allieInv, cronFlag] = await Promise.all([
      getAppSetting('revenue_plan_webhook_url'),
      getBLBetaEnabled(),
      getBLCredentialsConfigured(),
      getAllieInvoiceEnabled(),
      getAppSetting('cron_enabled'),
    ])
    setWebhookUrl(webhook ?? '')
    setBlBetaEnabled(blBeta)
    setBlCredsConfigured(blCreds)
    setAllieInvoiceEnabled(allieInv)
    setCronEnabled(cronFlag !== 'false')
  }

  async function handleSaveWebhook(e: React.FormEvent) {
    e.preventDefault()
    setWebhookSaving(true)
    setWebhookSaved(false)
    const result = await setAppSetting('revenue_plan_webhook_url', webhookUrl.trim())
    setWebhookSaving(false)
    if (result.error) {
      setError(result.error)
    } else {
      setWebhookSaved(true)
      setTimeout(() => setWebhookSaved(false), 2000)
    }
  }

  async function handleToggleBLBeta(next: boolean) {
    setBlBetaEnabled(next)
    setBlBetaSaving(true)
    const result = await setAppSetting('bl_beta_enabled', String(next))
    setBlBetaSaving(false)
    if (result.error) { setBlBetaEnabled(!next); setError(result.error) }
  }

  async function handleToggleAllieInvoice(next: boolean) {
    setAllieInvoiceEnabled(next)
    setAllieInvoiceSaving(true)
    const result = await setAppSetting('allie_invoice_enabled', String(next))
    setAllieInvoiceSaving(false)
    if (result.error) { setAllieInvoiceEnabled(!next); setError(result.error) }
  }

  async function handleToggleCron(next: boolean) {
    setCronEnabled(next)
    setCronSaving(true)
    const result = await setAppSetting('cron_enabled', String(next))
    setCronSaving(false)
    if (result.error) { setCronEnabled(!next); setError(result.error) }
  }


  useEffect(() => { load() }, [])

  async function handleToggleInvoices(next: boolean) {
    setInvoicesEnabled(next)
    setFlagSaving(true)
    try {
      await setFeatureFlag('invoices', next)
    } catch (e) {
      setInvoicesEnabled(!next) // revert on error
      setError(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setFlagSaving(false)
    }
  }

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

      {/* Feature flags */}
      <div className="mb-8">
        <h2 className="text-sm font-semibold text-[#0F0F0F] mb-3">Feature visibility</h2>
        <div className="bg-white rounded-2xl border border-[#EBEBEB] overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4">
            <div>
              <p className="text-sm font-medium text-[#0F0F0F]">Invoices</p>
              <p className="text-xs text-[#9CA3AF] mt-0.5">
                SOW documents, invoice schedules, and cash flow charts.
                {!invoicesEnabled && <span className="text-[#D97706] ml-1">Hidden from all users.</span>}
              </p>
            </div>
            <button
              role="switch"
              aria-checked={invoicesEnabled}
              onClick={() => handleToggleInvoices(!invoicesEnabled)}
              disabled={flagSaving || loading}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none disabled:opacity-50 ${
                invoicesEnabled ? 'bg-[#61b5cc]' : 'bg-[#D1D5DB]'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ${
                  invoicesEnabled ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </div>
      </div>

      {/* Integrations */}
      <div className="mb-8">
        <h2 className="text-sm font-semibold text-[#0F0F0F] mb-3">Integrations</h2>
        <div className="bg-white rounded-2xl border border-[#EBEBEB] p-5">
          <p className="text-sm font-medium text-[#0F0F0F] mb-1">Google Chat webhook</p>
          <p className="text-xs text-[#9CA3AF] mb-3">
            Used by the invoice notify button to post messages to a Google Chat space.
            Create an incoming webhook in Google Chat and paste the URL here.
          </p>
          <form onSubmit={handleSaveWebhook} className="flex gap-2">
            <input
              type="url"
              value={webhookUrl}
              onChange={e => setWebhookUrl(e.target.value)}
              placeholder="https://chat.googleapis.com/v1/spaces/…"
              className="flex-1 px-3 py-2 rounded-xl border border-[#EBEBEB] text-sm text-[#0F0F0F] bg-white focus:outline-none focus:border-[#61b5cc] transition-colors font-mono text-xs"
              disabled={webhookSaving}
            />
            <button
              type="submit"
              disabled={webhookSaving || !webhookUrl.trim()}
              className="px-4 py-2 rounded-xl bg-[#61b5cc] text-white text-sm font-medium hover:bg-[#4fa0b8] transition-colors disabled:opacity-40 whitespace-nowrap"
            >
              {webhookSaved ? 'Saved ✓' : webhookSaving ? 'Saving…' : 'Save'}
            </button>
          </form>
        </div>
      </div>

      {/* Björn Lundén beta */}
      <div className="mb-8">
        <h2 className="text-sm font-semibold text-[#0F0F0F] mb-3">Björn Lundén (Beta)</h2>
        <div className="bg-white rounded-2xl border border-[#EBEBEB] overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-[#F3F4F6]">
            <div>
              <p className="text-sm font-medium text-[#0F0F0F]">BL integration</p>
              <p className="text-xs text-[#9CA3AF] mt-0.5">
                Show BL push button on draft invoices and enable approval workflow.
                {!blBetaEnabled && <span className="text-[#D97706] ml-1">Currently off.</span>}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${
                blCredsConfigured ? 'bg-[#F0FDF4] text-[#16A34A]' : 'bg-[#FFF7ED] text-[#C2410C]'
              }`}>
                {blCredsConfigured ? 'Live mode' : 'Stub mode'}
              </span>
              <button
                role="switch"
                aria-checked={blBetaEnabled}
                onClick={() => handleToggleBLBeta(!blBetaEnabled)}
                disabled={blBetaSaving || loading}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none disabled:opacity-50 ${
                  blBetaEnabled ? 'bg-[#61b5cc]' : 'bg-[#D1D5DB]'
                }`}
              >
                <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ${blBetaEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
              </button>
            </div>
          </div>

          {blBetaEnabled && (
            <>
            <div className="flex items-center justify-between px-5 py-4 border-t border-[#F3F4F6]">
              <div>
                <p className="text-sm font-medium text-[#0F0F0F]">Allie auto-invoicing</p>
                <p className="text-xs text-[#9CA3AF] mt-0.5">
                  Allie detects draft invoices whose issue date has arrived and auto-prepares BL drafts for approval via Google Chat.
                </p>
              </div>
              <button
                role="switch"
                aria-checked={allieInvoiceEnabled}
                onClick={() => handleToggleAllieInvoice(!allieInvoiceEnabled)}
                disabled={allieInvoiceSaving}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none disabled:opacity-50 ${
                  allieInvoiceEnabled ? 'bg-[#61b5cc]' : 'bg-[#D1D5DB]'
                }`}
              >
                <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ${allieInvoiceEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
              </button>
            </div>
            <div className="px-5 py-4 border-t border-[#F3F4F6]">
              <div className={`flex items-start gap-3 px-3 py-3 rounded-xl border text-xs ${
                blCredsConfigured
                  ? 'bg-[#F0FDF4] border-[#BBF7D0] text-[#166534]'
                  : 'bg-[#FFF7ED] border-[#FED7AA] text-[#9A3412]'
              }`}>
                <span className="text-base leading-none mt-0.5">{blCredsConfigured ? '✅' : '⚠️'}</span>
                <div>
                  <p className="font-medium mb-0.5">
                    {blCredsConfigured ? 'Lundify credentials configured — live mode active' : 'Lundify credentials not set — running in stub mode'}
                  </p>
                  <p className="opacity-80">
                    Manage <code className="font-mono">LUNDIFY_CLIENT_ID</code>, <code className="font-mono">LUNDIFY_CLIENT_SECRET</code>,{' '}
                    <code className="font-mono">LUNDIFY_USER_KEY</code>, <code className="font-mono">LUNDIFY_AUTH_URL</code>,{' '}
                    and <code className="font-mono">LUNDIFY_BASE_URL</code> in Vercel → Project → Settings → Environment Variables.
                  </p>
                </div>
              </div>
            </div>
            </>
          )}
        </div>
      </div>

      {/* Testing / Debug */}
      <div className="mb-8">
        <h2 className="text-sm font-semibold text-[#0F0F0F] mb-1">Testing</h2>
        <p className="text-xs text-[#9CA3AF] mb-3">Manually trigger flows without waiting for the cron schedule.</p>
        <div className="bg-white rounded-2xl border border-[#EBEBEB] overflow-hidden divide-y divide-[#F3F4F6]">

          {/* Cron enabled toggle */}
          <div className="flex items-center justify-between px-5 py-4">
            <div>
              <p className="text-sm font-medium text-[#0F0F0F]">Cron jobs</p>
              <p className="text-xs text-[#9CA3AF] mt-0.5">
                When off, the Mon/Fri cron runs are silently skipped — no digest, no Allie initiation.
                {!cronEnabled && <span className="ml-1 text-[#D97706] font-medium">Currently paused.</span>}
              </p>
            </div>
            <button
              role="switch"
              aria-checked={cronEnabled}
              onClick={() => handleToggleCron(!cronEnabled)}
              disabled={cronSaving}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none disabled:opacity-50 ${
                cronEnabled ? 'bg-[#61b5cc]' : 'bg-[#D1D5DB]'
              }`}
            >
              <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ${cronEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
            </button>
          </div>

          {/* Trigger Allie */}
          <div className="px-5 py-4">
            <p className="text-sm font-medium text-[#0F0F0F] mb-0.5">Run Allie invoice initiation now</p>
            <p className="text-xs text-[#9CA3AF] mb-3">
              Finds all draft invoices whose issue date has arrived, pre-fills BL fields with AI, and sends Chat notifications.
            </p>
            <div className="flex items-start gap-3">
              <button
                onClick={async () => {
                  setAllieRunning(true)
                  setAllieResult(null)
                  try {
                    const result = await initiateAllieInvoices(false)
                    setAllieResult(result)
                  } catch (e) {
                    setAllieResult({ initiated: 0, errors: [e instanceof Error ? e.message : 'Unknown error'] })
                  }
                  setAllieRunning(false)
                }}
                disabled={allieRunning}
                className="px-4 py-1.5 rounded-xl bg-[#0F0F0F] text-white text-sm font-medium hover:bg-[#374151] transition-colors disabled:opacity-40 whitespace-nowrap"
              >
                {allieRunning ? 'Running…' : 'Run now'}
              </button>
              {allieResult && (
                <div className={`text-xs rounded-xl px-3 py-2 ${
                  allieResult.errors.length > 0
                    ? 'bg-[#FFF1F2] border border-[#FECDD3] text-[#DC2626]'
                    : 'bg-[#F0FDF4] border border-[#BBF7D0] text-[#16A34A]'
                }`}>
                  {allieResult.initiated > 0
                    ? `✓ Initiated ${allieResult.initiated} invoice${allieResult.initiated !== 1 ? 's' : ''}`
                    : 'No eligible invoices found'}
                  {allieResult.errors.length > 0 && (
                    <ul className="mt-1 space-y-0.5">
                      {allieResult.errors.map((e, i) => <li key={i}>{e}</li>)}
                    </ul>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Test Chat notification */}
          <div className="px-5 py-4">
            <p className="text-sm font-medium text-[#0F0F0F] mb-0.5">Send test Chat notification</p>
            <p className="text-xs text-[#9CA3AF] mb-3">Post a message to the configured Google Chat webhook.</p>
            <div className="flex gap-2">
              <input
                value={testChatMsg}
                onChange={e => setTestChatMsg(e.target.value)}
                placeholder="Test message from aSAP admin…"
                className="flex-1 px-3 py-1.5 text-xs border border-[#EBEBEB] rounded-xl bg-[#F9F9F8] focus:outline-none focus:border-[#61b5cc]"
              />
              <button
                onClick={async () => {
                  if (!testChatMsg.trim()) return
                  setTestChatSending(true)
                  setTestChatResult(null)
                  const result = await sendGoogleChatNotification(testChatMsg.trim())
                  setTestChatSending(false)
                  setTestChatResult(result.error ?? 'Sent ✓')
                  if (!result.error) setTimeout(() => setTestChatResult(null), 3000)
                }}
                disabled={testChatSending || !testChatMsg.trim()}
                className="px-4 py-1.5 rounded-xl bg-[#61b5cc] text-white text-xs font-medium hover:bg-[#4fa0b8] transition-colors disabled:opacity-40 whitespace-nowrap"
              >
                {testChatSending ? 'Sending…' : 'Send'}
              </button>
            </div>
            {testChatResult && (
              <p className={`mt-2 text-xs ${testChatResult === 'Sent ✓' ? 'text-[#16A34A]' : 'text-[#DC2626]'}`}>
                {testChatResult}
              </p>
            )}
          </div>

        </div>
      </div>

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
