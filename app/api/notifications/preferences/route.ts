import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

const PLACEHOLDER_USER_ID = '00000000-0000-0000-0000-000000000001'

export async function GET() {
  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('notification_preferences')
    .select('*')
    .eq('user_id', PLACEHOLDER_USER_ID)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Return defaults if no row exists
  if (!data) {
    return NextResponse.json({
      email_enabled: false,
      email_address: null,
      push_enabled: false,
      in_app_enabled: true,
    })
  }

  return NextResponse.json(data)
}

export async function PATCH(req: Request) {
  const body = (await req.json()) as {
    email_enabled?: boolean
    email_address?: string
    push_enabled?: boolean
    in_app_enabled?: boolean
  }

  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('notification_preferences')
    .upsert({
      user_id: PLACEHOLDER_USER_ID,
      ...body,
      updated_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
