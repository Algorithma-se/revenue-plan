'use server'

import { createClient } from '@supabase/supabase-js'
import { createServerSupabase } from '@/lib/supabase-server'
import { createAdminSupabase } from '@/lib/supabase-admin'

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

export async function getAllowedEmails(): Promise<{ email: string; created_at: string; last_login_at: string | null }[]> {
  await requireAuth()
  const [{ data, error }, { data: { users } }] = await Promise.all([
    adminClient().from('allowed_emails').select('email, created_at').order('email'),
    adminClient().auth.admin.listUsers({ perPage: 1000 }),
  ])
  if (error) throw error

  const loginMap = new Map(
    (users ?? []).map(u => [u.email?.toLowerCase() ?? '', u.last_sign_in_at ?? null])
  )

  return ((data ?? []) as { email: string; created_at: string }[]).map(row => ({
    ...row,
    last_login_at: loginMap.get(row.email.toLowerCase()) ?? null,
  }))
}

export async function addAllowedEmail(email: string): Promise<void> {
  await requireAuth()
  const normalized = email.trim().toLowerCase()
  if (!normalized.includes('@')) throw new Error('Invalid email')
  if (!normalized.endsWith('@algorithma.ai')) throw new Error('Only @algorithma.ai email addresses can be added')
  const { error } = await adminClient()
    .from('allowed_emails')
    .upsert({ email: normalized }, { onConflict: 'email' })
  if (error) throw error
}

export async function getFeatureFlag(key: string): Promise<boolean> {
  await requireAuth()
  const { data } = await adminClient()
    .from('feature_flags')
    .select('enabled')
    .eq('key', key)
    .single()
  return data?.enabled ?? true
}

export async function setFeatureFlag(key: string, enabled: boolean): Promise<void> {
  await requireAuth()
  const { error } = await adminClient()
    .from('feature_flags')
    .update({ enabled, updated_at: new Date().toISOString() })
    .eq('key', key)
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

export async function getAppSetting(key: string): Promise<string | null> {
  try {
    await requireAuth()
    const { data } = await createAdminSupabase()
      .from('app_settings')
      .select('value')
      .eq('key', key)
      .maybeSingle()
    return data?.value ?? null
  } catch {
    return null
  }
}

export async function setAppSetting(key: string, value: string): Promise<{ error?: string }> {
  try {
    await requireAuth()
    const { error } = await createAdminSupabase()
      .from('app_settings')
      .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' })
    if (error) return { error: error.message }
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to save' }
  }
}
