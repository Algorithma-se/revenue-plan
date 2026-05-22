'use server'

import Anthropic from '@anthropic-ai/sdk'
import { createAdminSupabase } from '@/lib/supabase-admin'
import { createServerSupabase } from '@/lib/supabase-server'
import type { SowDocument, SowDocumentType, SowDeliverable, SowParsedRaw } from '@/types/database'

const ALLOWED_MIME = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]
const MAX_BYTES = 20 * 1024 * 1024 // 20 MB

export async function uploadSow(formData: FormData): Promise<{ data?: SowDocument; error?: string }> {
  try {
    const file           = formData.get('file') as File
    const itemId         = formData.get('manual_revenue_item_id') as string
    const documentType   = (formData.get('document_type') as SowDocumentType) ?? 'original'

    if (!file || !itemId) return { error: 'Missing file or item id' }
    if (!ALLOWED_MIME.includes(file.type)) return { error: 'Only PDF and DOCX files are supported' }
    if (file.size > MAX_BYTES) return { error: 'File must be smaller than 20 MB' }

    const admin = createAdminSupabase()

    const { data: existing } = await admin
      .from('sow_documents')
      .select('version_number')
      .eq('manual_revenue_item_id', itemId)
      .order('version_number', { ascending: false })
      .limit(1)

    const versionNumber = existing && existing.length > 0 ? existing[0].version_number + 1 : 1

    const bytes       = Buffer.from(await file.arrayBuffer())
    const storagePath = `${itemId}/${Date.now()}-${file.name}`

    const { error: uploadError } = await admin.storage
      .from('sow-documents')
      .upload(storagePath, bytes, { contentType: file.type, upsert: false })

    if (uploadError) return { error: `Storage upload failed: ${uploadError.message}` }

    const { data, error } = await admin
      .from('sow_documents')
      .insert({
        manual_revenue_item_id: itemId,
        document_type:          documentType,
        version_number:         versionNumber,
        file_name:              file.name,
        file_type:              file.type,
        storage_path:           storagePath,
        file_size_bytes:        file.size,
        parse_status:           'pending',
      })
      .select()
      .single()

    if (error) return { error: `DB insert failed: ${error.message}` }
    return { data: data as SowDocument }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Upload failed' }
  }
}

