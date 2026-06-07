import { inngest } from './client'
import { createServerClient } from '@/lib/supabase/server'
import { searchListings, fetchSoldComps } from '@/lib/ebay/rapidapi'
import { calculateFairValue, calculateRoiPct } from '@/lib/fair-value'

const MIN_ROI_PCT = 10

// Curated queries covering the most liquid sports card market segments.
// Broad enough to surface a variety of deals; specific enough that sold
// comps from the same query are roughly comparable in value to the listings.
export const GLOBAL_SCAN_QUERIES = [
  // NFL
  { query: 'Patrick Mahomes rookie card PSA', player: 'Patrick Mahomes' },
  { query: 'Josh Allen rookie card PSA', player: 'Josh Allen' },
  { query: 'Justin Herbert rookie card', player: 'Justin Herbert' },
  { query: 'Joe Burrow rookie card', player: 'Joe Burrow' },
  { query: 'Lamar Jackson rookie card', player: 'Lamar Jackson' },
  { query: 'CJ Stroud rookie card', player: 'CJ Stroud' },
  { query: 'Caleb Williams rookie card 2024', player: 'Caleb Williams' },
  // NBA
  { query: 'Victor Wembanyama rookie card', player: 'Victor Wembanyama' },
  { query: 'Luka Doncic rookie card', player: 'Luka Doncic' },
  { query: 'Jayson Tatum rookie card PSA', player: 'Jayson Tatum' },
  { query: 'Ja Morant rookie card', player: 'Ja Morant' },
  // Broad graded categories
  { query: 'PSA 10 rookie card football Prizm', player: null },
  { query: 'PSA 10 rookie card basketball Prizm', player: null },
] as const

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)
}

async function scanQuery(
  supabase: ReturnType<typeof createServerClient>,
  query: string,
  player: string | null
): Promise<number> {
  let listings, comps
  try {
    ;[listings, comps] = await Promise.all([
      searchListings(query),
      fetchSoldComps(query),
    ])
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('429') || msg.toLowerCase().includes('too many')) {
      console.warn(`[global-scanner] rate limited on "${query}", skipping`)
      return 0
    }
    throw err
  }

  if (listings.length === 0 || comps.length < 3) return 0

  const fv = calculateFairValue(comps)
  if (!fv) return 0

  let inserted = 0
  for (const listing of listings) {
    const roi = calculateRoiPct(listing.price, fv.fairValue)
    if (roi < MIN_ROI_PCT) continue

    const { error } = await supabase.from('alerts').insert({
      watchlist_id: null,
      ebay_item_id: listing.itemId,
      card_title: listing.title,
      listed_price: listing.price,
      fair_value: Math.round(fv.fairValue * 100) / 100,
      roi_pct: Math.round(roi * 100) / 100,
      grade: null,
      player,
      set_name: null,
      listing_url: listing.listingUrl,
      image_url: listing.imageUrl,
      end_time: listing.endTime ?? null,
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

    for (const { query, player } of GLOBAL_SCAN_QUERIES) {
      const count = await step.run(`scan-${slugify(query)}`, () =>
        scanQuery(supabase, query, player)
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

// Exported for use by the on-demand scan API route — scans a subset of
// queries synchronously so the deals page can populate immediately.
export async function runQuickScan(
  supabase: ReturnType<typeof createServerClient>,
  querySlice: ReadonlyArray<{ query: string; player: string | null }> = GLOBAL_SCAN_QUERIES.slice(0, 4)
): Promise<number> {
  let total = 0
  for (const { query, player } of querySlice) {
    total += await scanQuery(supabase, query, player)
    // Small gap between queries to stay under per-second rate limits
    await new Promise((r) => setTimeout(r, 400))
  }
  return total
}
