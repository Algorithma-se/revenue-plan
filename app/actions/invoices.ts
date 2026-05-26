'use server'

import Anthropic from '@anthropic-ai/sdk'
import { createServerSupabase } from '@/lib/supabase-server'
import { createAdminSupabase } from '@/lib/supabase-admin'
import type { Invoice, InvoiceDraft, InvoiceStatus, InvoiceSuggestion, SowDeliverable, SowParsedRaw } from '@/types/database'

export async function getInvoices(itemId: string): Promise<Invoice[]> {
  const supabase = await createServerSupabase()
  const { data, error } = await supabase
    .from('invoices')
    .select('*')
    .eq('manual_revenue_item_id', itemId)
    .order('sort', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []) as Invoice[]
}

export async function getAllInvoiceItems(): Promise<{
  itemId: string
  clientName: string | null
  project: string | null
  podId: string | null
  invoiceCount: number
  hasSow: boolean
}[]> {
  const supabase = await createServerSupabase()

  const [{ data: itemData }, { data: invData }, { data: sowData }] = await Promise.all([
    supabase.from('manual_revenue_items').select('id, client_name, project, pod_id').order('sort'),
    supabase.from('invoices').select('manual_revenue_item_id'),
    supabase.from('sow_documents').select('manual_revenue_item_id'),
  ])

  const invCounts = new Map<string, number>()
  for (const r of (invData ?? [])) {
    invCounts.set(r.manual_revenue_item_id, (invCounts.get(r.manual_revenue_item_id) ?? 0) + 1)
  }
  const sowItemIds = new Set((sowData ?? []).map((r: { manual_revenue_item_id: string }) => r.manual_revenue_item_id))

  return (itemData ?? []).map((item: { id: string; client_name: string | null; project: string | null; pod_id: string | null }) => ({
    itemId:       item.id,
    clientName:   item.client_name,
    project:      item.project,
    podId:        item.pod_id,
    invoiceCount: invCounts.get(item.id) ?? 0,
    hasSow:       sowItemIds.has(item.id),
  }))
}

