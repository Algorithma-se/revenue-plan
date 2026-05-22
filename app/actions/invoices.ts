'use server'

import Anthropic from '@anthropic-ai/sdk'
import { createServerSupabase } from '@/lib/supabase-server'
import type { Invoice, InvoiceDraft, InvoiceStatus, InvoiceSuggestion } from '@/types/database'

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
  podId: string | null
  invoiceCount: number
  hasSow: boolean
}[]> {
  const supabase = await createServerSupabase()

  const [{ data: itemData }, { data: invData }, { data: sowData }] = await Promise.all([
    supabase.from('manual_revenue_items').select('id, client_name, pod_id').order('sort'),
    supabase.from('invoices').select('manual_revenue_item_id'),
    supabase.from('sow_documents').select('manual_revenue_item_id'),
  ])

  const invCounts = new Map<string, number>()
  for (const r of (invData ?? [])) {
    invCounts.set(r.manual_revenue_item_id, (invCounts.get(r.manual_revenue_item_id) ?? 0) + 1)
  }
  const sowItemIds = new Set((sowData ?? []).map((r: { manual_revenue_item_id: string }) => r.manual_revenue_item_id))

  return (itemData ?? []).map((item: { id: string; client_name: string | null; pod_id: string | null }) => ({
    itemId:       item.id,
    clientName:   item.client_name,
    podId:        item.pod_id,
    invoiceCount: invCounts.get(item.id) ?? 0,
    hasSow:       sowItemIds.has(item.id),
  }))
}

export async function generateInvoiceSchedule(sowId: string): Promise<Invoice[]> {
  const supabase = await createServerSupabase()

  const { data: sow, error } = await supabase
    .from('sow_documents')
    .select('*')
    .eq('id', sowId)
    .single()

  if (error || !sow) throw new Error('SOW document not found')
  if (sow.parse_status !== 'done') throw new Error('SOW has not been parsed yet')

  const itemId   = sow.manual_revenue_item_id
  const total    = Number(sow.parsed_total_value_sek ?? 0)
  const start    = sow.parsed_start_date ? new Date(sow.parsed_start_date) : new Date()
  const end      = sow.parsed_end_date   ? new Date(sow.parsed_end_date)   : null
  const terms    = (sow.parsed_payment_terms ?? '').toLowerCase()
  const termDays = parsePaymentTermsDays(terms)
  const deliverables: { label: string; due_date: string | null }[] = sow.parsed_deliverables ?? []
  const year     = start.getFullYear()

  const drafts: Omit<Invoice, 'id' | 'created_at' | 'updated_at'>[] = []

  if (deliverables.length > 0) {
    deliverables.forEach((d, i) => {
      const issueDate = d.due_date ? new Date(d.due_date) : addDays(start, 30 * (i + 1))
      drafts.push({
        manual_revenue_item_id: itemId,
        sow_document_id:        sowId,
        invoice_number:         `${year}-INV-${String(i + 1).padStart(3, '0')}`,
        issue_date:             toIso(issueDate),
        due_date:               toIso(addDays(issueDate, termDays)),
        amount_sek:             total / deliverables.length,
        payment_trigger:        'milestone',
        milestone_label:        d.label,
        status:                 'draft',
        paid_date:              null,
        notes:                  null,
        sort:                   i,
      })
    })
  } else if (terms.includes('month') && end) {
    const months = monthsBetween(start, end)
    const perMonth = months > 0 ? total / months : total
    for (let i = 0; i < months; i++) {
      const issueDate = addMonths(start, i + 1)
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
  if (insErr) throw new Error(insErr.message)
  return (data ?? []) as Invoice[]
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
): Promise<InvoiceSuggestion[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured')

  const supabase = await createServerSupabase()

  const [{ data: sow }, { data: existingInvoices }] = await Promise.all([
    supabase.from('sow_documents').select('*').eq('id', newSowId).single(),
    supabase.from('invoices').select('*').eq('manual_revenue_item_id', itemId).order('sort'),
  ])

  if (!sow) throw new Error('SOW not found')
  if (sow.parse_status !== 'done') throw new Error('SOW has not been parsed yet')

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
    max_tokens: 1024,
    messages:   [{ role: 'user', content: prompt }],
  })

  const block = message.content[0]
  if (block.type !== 'text') throw new Error('Unexpected response from Claude')

  const jsonText = block.text.trim().replace(/^```json\s*/i, '').replace(/```\s*$/, '')
  return JSON.parse(jsonText) as InvoiceSuggestion[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toIso(d: Date): string {
  return d.toISOString().slice(0, 10)
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
