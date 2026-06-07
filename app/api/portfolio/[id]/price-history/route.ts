import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { getUserFromRequest } from '@/lib/auth'

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUserFromRequest(req)
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const supabase = createServerClient()

  const { data: card, error: cardErr } = await supabase
    .from('portfolio_cards')
    .select('card_key')
    .eq('id', id)
    .eq('user_id', userId)
    .single()

  if (cardErr || !card) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const ninetyDaysAgo = new Date()
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)

  const { data, error } = await supabase
    .from('price_cache')
    .select('sale_price, sale_date')
    .eq('card_key', card.card_key)
    .gte('sale_date', ninetyDaysAgo.toISOString())
    .order('sale_date', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json((data ?? []).map((r) => ({ price: r.sale_price, date: r.sale_date })))
}