export async function parseSow(sowId: string): Promise<{ data?: SowDocument; error?: string }> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return { error: 'ANTHROPIC_API_KEY not configured' }

  const admin = createAdminSupabase()

  const { data: sow, error: fetchErr } = await admin
    .from('sow_documents')
    .update({ parse_status: 'parsing', updated_at: new Date().toISOString() })
    .eq('id', sowId)
    .select()
    .single()

  if (fetchErr || !sow) return { error: 'SOW document not found' }

  try {
    const { data: fileBytes, error: dlErr } = await admin.storage
      .from('sow-documents')
      .download(sow.storage_path)

    if (dlErr || !fileBytes) throw new Error(`Storage download failed: ${dlErr?.message}`)

    const buffer = Buffer.from(await fileBytes.arrayBuffer())
    const client = new Anthropic({ apiKey })

    const prompt = `You are extracting invoicing data from a Statement of Work or services agreement. Your output drives invoice generation — precision matters. Reply ONLY with valid JSON, no markdown, no surrounding text.

STEP 1 — Classify the PRIMARY invoicing model (use the model that covers most of the contract value):
• "milestone"          — fixed amounts triggered by completing specific deliverables or events
• "time_and_materials" — periodic invoices = hours worked × hourly/daily rate
• "capacity"           — recurring monthly fee for a dedicated team, FTE allocation, or retainer (same amount each period regardless of hours)
• "fixed_fee"          — one or a few lump-sum payments on specific dates, not tied to milestones

STEP 2 — Output this exact JSON structure:

{
  "client_name": string | null,
  "invoicing_model": "milestone" | "time_and_materials" | "capacity" | "fixed_fee" | null,
  "total_value_sek": number | null,
  "currency": string | null,
  "start_date": "YYYY-MM-DD" | null,
  "end_date": "YYYY-MM-DD" | null,
  "payment_terms": string | null,
  "hourly_rate_sek": number | null,
  "fte_count": number | null,
  "monthly_fee_sek": number | null,
  "invoice_timing": "month_end" | "month_start" | "specific_date" | "on_completion" | null,
  "deliverables": [
    {
      "label": string,
      "invoice_date": "YYYY-MM-DD" | null,
      "invoice_timing": "month_end" | "month_start" | "specific_date" | "on_completion" | null,
      "due_date": "YYYY-MM-DD" | null,
      "amount_sek": number | null,
      "estimated_hours": number | null
    }
  ],
  "monthly_hours": [
    { "month": "YYYY-MM", "hours": number }
  ]
}

CRITICAL — Rate period detection:
Before filling any amount field, identify the stated billing period:
  HOURLY rate  → hourly_rate_sek = rate × conversion. monthly_fee_sek = null unless separately stated.
  DAILY rate   → hourly_rate_sek = daily_rate / 8 × conversion.
  WEEKLY rate  → monthly_fee_sek = weekly_rate × 4.35 × conversion. hourly_rate_sek = weekly_rate / 40 × conversion.
  MONTHLY rate → monthly_fee_sek = monthly_rate × conversion directly.
  NEVER use a weekly, daily, or hourly figure as a monthly fee without conversion.

Field rules:
total_value_sek — convert to SEK (EUR≈11, USD≈10, GBP≈13). Use the stated total or upper-range estimate. If not stated, sum all deliverable amounts.
currency — original contract currency code (SEK, EUR, USD, …).
hourly_rate_sek — per-hour rate converted to SEK. Set for T&M and as the additional-hours rate in capacity contracts. Null if no hourly rate exists.
fte_count — number of dedicated consultants/FTEs if stated (e.g. "2 FTE", "team of 3"). Null otherwise.
monthly_fee_sek — the MONTHLY billing amount after rate-period conversion (see above). For capacity: this is what gets invoiced each month. For partial first/last months, still store the full-month rate here; pro-rate in the deliverable amounts instead.
invoice_timing (top-level) — the default timing for all invoices in this contract.
deliverables — list EVERY invoice that should be raised, one entry per invoice event:
  • If a contract has multiple phases or billing blocks (e.g. an initial T&M block followed by a capacity retainer), create separate deliverable entries for EACH invoice in EACH phase.
  • capacity / retainer: one entry per calendar month in the contract period. For partial months (contract starts or ends mid-month), pro-rate: amount = monthly_fee_sek × (days_in_period / days_in_month).
  • time_and_materials: one entry per billing period with hours and amount.
  • milestone / fixed_fee: one entry per payment event.
deliverables[].label — descriptive label, e.g. "May 2026 capacity", "Initial T&M — May 1–17", "Phase 1 milestone".
deliverables[].invoice_date — the calendar date to issue the invoice:
  month_end → last calendar day of the billing month (e.g. 2026-05-31).
  month_start → first day of the billing month.
  specific_date → the stated date.
  on_completion → the deliverable's stated completion or due date; estimate if not given.
deliverables[].amount_sek — amount in SEK for this specific invoice. For capacity: pro-rated monthly_fee_sek if partial month, else full monthly_fee_sek. For T&M: hours × hourly_rate_sek. All converted to SEK.
estimated_hours — for T&M only: hours for that period. Null for capacity/milestone/fixed_fee.
monthly_hours — hours billable per calendar month. For T&M: from contract or distribute total hours. For capacity: fte_count × 160 h/month per FTE. Empty for milestone/fixed_fee.
Use null for any field that cannot be determined.`

    let messageContent: Anthropic.MessageParam['content']

    if (sow.file_type === 'application/pdf') {
      messageContent = [
        {
          type: 'document',
          source: { type: 'base64', media_type: 'application/pdf', data: buffer.toString('base64') },
        } as Anthropic.DocumentBlockParam,
        { type: 'text', text: prompt },
      ]
    } else {
      // DOCX — extract text with mammoth
      const mammoth = await import('mammoth')
      const { value: text } = await mammoth.extractRawText({ buffer })
      messageContent = `${prompt}\n\nSOW TEXT:\n${text}`
    }

    const message = await client.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 4096,
      messages:   [{ role: 'user', content: messageContent }],
    })

    const block = message.content[0]
    if (block.type !== 'text') throw new Error('Unexpected response from Claude')

    const jsonText = block.text.trim().replace(/^```json\s*/i, '').replace(/```\s*$/, '')
    const parsed = JSON.parse(jsonText) as SowParsedRaw

    const { data: updated, error: updateErr } = await admin
      .from('sow_documents')
      .update({
        parse_status:           'done',
        parsed_client_name:     parsed.client_name,
        parsed_total_value_sek: parsed.total_value_sek,
        parsed_start_date:      parsed.start_date,
        parsed_end_date:        parsed.end_date,
        parsed_payment_terms:   parsed.payment_terms,
        parsed_deliverables:    parsed.deliverables ?? [],
        parsed_raw:             parsed,
        updated_at:             new Date().toISOString(),
      })
      .eq('id', sowId)
      .select()
      .single()

    if (updateErr) throw new Error(`DB update failed: ${updateErr.message}`)
    return { data: updated as SowDocument }

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await admin
      .from('sow_documents')
      .update({ parse_status: 'error', parse_error: msg, updated_at: new Date().toISOString() })
      .eq('id', sowId)
    return { error: msg }
  }
}

export async function deleteSow(sowId: string, deleteInvoices = false): Promise<void> {
  const admin = createAdminSupabase()

  const { data: sow } = await admin
    .from('sow_documents')
    .select('storage_path')
    .eq('id', sowId)
    .single()

  if (deleteInvoices) {
    await admin.from('invoices').delete().eq('sow_document_id', sowId)
  }

  if (sow?.storage_path) {
    await admin.storage.from('sow-documents').remove([sow.storage_path])
  }

  await admin.from('sow_documents').delete().eq('id', sowId)
}

export async function getSowDocuments(itemId: string): Promise<SowDocument[]> {
  const supabase = await createServerSupabase()
  const { data, error } = await supabase
    .from('sow_documents')
    .select('*')
    .eq('manual_revenue_item_id', itemId)
    .order('version_number', { ascending: true })

  if (error) throw new Error(error.message)
  return (data ?? []) as SowDocument[]
}

export async function getSowDownloadUrl(storagePath: string): Promise<string> {
  const admin = createAdminSupabase()
  const { data, error } = await admin.storage
    .from('sow-documents')
    .createSignedUrl(storagePath, 60 * 60) // 1 hour

  if (error || !data) throw new Error('Could not generate download URL')
  return data.signedUrl
}
