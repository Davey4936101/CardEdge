import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { getUserFromRequest } from '@/lib/auth'

export async function POST(req: Request) {
  const userId = await getUserFromRequest(req)
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerClient()

  // Fetch this user's watchlist IDs so we can scope the update correctly
  const { data: watchlists } = await supabase
    .from('watchlists')
    .select('id')
    .eq('user_id', userId)

  const watchlistIds = (watchlists ?? []).map((w: { id: string }) => w.id)

  // Mark global alerts (shared feed) and this user's watchlist alerts as read
  const query = supabase
    .from('alerts')
    .update({ is_read: true })
    .eq('is_read', false)

  const { error } = watchlistIds.length > 0
    ? await query.or(`watchlist_id.is.null,watchlist_id.in.(${watchlistIds.join(',')})`)
    : await query.is('watchlist_id', null)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
