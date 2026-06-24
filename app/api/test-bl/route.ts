import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

type StepResult = { ok: true; detail?: string } | { ok: false; error: string }

export async function GET() {
  // Auth — must be a logged-in user
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const results: Record<string, StepResult> = {}

  // ── Step 1: env vars present ─────────────────────────────────────────────
  const clientId     = process.env.LUNDIFY_CLIENT_ID
  const clientSecret = process.env.LUNDIFY_CLIENT_SECRET
  const userKey      = process.env.LUNDIFY_USER_KEY
  const authUrl      = process.env.LUNDIFY_AUTH_URL
  const baseUrl      = process.env.LUNDIFY_BASE_URL

  const missing = ['LUNDIFY_CLIENT_ID', 'LUNDIFY_CLIENT_SECRET', 'LUNDIFY_USER_KEY', 'LUNDIFY_AUTH_URL', 'LUNDIFY_BASE_URL']
    .filter(k => !process.env[k])

  results.env_vars = missing.length === 0
    ? { ok: true, detail: `All 5 vars present — auth: ${authUrl}, base: ${baseUrl}` }
    : { ok: false, error: `Missing: ${missing.join(', ')}` }

  if (!clientId || !clientSecret || !authUrl || !baseUrl) {
    return NextResponse.json({ steps: results, passed: false })
  }

  // ── Step 2: OAuth token ──────────────────────────────────────────────────
  let token: string | null = null
  try {
    const res = await fetch(`${authUrl}/token`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type:    'client_credentials',
        client_id:     clientId,
        client_secret: clientSecret,
      }).toString(),
    })
    const body = await res.text()
    if (!res.ok) {
      results.oauth_token = { ok: false, error: `HTTP ${res.status}: ${body.slice(0, 1500)}` }
    } else {
      const data = JSON.parse(body) as Record<string, unknown>
      token = data.access_token as string | null
      if (!token) {
        results.oauth_token = { ok: false, error: `No access_token in response: ${body.slice(0, 200)}` }
      } else {
        results.oauth_token = { ok: true, detail: `token_type=${data.token_type ?? '?'}, expires_in=${data.expires_in ?? '?'}s` }
      }
    }
  } catch (err) {
    results.oauth_token = { ok: false, error: err instanceof Error ? err.message : 'fetch failed' }
  }

  if (!token) return NextResponse.json({ steps: results, passed: false })

  const apiHeaders: Record<string, string> = { 'Authorization': `Bearer ${token}` }
  if (userKey) apiHeaders['User-Key'] = userKey
  const api = baseUrl.replace(/\/$/, '')

  // ── Step 3: list all available service provider keys ────────────────────
  // This shows every company/SP the token has access to — find the right User-Key here
  const headersNoUserKey = { 'Authorization': `Bearer ${token}` }
  try {
    const res  = await fetch(`${api}/meta/allKeys`, { headers: headersNoUserKey })
    const body = await res.text()
    if (!res.ok) {
      results.all_keys = { ok: false, error: `HTTP ${res.status}: ${body.slice(0, 500)}` }
    } else {
      results.all_keys = { ok: true, detail: body.slice(0, 2000) }
    }
  } catch (err) {
    results.all_keys = { ok: false, error: err instanceof Error ? err.message : 'fetch failed' }
  }

  // ── Step 3b: probe each key for salesdocument access ────────────────────
  try {
    const keys: string[] = JSON.parse(results.all_keys.ok ? (results.all_keys as {ok:true;detail:string}).detail : '[]')
    const probes: Record<string, string> = {}
    for (const key of keys) {
      try {
        // Try GET salesdocument — 200/ok = has access, 403 = wrong key
        const r = await fetch(`${api}/salesdocument?$top=1`, { headers: { 'Authorization': `Bearer ${token}`, 'User-Key': key } })
        const t = await r.text()
        probes[key] = `salesdocument: HTTP ${r.status} — ${t.slice(0, 400)}`
      } catch (e) {
        probes[key] = e instanceof Error ? e.message : 'failed'
      }
    }
    results.key_probe = { ok: true, detail: JSON.stringify(probes) }
  } catch (err) {
    results.key_probe = { ok: false, error: err instanceof Error ? err.message : 'failed' }
  }

  // ── Step 4: customer list ping (with current User-Key) ───────────────────
  try {
    const res  = await fetch(`${api}/customer?$top=1`, { headers: apiHeaders })
    const body = await res.text()
    if (!res.ok) {
      results.customer_ping = { ok: false, error: `HTTP ${res.status}: ${body.slice(0, 500)}` }
    } else {
      let count = '?'
      try {
        const data = JSON.parse(body) as unknown
        const list = Array.isArray(data) ? data
          : Array.isArray((data as Record<string, unknown>).value) ? (data as Record<string, unknown[]>).value
          : Array.isArray((data as Record<string, unknown>).items) ? (data as Record<string, unknown[]>).items
          : []
        count = String(list.length)
      } catch { /* keep count as '?' */ }
      results.customer_ping = { ok: true, detail: `returned ${count} customer(s)` }
    }
  } catch (err) {
    results.customer_ping = { ok: false, error: err instanceof Error ? err.message : 'fetch failed' }
  }

  const passed = Object.values(results).every(r => r.ok)
  return NextResponse.json({ steps: results, passed })
}
