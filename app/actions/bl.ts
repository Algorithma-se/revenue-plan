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
    .select('invoice_number, client_name, amount_sek, issue_date, due_date, exclude_vat, bl_line_desc, bl_your_reference, bl_our_reference, bl_po_number, bl_marking')
    .eq('id', invoiceId)
    .single()

  const isStub = !process.env.LUNDIFY_CLIENT_ID || !process.env.LUNDIFY_CLIENT_SECRET

  if (isStub) {
    const blInvoiceId = `STUB-${Date.now()}`
    const { error: updateErr } = await supabase
      .from('invoices')
      .update({ bl_status: 'approved', bl_invoice_id: blInvoiceId })
      .eq('id', invoiceId)
    if (updateErr) return { error: updateErr.message }
    const kSEK = inv ? Math.round((inv.amount_sek as number) / 1000) : '?'
    await sendGoogleChatNotification(`✅ Invoice #${inv?.invoice_number ?? '—'} (${inv?.client_name ?? '—'} · ${kSEK} kSEK) approved — BL draft created (stub)`)
    return {}
  }

  // Live mode — OAuth2 client credentials + Lundify API

  const authUrl = (process.env.LUNDIFY_AUTH_URL || 'https://id.bjornlunden.se/connect/token')
  const apiUrl  = (process.env.LUNDIFY_BASE_URL  || 'https://api.bjornlunden.se/v2').replace(/\/$/, '')

  // Step 1: fetch OAuth token
  let token: string
  try {
    const tokenRes = await fetch(authUrl, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(`${process.env.LUNDIFY_CLIENT_ID}:${process.env.LUNDIFY_CLIENT_SECRET}`).toString('base64')}`,
      },
      body: new URLSearchParams({ grant_type: 'client_credentials' }).toString(),
    })
    if (!tokenRes.ok) {
      const text = await tokenRes.text()
      return { error: `Lundify auth failed (${tokenRes.status}): ${text.slice(0, 300)}` }
    }
    const tokenData = await tokenRes.json() as Record<string, unknown>
    token = tokenData.access_token as string
    if (!token) return { error: 'Lundify auth: no access_token in response' }
  } catch (err) {
    return { error: `Lundify auth: ${err instanceof Error ? err.message : 'request failed'}` }
  }

  const apiHeaders: Record<string, string> = {
    'Authorization': `Bearer ${token}`,
    'Content-Type':  'application/json',
  }
  if (process.env.LUNDIFY_USER_KEY) apiHeaders['X-User-Key'] = process.env.LUNDIFY_USER_KEY

  // Step 2: look up customer by name to get customer number (best effort)
  let customerNumber: string | null = null
  try {
    const custRes = await fetch(
      `${apiUrl}/customer?$filter=Name eq '${(inv?.client_name ?? '').replace(/'/g, "''")}'`,
      { headers: apiHeaders },
    )
    if (custRes.ok) {
      const custData = await custRes.json() as Record<string, unknown>
      const list = Array.isArray(custData) ? custData as unknown[]
        : Array.isArray(custData.value)    ? custData.value as unknown[]
        : Array.isArray(custData.items)    ? custData.items as unknown[]
        : []
      if (list.length > 0) {
        const c = list[0] as Record<string, unknown>
        customerNumber = (c.CustomerNumber ?? c.customerNumber ?? c.Number ?? null) as string | null
      }
    }
  } catch {
    // Proceed without customer number — BL may match on name or prompt to create
  }

  // Step 3: create sales document (invoice draft)
  const payload = {
    Type:           1,
    CustomerNumber: customerNumber,
    InvoiceDate:    inv?.issue_date,
    DueDate:        inv?.due_date,
    YourReference:  inv?.bl_your_reference || null,
    OurReference:   inv?.bl_our_reference  || null,
    OrderNumber:    inv?.invoice_number    || null,
    Marking:        inv?.bl_marking        || null,
    Rows: [{
      Description: inv?.bl_line_desc || `Invoice ${inv?.invoice_number ?? ''}`,
      Quantity:    1,
      UnitPrice:   inv?.amount_sek ?? 0,
      VatCode:     inv?.exclude_vat ? 'MP0' : 'MP1',
    }],
  }

  let blInvoiceId: string
  try {
    const docRes = await fetch(`${apiUrl}/salesdocument`, {
      method:  'POST',
      headers: apiHeaders,
      body:    JSON.stringify(payload),
    })
    if (!docRes.ok) {
      const text = await docRes.text()
      return { error: `Lundify create invoice failed (${docRes.status}): ${text.slice(0, 400)}` }
    }
    const docData = await docRes.json() as Record<string, unknown>
    blInvoiceId = String(
      docData.DocumentNumber ?? docData.documentNumber ?? docData.Id ?? docData.id ?? Date.now()
    )
  } catch (err) {
    return { error: `Lundify create invoice: ${err instanceof Error ? err.message : 'request failed'}` }
  }

  const { error: updateErr } = await supabase
    .from('invoices')
    .update({ bl_status: 'approved', bl_invoice_id: blInvoiceId })
    .eq('id', invoiceId)

  if (updateErr) return { error: updateErr.message }

  const kSEK = inv ? Math.round((inv.amount_sek as number) / 1000) : '?'
  await sendGoogleChatNotification(
    `✅ Invoice #${inv?.invoice_number ?? '—'} (${inv?.client_name ?? '—'} · ${kSEK} kSEK) approved — BL draft #${blInvoiceId} created`
  )
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

