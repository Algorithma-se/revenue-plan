import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabase } from '@/lib/supabase-admin'
import { sendGoogleChatNotification } from '@/app/actions/invoices'
import { getAllieInvoiceEnabled, initiateAllieInvoices } from '@/app/actions/bl'
import { getAppSetting } from '@/app/actions/admin'

export const dynamic = 'force-dynamic'

const fmtK    = (n: number) => Math.round(n / 1000).toLocaleString('sv-SE')
const fmtDate = (d: string) =>
  new Date(d + 'T12:00:00').toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })
const total   = (rows: { amount_sek: number }[]) => rows.reduce((s, i) => s + i.amount_sek, 0)
const plural  = (n: number) => `${n} invoice${n > 1 ? 's' : ''}`

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const cronEnabled = await getAppSetting('cron_enabled')
  if (cronEnabled === 'false') {
    return NextResponse.json({ ok: true, sent: false, reason: 'cron disabled by admin' })
  }

  const today = new Date().toISOString().slice(0, 10)
  const in7   = new Date(Date.now() +  7 * 86_400_000).toISOString().slice(0, 10)
  const in14  = new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10)

  const admin = createAdminSupabase()

  // Run Allie auto-initiation first — she picks up invoices due today
  const allieEnabled = await getAllieInvoiceEnabled()
  let allieInitiated = 0
  if (allieEnabled) {
    const result = await initiateAllieInvoices()
    allieInitiated = result.initiated
  }

  // Sent invoices overdue or due within 14 days
  const { data: sentInvoices, error: e1 } = await admin
    .from('invoices')
    .select('invoice_number, client_name, amount_sek, due_date, status')
    .eq('status', 'sent')
    .lte('due_date', in14)
    .order('due_date', { ascending: true })

  // Draft invoices not yet in BL workflow, issue_date within the next 14 days
  const { data: draftInvoices, error: e2 } = await admin
    .from('invoices')
    .select('invoice_number, client_name, amount_sek, issue_date, due_date')
    .eq('status', 'draft')
    .is('bl_status', null)
    .lte('issue_date', in14)
    .order('issue_date', { ascending: true })

  if (e1 || e2) return NextResponse.json({ error: e1?.message ?? e2?.message }, { status: 500 })

  const overdue  = (sentInvoices ?? []).filter(i => i.due_date < today)
  const dueSoon  = (sentInvoices ?? []).filter(i => i.due_date >= today)
  const toSend   = draftInvoices ?? []

  if (!overdue.length && !dueSoon.length && !toSend.length) {
    return NextResponse.json({ ok: true, sent: false, reason: 'nothing to report' })
  }

  const now     = new Date()
  const dayName = now.toLocaleDateString('en-SE', { weekday: 'long' })
  const dateStr = now.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', year: 'numeric' })

  const parts: string[] = [`📊 *Invoice digest — ${dayName} ${dateStr}*`]

  if (overdue.length) {
    parts.push(`\n🔴 *Overdue — ${plural(overdue.length)} · ${fmtK(total(overdue))} kSEK*`)
    for (const inv of overdue) {
      parts.push(`  ${inv.client_name ?? '—'} · #${inv.invoice_number} · ${fmtK(inv.amount_sek)} kSEK · due ${fmtDate(inv.due_date)}`)
    }
  }

  if (toSend.length) {
    parts.push(`\n📤 *To send — ${plural(toSend.length)} · ${fmtK(total(toSend))} kSEK*`)
    for (const inv of toSend) {
      const label = inv.issue_date <= today ? 'send today' : `send by ${fmtDate(inv.issue_date)}`
      parts.push(`  ${inv.client_name ?? '—'} · #${inv.invoice_number} · ${fmtK(inv.amount_sek)} kSEK · ${label}`)
    }
  }

  if (dueSoon.length) {
    parts.push(`\n📅 *Due in 14 days — ${plural(dueSoon.length)} · ${fmtK(total(dueSoon))} kSEK*`)
    for (const inv of dueSoon) {
      parts.push(`  ${inv.client_name ?? '—'} · #${inv.invoice_number} · ${fmtK(inv.amount_sek)} kSEK · due ${fmtDate(inv.due_date)}`)
    }
  }

  const result = await sendGoogleChatNotification(parts.join('\n'))
  if (result.error) return NextResponse.json({ error: result.error }, { status: 500 })

  return NextResponse.json({ ok: true, sent: true, overdue: overdue.length, toSend: toSend.length, dueSoon: dueSoon.length, allieInitiated })
}
