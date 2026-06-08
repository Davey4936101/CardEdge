import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { getUserFromRequest } from '@/lib/auth'
import { runQuickScan, GLOBAL_SCAN_QUERIES } from '@/inngest/global-deal-scanner'

// Allow up to 60s — the scan runs 2–4 eBay queries sequentially with comp
// resolution for each listing. Vercel's default (300s on Pro) covers this,
// but the explicit export makes the intent clear.
export const maxDuration = 60

// On-demand scan — called by the DealFeed when the page opens with an
// empty feed or the user clicks Refresh. Runs queries sequentially, stores
// results in the alerts table, and returns a count.
export async function POST(req: Request) {
  const userId = await getUserFromRequest(req)
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = (await req.json().catch(() => ({}))) as { full?: boolean }
    const supabase = createServerClient()

    // quick scan: 2 queries (~15s); full scan: 4 queries (~30s, used by Refresh)
    const slice = body.full ? GLOBAL_SCAN_QUERIES.slice(0, 4) : GLOBAL_SCAN_QUERIES.slice(0, 2)

    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Scan timed out after 55s')), 55_000)
    )
    const newDeals = await Promise.race([runQuickScan(supabase, slice), timeout])

    if (newDeals === 0) {
      // Surface a diagnostic hint when no deals were produced. This commonly
      // means EBAY_CLIENT_ID / EBAY_CLIENT_SECRET are not set in Vercel env
      // vars — eBay's HTML scraping is blocked on data-center IPs.
      console.warn(
        '[deals/scan] Scan returned 0 new deals.',
        'Verify EBAY_CLIENT_ID and EBAY_CLIENT_SECRET are set in Vercel environment variables.'
      )
    }

    // Fire grade-potential enrichment for new alerts (best-effort, non-blocking)
    if (newDeals > 0) {
      const { data: freshAlerts } = await supabase
        .from('alerts')
        .select('id, image_url, card_title, listed_price')
        .order('created_at', { ascending: false })
        .limit(newDeals)

      if (freshAlerts && freshAlerts.length > 0) {
        const { inngest: inngestClient } = await import('@/inngest/client')
        await inngestClient.send(
          (freshAlerts as Array<{ id: string; image_url: string | null; card_title: string; listed_price: number }>).map((a) => ({
            name: 'deals/grade-potential.requested' as const,
            data: {
              alertId: a.id,
              imageUrl: a.image_url,
              cardTitle: a.card_title,
              listedPrice: Number(a.listed_price),
            },
          }))
        )
      }
    }

    return NextResponse.json({ newDeals, queriesScanned: slice.length })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('429') || msg.toLowerCase().includes('too many')) {
      return NextResponse.json({ error: 'Rate limited — try again in a minute', newDeals: 0 }, { status: 429 })
    }
    console.error('[deals/scan] Scan failed:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
