import { inngest } from './client'
import { createServerClient } from '@/lib/supabase/server'
import { searchListings, fetchSoldComps } from '@/lib/ebay/rapidapi'
import type { EbayListing, SoldComp } from '@/lib/ebay/rapidapi'
import { calculateFairValue, calculateRoiPct } from '@/lib/fair-value'

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

// IQR-trimmed mean of a price array. Returns null if fewer than 3 prices.
function peerFairValue(prices: number[]): number | null {
  if (prices.length < 3) return null
  const sorted = [...prices].sort((a, b) => a - b)
  const q1 = sorted[Math.floor(sorted.length * 0.25)]
  const q3 = sorted[Math.floor(sorted.length * 0.75)]
  const iqr = q3 - q1
  const trimmed = sorted.filter((p) => p >= q1 - 1.5 * iqr && p <= q3 + 1.5 * iqr)
  if (trimmed.length < 3) return null
  return trimmed.reduce((a, b) => a + b, 0) / trimmed.length
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

  // Attempt ONE query-level sold-comps fetch (capped at 7 s).
  // svcs.ebay.com can be unreachable from data-center IPs; when it is, we
  // fall back to peer pricing derived from the active BIN listings instead.
  let fairValue: number | null = null
  try {
    const comps = await Promise.race<SoldComp[]>([
      fetchSoldComps(query),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('comp timeout')), 7_000)
      ),
    ])
    const fv = calculateFairValue(comps)
    if (fv) fairValue = fv.fairValue
  } catch {
    console.warn(`[global-scanner] sold comps unavailable for "${query}", using peer pricing`)
  }

  // Peer-pricing fallback: IQR-trimmed mean of active BIN prices.
  // For liquid graded cards, active BIN prices track sold prices closely.
  if (fairValue === null) {
    fairValue = peerFairValue(listings.map((l) => l.price))
  }

  if (fairValue === null) {
    console.warn(`[global-scanner] no fair value for "${query}", skipping`)
    return 0
  }

  let inserted = 0
  for (const listing of listings) {
    const roi = calculateRoiPct(listing.price, fairValue)
    if (roi < MIN_ROI_PCT) continue

    const { error } = await supabase.from('alerts').insert({
      watchlist_id: null,
      ebay_item_id: listing.itemId,
      card_title: listing.title,
      listed_price: listing.price,
      fair_value: Math.round(fairValue * 100) / 100,
      roi_pct: Math.round(roi * 100) / 100,
      grade: null,
      player,
      set_name: null,
      listing_url: listing.listingUrl,
      image_url: listing.imageUrl,
      end_time: listing.endTime ?? null,
      buying_format: listing.buyingFormat,
      sport,
    })

    if (error && error.code === '23505') continue // duplicate eBay item
    if (error) throw new Error(`Insert failed [${error.code}]: ${error.message} — details: ${error.details ?? 'none'} hint: ${error.hint ?? 'none'}`)
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
// Runs queries sequentially (600ms apart) then prunes alerts older than 2 hours.
// Pruning AFTER scanning means a failed or empty scan never wipes the feed.
export async function runQuickScan(
  supabase: ReturnType<typeof createServerClient>,
  querySlice: ReadonlyArray<{ query: string; player: string | null; sport: string }> = GLOBAL_SCAN_QUERIES.slice(0, 3)
): Promise<number> {
  let total = 0
  for (const { query, player, sport } of querySlice) {
    total += await scanQuery(supabase, query, player, sport)
    // 600ms between queries keeps sold comps API under its per-second limit
    await new Promise((r) => setTimeout(r, 600))
  }

  // Prune global alerts older than 2 hours so stale deals don't accumulate.
  // New inserts for the same ebay_item_id are silently skipped (unique constraint),
  // so recently-seen deals keep their original timestamp and are cleaned up here.
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
  await supabase.from('alerts').delete().is('watchlist_id', null).lt('created_at', twoHoursAgo)

  return total
}
