import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

export async function GET(
  _: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = createServerClient()

  const { data: card, error: cardErr } = await supabase
    .from('portfolio_cards')
    .select('card_key')
    .eq('id', id)
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
