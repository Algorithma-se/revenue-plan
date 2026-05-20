'use server'

import { createClient } from '@supabase/supabase-js'
import { createServerSupabase } from '@/lib/supabase-server'

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

async function requireAuth() {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  return user
}

export async function getAllowedEmails(): Promise<{ email: string; created_at: string }[]> {
  await requireAuth()
  const { data, error } = await adminClient()
    .from('allowed_emails')
    .select('email, created_at')
    .order('email')
  if (error) throw error
  return (data ?? []) as { email: string; created_at: string }[]
}

export async function addAllowedEmail(email: string): Promise<void> {
  await requireAuth()
  const normalized = email.trim().toLowerCase()
  if (!normalized.includes('@')) throw new Error('Invalid email')
  const { error } = await adminClient()
    .from('allowed_emails')
    .upsert({ email: normalized }, { onConflict: 'email' })
  if (error) throw error
}

export async function removeAllowedEmail(email: string): Promise<void> {
  const user = await requireAuth()
  if (user.email?.toLowerCase() === email.toLowerCase()) {
    throw new Error("You can't remove your own access")
  }
  const { error } = await adminClient()
    .from('allowed_emails')
    .delete()
    .eq('email', email)
  if (error) throw error
}