export async function generateInvoiceSchedule(sowId: string): Promise<{ data?: Invoice[]; error?: string }> {
  try {
  const supabase = await createServerSupabase()

  const { data: sow, error } = await supabase
    .from('sow_documents')
    .select('*')
    .eq('id', sowId)
    .single()

  if (error || !sow) return { error: 'SOW document not found' }
  if (sow.parse_status !== 'done') return { error: 'SOW has not been parsed yet' }

  const itemId       = sow.manual_revenue_item_id
  const raw          = sow.parsed_raw as SowParsedRaw | null
  const total        = Number(sow.parsed_total_value_sek ?? 0)
  const start        = sow.parsed_start_date ? new Date(sow.parsed_start_date + 'T12:00:00') : new Date()
  const end          = sow.parsed_end_date   ? new Date(sow.parsed_end_date   + 'T12:00:00') : null
  const termDays     = parsePaymentTermsDays((sow.parsed_payment_terms ?? '').toLowerCase())
  // Align deliverable dates to the contract start: if the earliest date
  // predates start (e.g. user corrected start date in the review modal),
  // shift all dates forward by the same delta so the schedule is consistent.
  const rawDeliverables = (sow.parsed_deliverables ?? []) as SowDeliverable[]
  const deliverables    = alignDeliverablesToStart(rawDeliverables, start)
  const model        = raw?.invoicing_model ?? null
  const hourlyRate   = raw?.hourly_rate_sek ?? null
  const monthlyFee   = raw?.monthly_fee_sek ?? null
  const monthlyHours = raw?.monthly_hours ?? []
  const year         = start.getFullYear()

  const drafts: Omit<Invoice, 'id' | 'created_at' | 'updated_at'>[] = []

  // ── time_and_materials with monthly_hours ──────────────────────────────
  if (model === 'time_and_materials' && hourlyRate && monthlyHours.length > 0) {
    monthlyHours.forEach((mh, i) => {
      const [y, m] = mh.month.split('-').map(Number)
      const issueDate = lastDayOfMonth(new Date(y, m - 1, 1))
      const amount    = Math.round(mh.hours * hourlyRate)
      drafts.push({
        manual_revenue_item_id: itemId,
        sow_document_id:        sowId,
        invoice_number:         `${year}-INV-${String(i + 1).padStart(3, '0')}`,
        issue_date:             toIso(issueDate),
        due_date:               toIso(addDays(issueDate, termDays)),
        amount_sek:             amount,
        payment_trigger:        'date',
        milestone_label:        `${mh.month} — ${mh.hours} h × ${Math.round(hourlyRate).toLocaleString('sv-SE')} kr/h`,
        status:                 'draft',
        paid_date:              null,
        notes:                  null,
        sort:                   i,
      })
    })

  // ── capacity / retainer with explicit deliverable schedule ───────────
  // Prefer parser-provided deliverables when present; fall back to uniform
  // monthly loop only when no deliverables exist. Uses total-sum sanity
  // check to detect rate-period mis-parsing (weekly used as monthly, etc.)
  } else if ((model === 'capacity' || model === 'time_and_materials') && deliverables.length > 0) {
    const fallbackPerEntry = total / deliverables.length
    const deliverableSum   = deliverables.reduce((s, d) => s + (d.amount_sek ?? 0), 0)
    // If deliverable amounts sum within 30% of total, trust them; otherwise
    // the LLM mis-converted the rate period → distribute total evenly.
    const amountsValid = deliverableSum > 0 && Math.abs(deliverableSum - total) / total < 0.30
    deliverables.forEach((d, i) => {
      const issueDate   = resolveInvoiceDate(d, start, i)
      const amount      = amountsValid ? (d.amount_sek ?? fallbackPerEntry) : fallbackPerEntry
      const isMilestone = !!(d.label && d.invoice_timing === 'on_completion')
      drafts.push({
        manual_revenue_item_id: itemId,
        sow_document_id:        sowId,
        invoice_number:         `${year}-INV-${String(i + 1).padStart(3, '0')}`,
        issue_date:             toIso(issueDate),
        due_date:               toIso(addDays(issueDate, termDays)),
        amount_sek:             Math.round(amount),
        payment_trigger:        isMilestone ? 'milestone' : 'date',
        milestone_label:        d.label ?? null,
        status:                 'draft',
        paid_date:              null,
        notes:                  null,
        sort:                   i,
      })
    })

  // ── capacity / retainer — uniform monthly loop (no deliverables) ──────
  } else if ((model === 'capacity' || model === 'time_and_materials') && end) {
    const numMonths = monthsBetween(start, end)
    const perMonth  = monthlyFee ?? (numMonths > 0 ? total / numMonths : total)
    const timing    = raw?.invoice_timing ?? 'month_end'
    for (let i = 0; i < numMonths; i++) {
      const periodStart = addMonths(start, i)
      const issueDate   = timing === 'month_start'
        ? periodStart
        : lastDayOfMonth(periodStart)
      drafts.push({
        manual_revenue_item_id: itemId,
        sow_document_id:        sowId,
        invoice_number:         `${year}-INV-${String(i + 1).padStart(3, '0')}`,
        issue_date:             toIso(issueDate),
        due_date:               toIso(addDays(issueDate, termDays)),
        amount_sek:             Math.round(perMonth),
        payment_trigger:        'date',
        milestone_label:        null,
        status:                 'draft',
        paid_date:              null,
        notes:                  null,
        sort:                   i,
      })
    }

  // ── milestone / fixed_fee with deliverables ────────────────────────────
  } else if (deliverables.length > 0) {
    const fallback    = total / deliverables.length
    deliverables.forEach((d, i) => {
      const issueDate = resolveInvoiceDate(d, start, i)
      const amount    = d.amount_sek ?? fallback
      const isMilestone = !!(d.label && d.invoice_timing === 'on_completion')
      drafts.push({
        manual_revenue_item_id: itemId,
        sow_document_id:        sowId,
        invoice_number:         `${year}-INV-${String(i + 1).padStart(3, '0')}`,
        issue_date:             toIso(issueDate),
        due_date:               toIso(addDays(issueDate, termDays)),
        amount_sek:             amount,
        payment_trigger:        isMilestone ? 'milestone' : 'date',
        milestone_label:        isMilestone ? d.label : null,
        status:                 'draft',
        paid_date:              null,
        notes:                  null,
        sort:                   i,
      })
    })

  // ── monthly fallback (terms mention "month") ───────────────────────────
  } else if (end) {
    const numMonths = monthsBetween(start, end)
    const perMonth  = numMonths > 0 ? total / numMonths : total
    for (let i = 0; i < numMonths; i++) {
      const issueDate = lastDayOfMonth(addMonths(start, i))
      drafts.push({
        manual_revenue_item_id: itemId,
        sow_document_id:        sowId,
        invoice_number:         `${year}-INV-${String(i + 1).padStart(3, '0')}`,
        issue_date:             toIso(issueDate),
        due_date:               toIso(addDays(issueDate, termDays)),
        amount_sek:             perMonth,
        payment_trigger:        'date',
        milestone_label:        null,
        status:                 'draft',
        paid_date:              null,
        notes:                  null,
        sort:                   i,
      })
    }

  // ── single invoice fallback ────────────────────────────────────────────
  } else {
    drafts.push({
      manual_revenue_item_id: itemId,
      sow_document_id:        sowId,
      invoice_number:         `${year}-INV-001`,
      issue_date:             toIso(start),
      due_date:               toIso(addDays(start, termDays)),
      amount_sek:             total,
      payment_trigger:        'date',
      milestone_label:        null,
      status:                 'draft',
      paid_date:              null,
      notes:                  null,
      sort:                   0,
    })
  }

  const { data, error: insErr } = await supabase
    .from('invoices')
    .insert(drafts)
    .select()
  if (insErr) return { error: insErr.message }
  return { data: (data ?? []) as Invoice[] }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to generate invoice schedule' }
  }
}

