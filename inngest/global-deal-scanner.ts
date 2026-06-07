import { inngest } from './client'
import { createServerClient } from '@/lib/supabase/server'
import { searchListings } from '@/lib/ebay/rapidapi'
import type { EbayListing } from '@/lib/ebay/rapidapi'
import { calculateRoiPct } from '@/lib/fair-value'
import { resolveCompsForListing } from '@/lib/deals/comp-resolver'

const MIN_ROI_PCT = 10

// Curated queries covering the most liquid sports card market segments.
// Broad enough to surface a variety of deals; specific enough that sold
// comps from the same query are roughly comparable in value to the listings.
export const GLOBAL_SCAN_QUERIES = [
  // NFL
  { query: 'Patrick Mahomes rookie card PSA', player: 'Patrick Mahomes', sport: 'NFL' },
  { query: 'Josh Allen rookie card PSA', player: 'Josh Allen', sport: 'NFL' },
  { query: 'Justin Herbert rookie card', player: 'Justin Herbert', sport: 'NFL' },
  { query: 'Joe Burrow rookie card', player: 'Joe Burrow', sport: 'NFL' },
  { query: 'Lamar Jackson rookie card', player: 'Lamar Jackson', sport: 'NFL' },
  { query: 'CJ Stroud rookie card', player: 'CJ Stroud', sport: 'NFL' },
  { query: 'Caleb Williams rookie card 2024', player: 'Caleb Williams', sport: 'NFL' },
  // NBA
  { query: 'Victor Wembanyama rookie card', player: 'Victor Wembanyama', sport: 'NBA' },
  { query: 'Luka Doncic rookie card', player: 'Luka Doncic', sport: 'NBA' },
  { query: 'Jayson Tatum rookie card PSA', player: 'Jayson Tatum', sport: 'NBA' },
  { query: 'Ja Morant rookie card', player: 'Ja Morant', sport: 'NBA' },
  // Broad graded categories
  { query: 'PSA 10 rookie card football Prizm', player: null, sport: 'NFL' },
  { query: 'PSA 10 rookie card basketball Prizm', player: null, sport: 'NBA' },
] as const

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)
}

async function scanQuery(
  supabase: ReturnType<typeof createServerClient>,
  query: string,
  player: string | null,
  sport: string
): Promise<number> {
  let listings: EbayListing[]
  try {
    listings = await searchListings(query)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('429') || msg.toLowerCase().includes('too many')) {
      console.warn(`[global-scanner] rate limited on "${query}", skipping`)
      return 0
    }
    throw err
  }

  if (!listings.length) return 0

  // Resolve card-specific sold comps for each listing independently so that
  // a "Patrick Mahomes Prizm #177 PSA 10" listing doesn't inherit comps from
  // the broader "Patrick Mahomes rookie card PSA" query (which would blend in
  // Herbert, Allen, etc.).
  const resolvedListings = await Promise.all(
    listings.map(async (listing) => {
      try {
        const resolved = await resolveCompsForListing(listing, supabase, query)
        if (!resolved || !resolved.fairValue) return null
        const roi = calculateRoiPct(listing.price, resolved.fairValue.fairValue)
        if (roi < MIN_ROI_PCT) return null
        return { ...listing, cardKey: resolved.cardKey, fairValue: resolved.fairValue.fairValue, roi, lowConfidence: resolved.lowConfidence }
      } catch (err) {
        console.warn(`[global-scanner] comp resolution failed for "${listing.title}":`, err instanceof Error ? err.message : String(err))
        return null
      }
    })
  )

  const deals = resolvedListings.filter((d): d is NonNullable<typeof resolvedListings[number]> => d !== null)
  if (!deals.length) return 0

  let inserted = 0
  for (const deal of deals) {
    const { error } = await supabase.from('alerts').insert({
      watchlist_id: null,
      ebay_item_id: deal.itemId,
      card_title: deal.title,
      listed_price: deal.price,
      fair_value: Math.round(deal.fairValue * 100) / 100,
      roi_pct: Math.round(deal.roi * 100) / 100,
      grade: null,
      player,
      set_name: null,
      listing_url: deal.listingUrl,
      image_url: deal.imageUrl,
      end_time: deal.endTime ?? null,
      buying_format: deal.buyingFormat,
      sport,
    })

    if (error && error.code === '23505') continue // duplicate eBay item
    if (error) throw new Error(`Insert failed: ${error.message}`)
    inserted++
  }
  return inserted
}

// Full background scan — runs every 30 minutes via Inngest cron.
export const globalDealScanner = inngest.createFunction(
  { id: 'global-deal-scanner', triggers: [{ cron: '*/30 * * * *' }] },
  async ({ step }) => {
    const supabase = createServerClient()
    let totalAlerts = 0

    for (const { query, player, sport } of GLOBAL_SCAN_QUERIES) {
      const count = await step.run(`scan-${slugify(query)}`, () =>
        scanQuery(supabase, query, player, sport)
      )
      totalAlerts += count
    }

    // Prune global alerts older than 7 days to keep the table lean.
    await step.run('prune-old-global-alerts', async () => {
      const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
      await supabase
        .from('alerts')
        .delete()
        .is('watchlist_id', null)
        .lt('created_at', cutoff)
    })

    return { queriesScanned: GLOBAL_SCAN_QUERIES.length, alertsGenerated: totalAlerts }
  }
)

// Exported for use by the on-demand scan API route.
// Clears stale global alerts first so only fresh BIN-only data is shown,
// then runs queries sequentially to avoid bursting the sold comps rate limit.
export async function runQuickScan(
  supabase: ReturnType<typeof createServerClient>,
  querySlice: ReadonlyArray<{ query: string; player: string | null; sport: string }> = GLOBAL_SCAN_QUERIES.slice(0, 3)
): Promise<number> {
  // Wipe existing global alerts — they may contain auction listings from
  // before the BIN-only filter was added, and stale data is misleading.
  await supabase.from('alerts').delete().is('watchlist_id', null)

  let total = 0
  for (const { query, player, sport } of querySlice) {
    total += await scanQuery(supabase, query, player, sport)
    // 600ms between queries keeps sold comps API under its per-second limit
    await new Promise((r) => setTimeout(r, 600))
  }
  return total
}
