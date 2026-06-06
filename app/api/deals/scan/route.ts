import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { runQuickScan, GLOBAL_SCAN_QUERIES } from '@/inngest/global-deal-scanner'

// On-demand scan — called by the DealFeed when the page opens with an
// empty feed. Runs 4 queries in parallel (~5-8s), stores results in the
// alerts table, and returns a count. The realtime subscription in DealFeed
// picks up new rows as they're inserted.
export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as { full?: boolean }
    const supabase = createServerClient()

    // full=true scans all 13 queries (used by the Refresh button after
    // the initial quick scan); default scans the first 4 in parallel.
    const slice = body.full ? GLOBAL_SCAN_QUERIES : GLOBAL_SCAN_QUERIES.slice(0, 4)
    const newDeals = await runQuickScan(supabase, slice)

    return NextResponse.json({ newDeals, queriesScanned: slice.length })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