export async function regenerateInvoiceSchedule(sowId: string): Promise<{ data?: Invoice[]; error?: string }> {
  try {
    const supabase = await createServerSupabase()
    await supabase.from('invoices').delete().eq('sow_document_id', sowId)
    return generateInvoiceSchedule(sowId)
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to regenerate invoice schedule' }
  }
}

export async function saveInvoices(
  itemId: string,
  drafts: InvoiceDraft[],
  sowDocumentId: string | null,
): Promise<Invoice[]> {
  const supabase = await createServerSupabase()

  await supabase.from('invoices').delete().eq('manual_revenue_item_id', itemId)

  if (drafts.length === 0) return []

  const rows = drafts.map((d, i) => ({
    manual_revenue_item_id: itemId,
    sow_document_id:        sowDocumentId,
    invoice_number:         d.invoice_number,
    issue_date:             d.issue_date,
    due_date:               d.due_date,
    amount_sek:             d.amount_sek,
    payment_trigger:        d.payment_trigger,
    milestone_label:        d.milestone_label || null,
    status:                 d.status,
    paid_date:              null,
    notes:                  d.notes || null,
    sort:                   i,
  }))

  const { data, error } = await supabase.from('invoices').insert(rows).select()
  if (error) throw new Error(error.message)
  return (data ?? []) as Invoice[]
}

