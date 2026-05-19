import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

export async function DELETE(req: NextRequest) {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { item_id } = await req.json()
  if (!item_id) return NextResponse.json({ error: 'Missing item_id' }, { status: 400 })

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  // Get the source_id (meeting UUID in Sales Weekly) before deleting
  const { data: item } = await admin
    .from('revenue_items')
    .select('source_id')
    .eq('id', item_id)
    .single()

  if (!item) return NextResponse.json({ error: 'Item not found' }, { status: 404 })

  // Clear the revenue plan stamp on the Sales Weekly meeting
  await admin
    .from('sales_meetings')
    .update({ revenue_plan_pushed_at: null, revenue_plan_type: null })
    .eq('id', item.source_id)

  // Delete the revenue_items row (allocations cascade)
  await admin.from('revenue_items').delete().eq('id', item_id)

  return NextResponse.json({ success: true })
}
