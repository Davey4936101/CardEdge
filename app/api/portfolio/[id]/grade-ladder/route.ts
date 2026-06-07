import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { getUserFromRequest } from '@/lib/auth'
import { getGradeLadder } from '@/lib/grade/grade-ladder'

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUserFromRequest(req)
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const supabase = createServerClient()

  const { data: card, error } = await supabase
    .from('portfolio_cards')
    .select('card_key, player, year, set_name')
    .eq('id', id)
    .eq('user_id', userId)
    .single()

  if (error || !card) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  try {
    const ladder = await getGradeLadder(
      card.player as string,
      card.year as string | null,
      card.set_name as string,
      card.card_key as string
    )
    return NextResponse.json(ladder)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
