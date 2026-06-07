import { NextResponse } from 'next/server'
import { getUserFromRequest } from '@/lib/auth'
import { fetchSoldComps } from '@/lib/ebay/rapidapi'
import { calculateFairValue } from '@/lib/fair-value'
import { createServerClient } from '@/lib/supabase/server'

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 80)
}

// GET /api/deals/comps?query=<encoded search string>
// Returns recent sold comps and computed fair value for a given card query.
// Used by the deal detail sheet for comp verification.
export async function GET(req: Request) {
  const userId = await getUserFromRequest(req)
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const query = searchParams.get('query')?.trim()
  if (!query) return NextResponse.json({ error: 'query param required' }, { status: 400 })

  try {
    const supabase = createServerClient()
    const cacheKey = `query:${slugify(query)}`

    // Check price_cache first — populated by the scanner when Finding API succeeds
    const { data: cached } = await supabase
      .from('price_cache')
      .select('sale_price, sale_date')
      .eq('card_key', cacheKey)
      .gt('created_at', new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString())

    let comps = (cached ?? []).map((r: { sale_price: number; sale_date: string }) => ({
      price: Number(r.sale_price),
      saleDate: new Date(r.sale_date),
    }))

    // If no cached comps, try the Finding API (may be unreachable from data-center IPs)
    if (comps.length < 3) {
      try {
        const fetched = await Promise.race([
          fetchSoldComps(query),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Finding API timeout')), 6_000)
          ),
        ])
        if (fetched.length >= 3) {
          comps = fetched
          // Save to cache so subsequent opens are instant
          const rows = comps.map((c) => ({
            card_key: cacheKey,
            sale_price: c.price,
            sale_date: c.saleDate.toISOString(),
            source: 'ebay',
          }))
          await supabase.from('price_cache').delete().eq('card_key', cacheKey)
          await supabase.from('price_cache').insert(rows)
        }
      } catch {
        // Finding API unreachable from this server environment — return empty gracefully
      }
    }

    const sorted = [...comps].sort((a, b) => b.saleDate.getTime() - a.saleDate.getTime())
    const fvResult = calculateFairValue(comps)

    return NextResponse.json({
      query,
      comps: sorted.map((c) => ({
        price: c.price,
        saleDate: c.saleDate.toISOString(),
      })),
      fairValue: fvResult ? Math.round(fvResult.fairValue * 100) / 100 : null,
      compCount: comps.length,
      oldestComp: fvResult ? fvResult.oldestComp.toISOString() : null,
      newestComp: fvResult ? fvResult.newestComp.toISOString() : null,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('429') || msg.toLowerCase().includes('too many')) {
      return NextResponse.json({ error: 'Rate limited — try again in a minute' }, { status: 429 })
    }
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
