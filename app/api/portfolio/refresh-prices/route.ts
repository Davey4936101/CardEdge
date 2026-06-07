import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { getUserFromRequest } from '@/lib/auth'
import { fetchSoldComps } from '@/lib/ebay/rapidapi'
import { calculateFairValue } from '@/lib/fair-value'
import type { PortfolioCard } from '@/lib/portfolio/types'

export async function POST(req: Request) {
  const userId = await getUserFromRequest(req)
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerClient()
  const { data: cards } = await supabase
    .from('portfolio_cards')
    .select('*')
    .eq('user_id', userId)
    .neq('status', 'sold')
    .is('current_value_override', null)

  if (!cards?.length) return NextResponse.json({ updated: 0 })

  let updated = 0
  for (const card of cards as PortfolioCard[]) {
    try {
      const query = [card.player, card.set_name, card.year, card.grade].filter(Boolean).join(' ')
      const comps = await fetchSoldComps(query)
      const fv = calculateFairValue(comps)
      if (!fv) continue
      await supabase
        .from('portfolio_cards')
        .update({
          current_value_fetched: Math.round(fv.fairValue * 100) / 100,
          current_value_fetched_at: new Date().toISOString(),
        })
        .eq('id', card.id)
        .eq('user_id', userId)
      updated++
    } catch {
      // skip failed cards
    }
  }

  return NextResponse.json({ updated })
}
