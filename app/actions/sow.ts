'use server'

import Anthropic from '@anthropic-ai/sdk'
import { createAdminSupabase } from '@/lib/supabase-admin'
import { createServerSupabase } from '@/lib/supabase-server'
import type { SowDocument, SowDocumentType, SowDeliverable } from '@/types/database'

const ALLOWED_MIME = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]
const MAX_BYTES = 20 * 1024 * 1024 // 20 MB

export async function uploadSow(formData: FormData): Promise<SowDocument> {
  const file           = formData.get('file') as File
  const itemId         = formData.get('manual_revenue_item_id') as string
  const documentType   = (formData.get('document_type') as SowDocumentType) ?? 'original'

  if (!file || !itemId) throw new Error('Missing file or item id')
  if (!ALLOWED_MIME.includes(file.type)) throw new Error('Only PDF and DOCX files are supported')
  if (file.size > MAX_BYTES) throw new Error('File must be smaller than 20 MB')

  const admin = createAdminSupabase()

  // Determine next version number
  const { data: existing } = await admin
    .from('sow_documents')
    .select('version_number')
    .eq('manual_revenue_item_id', itemId)
    .order('version_number', { ascending: false })
    .limit(1)

  const versionNumber = existing && existing.length > 0 ? existing[0].version_number + 1 : 1

  const bytes        = Buffer.from(await file.arrayBuffer())
  const storagePath  = `${itemId}/${Date.now()}-${file.name}`

  const { error: uploadError } = await admin.storage
    .from('sow-documents')
    .upload(storagePath, bytes, { contentType: file.type, upsert: false })

  if (uploadError) throw new Error(`Storage upload failed: ${uploadError.message}`)

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

  if (error) throw new Error(`DB insert failed: ${error.message}`)
  return data as SowDocument
}

export async function parseSow(sowId: string): Promise<SowDocument> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured')

  const admin = createAdminSupabase()

  const { data: sow, error: fetchErr } = await admin
    .from('sow_documents')
    .update({ parse_status: 'parsing', updated_at: new Date().toISOString() })
    .eq('id', sowId)
    .select()
    .single()

  if (fetchErr || !sow) throw new Error('SOW document not found')

  try {
    const { data: fileBytes, error: dlErr } = await admin.storage
      .from('sow-documents')
      .download(sow.storage_path)

    if (dlErr || !fileBytes) throw new Error(`Storage download failed: ${dlErr?.message}`)

    const buffer = Buffer.from(await fileBytes.arrayBuffer())
    const client = new Anthropic({ apiKey })

    const prompt = `Extract from this Statement of Work. Reply ONLY with valid JSON, no other text:
{"client_name":string|null,"total_value_sek":number|null,"start_date":"YYYY-MM-DD"|null,"end_date":"YYYY-MM-DD"|null,"payment_terms":string|null,"deliverables":[{"label":string,"due_date":"YYYY-MM-DD"|null}]}`

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
      max_tokens: 1024,
      messages:   [{ role: 'user', content: messageContent }],
    })

    const block = message.content[0]
    if (block.type !== 'text') throw new Error('Unexpected response from Claude')

    const jsonText = block.text.trim().replace(/^```json\s*/i, '').replace(/```\s*$/, '')
    const parsed = JSON.parse(jsonText) as {
      client_name: string | null
      total_value_sek: number | null
      start_date: string | null
      end_date: string | null
      payment_terms: string | null
      deliverables: SowDeliverable[]
    }

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
    return updated as SowDocument

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await admin
      .from('sow_documents')
      .update({ parse_status: 'error', parse_error: msg, updated_at: new Date().toISOString() })
      .eq('id', sowId)
    throw err
  }
}

export async function deleteSow(sowId: string): Promise<void> {
  const admin = createAdminSupabase()

  const { data: sow } = await admin
    .from('sow_documents')
    .select('storage_path')
    .eq('id', sowId)
    .single()

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