export async function updateInvoiceStatus(
  invoiceId: string,
  status: InvoiceStatus,
  paidDate?: string,
): Promise<void> {
  const supabase = await createServerSupabase()
  const { error } = await supabase
    .from('invoices')
    .update({
      status,
      paid_date:  paidDate ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', invoiceId)
  if (error) throw new Error(error.message)
}

export async function suggestAmendments(
  newSowId: string,
  itemId: string,
): Promise<{ data?: InvoiceSuggestion[]; error?: string }> {
  try {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return { error: 'ANTHROPIC_API_KEY not configured' }

  const supabase = await createServerSupabase()

  const [{ data: sow }, { data: existingInvoices }] = await Promise.all([
    supabase.from('sow_documents').select('*').eq('id', newSowId).single(),
    supabase.from('invoices').select('*').eq('manual_revenue_item_id', itemId).order('sort'),
  ])

  if (!sow) return { error: 'SOW not found' }
  if (sow.parse_status !== 'done') return { error: 'SOW has not been parsed yet' }

  const prompt = `You are comparing a new contract document against an existing invoice schedule.
Compare carefully and suggest only meaningful changes.

Existing invoices (JSON):
${JSON.stringify(existingInvoices ?? [], null, 2)}

New SOW parsed data (JSON):
${JSON.stringify({
  client_name:      sow.parsed_client_name,
  total_value_sek:  sow.parsed_total_value_sek,
  start_date:       sow.parsed_start_date,
  end_date:         sow.parsed_end_date,
  payment_terms:    sow.parsed_payment_terms,
  deliverables:     sow.parsed_deliverables,
}, null, 2)}

Reply ONLY with a valid JSON array of suggestions (empty array if no changes needed):
[{
  "action": "add" | "modify" | "remove",
  "invoice_id": string | null,
  "draft": {
    "invoice_number": string,
    "issue_date": "YYYY-MM-DD",
    "due_date": "YYYY-MM-DD",
    "amount_sek": number,
    "payment_trigger": "date" | "milestone",
    "milestone_label": string,
    "status": "draft",
    "notes": string
  },
  "reason": string
}]`

  const client  = new Anthropic({ apiKey })
  const message = await client.messages.create({
    model:      'claude-haiku-4-5-20251001',
    max_tokens: 4096,
    messages:   [{ role: 'user', content: prompt }],
  })

  const block = message.content[0]
  if (block.type !== 'text') return { error: 'Unexpected response from Claude' }

  const jsonText = block.text.trim().replace(/^```json\s*/i, '').replace(/```\s*$/, '')
  if (!jsonText) return { data: [] }
  return { data: JSON.parse(jsonText) as InvoiceSuggestion[] }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to suggest amendments' }
  }
}

export async function getAggregatedCashFlow(): Promise<{
  planByMonth:     Record<string, number>
  invoicedByMonth: Record<string, number>
  expectedByMonth: Record<string, number>
}> {
  const supabase = await createServerSupabase()
  const [{ data: cells }, { data: invs }] = await Promise.all([
    supabase.from('plan_revenue_cells').select('month, amount'),
    supabase.from('invoices').select('issue_date, due_date, paid_date, amount_sek, status'),
  ])

  const planByMonth:     Record<string, number> = {}
  const invoicedByMonth: Record<string, number> = {}
  const expectedByMonth: Record<string, number> = {}

  for (const c of (cells ?? [])) {
    const m = c.month.slice(0, 7) + '-01'
    planByMonth[m] = (planByMonth[m] ?? 0) + c.amount
  }
  for (const inv of (invs ?? [])) {
    const im = inv.issue_date.slice(0, 7) + '-01'
    invoicedByMonth[im] = (invoicedByMonth[im] ?? 0) + inv.amount_sek
    const cashDate = inv.status === 'paid' && inv.paid_date ? inv.paid_date : inv.due_date
    const em = cashDate.slice(0, 7) + '-01'
    expectedByMonth[em] = (expectedByMonth[em] ?? 0) + inv.amount_sek
  }

  return { planByMonth, invoicedByMonth, expectedByMonth }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toIso(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function lastDayOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0)
}

function resolveInvoiceDate(d: SowDeliverable, start: Date, idx: number): Date {
  if (d.invoice_date) return new Date(d.invoice_date)
  if (d.invoice_timing === 'month_end') return lastDayOfMonth(addMonths(start, idx))
  if (d.invoice_timing === 'month_start') return addMonths(start, idx)
  if (d.due_date) return new Date(d.due_date)
  return addDays(start, 30 * (idx + 1))
}

// Parse "Net 30", "30 days", "60 dagar", "net 45 days", etc. → number of days
function parsePaymentTermsDays(terms: string): number {
  const match = terms.match(/(\d+)/)
  return match ? parseInt(match[1], 10) : 30
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

function addMonths(d: Date, n: number): Date {
  const r = new Date(d)
  r.setMonth(r.getMonth() + n)
  return r
}

function monthsBetween(a: Date, b: Date): number {
  return Math.max(
    1,
    (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth()),
  )
}

function shiftIso(iso: string, deltaMs: number): string {
  return toIso(new Date(new Date(iso + 'T12:00:00').getTime() + deltaMs))
}

// If the earliest deliverable date predates the contract start (e.g. because
// the user corrected the start date in the review modal), shift all dates
// forward so the schedule aligns with the stated start.
function alignDeliverablesToStart(deliverables: SowDeliverable[], start: Date): SowDeliverable[] {
  const allDates = deliverables.flatMap(d =>
    [d.invoice_date, d.due_date].filter((x): x is string => !!x)
  )
  if (allDates.length === 0) return deliverables

  const minMs   = Math.min(...allDates.map(iso => new Date(iso + 'T12:00:00').getTime()))
  const startMs = start.getTime()
  if (minMs >= startMs) return deliverables   // already aligned

  const deltaMs = startMs - minMs
  return deliverables.map(d => ({
    ...d,
    invoice_date: d.invoice_date ? shiftIso(d.invoice_date, deltaMs) : d.invoice_date,
    due_date:     d.due_date     ? shiftIso(d.due_date,     deltaMs) : d.due_date,
  }))
}

export async function sendGoogleChatNotification(
  message: string,
): Promise<{ error?: string }> {
  try {
    const admin = createAdminSupabase()
    const { data: setting } = await admin
      .from('app_settings')
      .select('value')
      .eq('key', 'google_chat_webhook_url')
      .maybeSingle()
    const webhookUrl = setting?.value
    if (!webhookUrl) return { error: 'Google Chat webhook URL not configured. Add it in Admin settings.' }
    const res = await fetch(webhookUrl, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ text: message }),
    })
    if (!res.ok) return { error: `Webhook returned ${res.status}: ${res.statusText}` }
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to send notification' }
  }
}
