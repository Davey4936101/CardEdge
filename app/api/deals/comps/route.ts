import { NextResponse } from 'next/server'
import { getUserFromRequest } from '@/lib/auth'
import { fetchSoldComps } from '@/lib/ebay/rapidapi'
import { calculateFairValue } from '@/lib/fair-value'

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
    const comps = await fetchSoldComps(query)

    // Sort newest-first for display
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
