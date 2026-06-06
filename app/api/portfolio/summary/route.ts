import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { summarize } from '@/lib/portfolio/pnl'
import type { PortfolioCard } from '@/lib/portfolio/types'

export async function GET() {
  const supabase = createServerClient()
  const [cardsRes, alertsRes] = await Promise.all([
    supabase.from('portfolio_cards').select('*'),
    supabase.from('alerts').select('id', { count: 'exact', head: true }).eq('is_read', false),
  ])
  if (cardsRes.error) return NextResponse.json({ error: cardsRes.error.message }, { status: 500 })
  return NextResponse.json(summarize((cardsRes.data ?? []) as PortfolioCard[], alertsRes.count ?? 0))
}
