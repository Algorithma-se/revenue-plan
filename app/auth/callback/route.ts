import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')

  if (code) {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => cookieStore.getAll(),
          setAll: (cookiesToSet) => {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          },
        },
      }
    )
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      const { data: { user } } = await supabase.auth.getUser()
      const email = user?.email?.toLowerCase()
      if (!email) {
        await supabase.auth.signOut()
        return NextResponse.redirect(new URL('/login?error=auth_failed', origin))
      }

      const adminClient = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { autoRefreshToken: false, persistSession: false } }
      )
      const { data: allowed } = await adminClient
        .from('allowed_emails')
        .select('email')
        .eq('email', email)
        .maybeSingle()

      if (!allowed) {
        await supabase.auth.signOut()
        return NextResponse.redirect(new URL('/login?error=domain', origin))
      }

      return NextResponse.redirect(new URL('/plan', origin))
    }
  }

  return NextResponse.redirect(new URL('/login?error=auth_failed', origin))
}