export async function getAllieInvoiceEnabled(): Promise<boolean> {
  try {
    const admin = createAdminSupabase()
    const { data } = await admin
      .from('app_settings')
      .select('allie_invoice_enabled')
      .limit(1)
      .maybeSingle()
    return (data as Record<string, boolean> | null)?.allie_invoice_enabled ?? false
  } catch {
    return false
  }
}

async function generateLineDescription(ctx: {
  clientName:     string
  project:        string
  milestoneLabel: string
  amountSek:      number
  issueDate:      string
  sowModel:       string
  prevLine:       string
}): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return ctx.milestoneLabel || `Consulting services — ${ctx.issueDate.slice(0, 7)}`

  try {
    const Anthropic = (await import('@anthropic-ai/sdk')).default
    const client    = new Anthropic({ apiKey })
    const period    = new Date(ctx.issueDate + 'T12:00:00')
      .toLocaleString('en-SE', { month: 'long', year: 'numeric' })

    const prompt = `Write a concise invoice line description in English (max 100 characters).
Return only the line text — no quotes, no explanation.

Client: ${ctx.clientName}
Project: ${ctx.project || '—'}
Milestone: ${ctx.milestoneLabel || '—'}
Invoice period: ${period}
Amount: ${Math.round(ctx.amountSek / 1000)} kSEK
Invoicing model: ${ctx.sowModel || 'consulting'}
Previous line used for this client: ${ctx.prevLine || 'none'}

Examples:
Consulting services — June 2026 (160 h capacity)
Project delivery — Phase 2 completion
Advisory retainer — Q2 2026`

    const response = await client.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 60,
      messages:   [{ role: 'user', content: prompt }],
    })
    const text = response.content[0].type === 'text' ? response.content[0].text.trim() : ''
    return text.slice(0, 100) || ctx.milestoneLabel || `Consulting services — ${period}`
  } catch {
    return ctx.milestoneLabel || `Consulting services — ${ctx.issueDate.slice(0, 7)}`
  }
}

export async function initiateAllieInvoices(notify = true): Promise<{ initiated: number; errors: string[] }> {
  const admin = createAdminSupabase()
  const today = new Date().toISOString().slice(0, 10)

  const { data: eligible } = await admin
    .from('invoices')
    .select('id, invoice_number, client_name, project, milestone_label, amount_sek, issue_date, manual_revenue_item_id')
    .eq('status', 'draft')
    .is('bl_status', null)
    .lte('issue_date', today)
    .order('issue_date', { ascending: true })

  if (!eligible?.length) return { initiated: 0, errors: [] }

  const errors: string[] = []
  let initiated = 0

  for (const inv of eligible) {
    try {
      const [sowResult, prevResult] = await Promise.all([
        admin
          .from('sow_documents')
          .select('parsed_raw')
          .eq('manual_revenue_item_id', inv.manual_revenue_item_id ?? '')
          .not('parse_status', 'eq', 'error')
          .order('version_number', { ascending: false })
          .limit(1)
          .maybeSingle(),
        admin
          .from('invoices')
          .select('bl_line_desc, bl_your_reference, bl_our_reference, bl_po_number, bl_marking')
          .eq('client_name', inv.client_name ?? '')
          .not('bl_status', 'is', null)
          .order('issue_date', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ])

      const sow  = sowResult.data
      const prev = prevResult.data

      const lineDesc = await generateLineDescription({
        clientName:     inv.client_name    ?? '',
        project:        inv.project        ?? '',
        milestoneLabel: inv.milestone_label ?? '',
        amountSek:      inv.amount_sek,
        issueDate:      inv.issue_date,
        sowModel:       (sow?.parsed_raw as Record<string, string> | null)?.invoicing_model ?? '',
        prevLine:       prev?.bl_line_desc ?? '',
      })

      const { error: updateErr } = await admin
        .from('invoices')
        .update({
          bl_status:          'pending',
          bl_allie_initiated: true,
          bl_line_desc:       lineDesc,
          bl_your_reference:  prev?.bl_your_reference ?? null,
          bl_our_reference:   prev?.bl_our_reference  ?? null,
          bl_po_number:       prev?.bl_po_number      ?? null,
          bl_marking:         prev?.bl_marking        ?? null,
        })
        .eq('id', inv.id)

      if (updateErr) { errors.push(`#${inv.invoice_number}: ${updateErr.message}`); continue }

      const kSEK = Math.round(inv.amount_sek / 1000)
      const msg  = [
        `🤖 *Allie prepared an invoice for approval*`,
        `Client: ${inv.client_name ?? '—'} · #${inv.invoice_number} · ${kSEK} kSEK`,
        `Line: "${lineDesc}"`,
        ``,
        `👉 Review & approve: https://asap.algorithma.ai/invoices?bl_approve=${inv.id}`,
      ].join('\n')

      if (notify) await sendGoogleChatNotification(msg)
      initiated++
    } catch (err) {
      errors.push(`#${inv.invoice_number}: ${err instanceof Error ? err.message : 'unknown'}`)
    }
  }

  return { initiated, errors }
}

export async function getBLCredentialsConfigured(): Promise<boolean> {
  return !!(process.env.LUNDIFY_CLIENT_ID && process.env.LUNDIFY_CLIENT_SECRET)
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
