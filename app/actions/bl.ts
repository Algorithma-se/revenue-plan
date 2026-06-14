'use server'

import { createServerSupabase } from '@/lib/supabase-server'
import { createAdminSupabase } from '@/lib/supabase-admin'
import { sendGoogleChatNotification } from '@/app/actions/invoices'

export interface BLSubmitFields {
  lineDesc:       string
  invoiceNumber:  string
  issueDate:      string
  dueDate:        string
  amountSek:      number
  excludeVat:     boolean
  notes:          string
  yourReference:  string
  ourReference:   string
  poNumber:       string
  marking:        string
}

export interface PreviousBLInvoice {
  id:              string
  invoice_number:  string
  issue_date:      string
  amount_sek:      number
  bl_line_desc:    string | null
  bl_your_reference: string | null
  bl_our_reference:  string | null
  bl_po_number:      string | null
  bl_marking:        string | null
}

export async function getPreviousBLInvoices(clientName: string): Promise<PreviousBLInvoice[]> {
  const supabase = await createServerSupabase()
  const { data } = await supabase
    .from('invoices')
    .select('id, invoice_number, issue_date, amount_sek, bl_line_desc, bl_your_reference, bl_our_reference, bl_po_number, bl_marking')
    .eq('client_name', clientName)
    .not('bl_status', 'is', null)
    .order('issue_date', { ascending: false })
    .limit(5)
  return (data ?? []) as PreviousBLInvoice[]
}

export async function submitForBLApproval(
  invoiceId: string,
  fields: BLSubmitFields,
): Promise<{ error?: string }> {
  const supabase = await createServerSupabase()

  const { error: updateErr } = await supabase
    .from('invoices')
    .update({
      bl_status:          'pending',
      bl_line_desc:       fields.lineDesc,
      invoice_number:     fields.invoiceNumber,
      issue_date:         fields.issueDate,
      due_date:           fields.dueDate,
      amount_sek:         fields.amountSek,
      exclude_vat:        fields.excludeVat,
      notes:              fields.notes,
      bl_your_reference:  fields.yourReference || null,
      bl_our_reference:   fields.ourReference  || null,
      bl_po_number:       fields.poNumber      || null,
      bl_marking:         fields.marking       || null,
    })
    .eq('id', invoiceId)

  if (updateErr) return { error: updateErr.message }

  const { data: inv } = await supabase
    .from('invoices')
    .select('invoice_number, client_name, amount_sek')
    .eq('id', invoiceId)
    .single()

  const kSEK = inv ? Math.round(inv.amount_sek / 1000) : '?'
  const msg  = [
    `📄 *Invoice pending BL approval*`,
    `Client: ${inv?.client_name ?? '—'} · #${inv?.invoice_number ?? '—'} · ${kSEK} kSEK`,
    `Line: "${fields.lineDesc}"`,
    ``,
    `👉 Review in aSAP: https://asap.algorithma.ai/invoices?bl_approve=${invoiceId}`,
  ].join('\n')

  const chatResult = await sendGoogleChatNotification(msg)
  if (chatResult.error) return { error: chatResult.error }

  return {}
}

export async function approveBLInvoice(invoiceId: string): Promise<{ error?: string }> {
  const supabase = await createServerSupabase()

  const { data: inv } = await supabase
    .from('invoices')
    .select('invoice_number, client_name, amount_sek')
    .eq('id', invoiceId)
    .single()

  const admin = createAdminSupabase()
  const { data: settings } = await admin
    .from('app_settings')
    .select('bl_client_id')
    .limit(1)
    .maybeSingle()

  const isStub = !(settings as Record<string, string | null> | null)?.bl_client_id

  const blInvoiceId = isStub
    ? `STUB-${Date.now()}`
    : 'BL-LIVE-NOT-IMPLEMENTED'

  const { error: updateErr } = await supabase
    .from('invoices')
    .update({ bl_status: 'approved', bl_invoice_id: blInvoiceId })
    .eq('id', invoiceId)

  if (updateErr) return { error: updateErr.message }

  const kSEK = inv ? Math.round(inv.amount_sek / 1000) : '?'
  const suffix = isStub ? ' (stub)' : ''
  const msg = `✅ Invoice #${inv?.invoice_number ?? '—'} (${inv?.client_name ?? '—'} · ${kSEK} kSEK) approved — BL draft created${suffix}`

  await sendGoogleChatNotification(msg)
  return {}
}

export async function rejectBLInvoice(
  invoiceId: string,
  reason: string,
): Promise<{ error?: string }> {
  const supabase = await createServerSupabase()

  const { data: inv } = await supabase
    .from('invoices')
    .select('invoice_number, client_name')
    .eq('id', invoiceId)
    .single()

  const { error: updateErr } = await supabase
    .from('invoices')
    .update({
      bl_status:        'rejected',
      bl_reject_reason: reason,
      bl_rejected_at:   new Date().toISOString(),
    })
    .eq('id', invoiceId)

  if (updateErr) return { error: updateErr.message }

  const msg = `❌ Invoice #${inv?.invoice_number ?? '—'} (${inv?.client_name ?? '—'}) rejected — ${reason}`
  await sendGoogleChatNotification(msg)

  return {}
}

export async function getBLBetaEnabled(): Promise<boolean> {
  try {
    const admin = createAdminSupabase()
    const { data } = await admin
      .from('app_settings')
      .select('bl_beta_enabled')
      .limit(1)
      .maybeSingle()
    return (data as Record<string, boolean> | null)?.bl_beta_enabled ?? false
  } catch {
    return false
  }
}
