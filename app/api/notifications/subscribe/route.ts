import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

const PLACEHOLDER_USER_ID = '00000000-0000-0000-0000-000000000001'

export async function POST(req: Request) {
  const body = (await req.json()) as { endpoint: string; p256dh: string; auth: string }
  const { endpoint, p256dh, auth } = body

  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('push_subscriptions')
    .upsert({ user_id: PLACEHOLDER_USER_ID, endpoint, p256dh, auth })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}

export async function DELETE(req: Request) {
  const body = (await req.json()) as { endpoint: string }
  const { endpoint } = body

  if (!endpoint) return NextResponse.json({ error: 'Missing endpoint' }, { status: 400 })

  const supabase = createServerClient()
  const { error } = await supabase
    .from('push_subscriptions')
    .delete()
    .eq('endpoint', endpoint)
    .eq('user_id', PLACEHOLDER_USER_ID)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return new NextResponse(null, { status: 204 })
}
