import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { getUserFromRequest } from '@/lib/auth'

export async function GET(req: Request) {
  const userId = await getUserFromRequest(req)
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerClient()

  // Get events linked to this user's portfolio cards via player_alerts
  const { data, error } = await supabase
    .from('player_alerts')
    .select(`
      id,
      is_read,
      portfolio_card_id,
      player_events (
        id,
        player_name,
        sport,
        event_type,
        title,
        summary,
        sentiment,
        severity,
        source_url,
        event_date
      )
    `)
    .eq('user_id', userId)
    .gt('player_events.expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(data ?? [])
}

export async function PATCH(req: Request) {
  const userId = await getUserFromRequest(req)
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await req.json()) as { id: string }
  if (!body.id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const supabase = createServerClient()
  const { error } = await supabase
    .from('player_alerts')
    .update({ is_read: true })
    .eq('id', body.id)
    .eq('user_id', userId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return new NextResponse(null, { status: 204 })
}
