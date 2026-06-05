import { inngest } from './client'
import { createServerClient } from '@/lib/supabase/server'
import { searchListings } from '@/lib/ebay/browse'
import { fetchSoldComps } from '@/lib/ebay/finding'
import { calculateFairValue, calculateRoiPct } from '@/lib/fair-value'

function buildCardKey(player: string, set: string, grade: string): string {
  return [player, set, grade]
    .map((s) =>
      s
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '')
    )
    .join('-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

interface WatchlistFilters {
  player: string
  set: string
  grade: string
  min_roi_pct: number
  max_price: number | null
}

interface Watchlist {
  id: string
  filters: WatchlistFilters
}

export const dealScanner = inngest.createFunction(
  { id: 'deal-scanner' },
  { cron: '*/5 * * * *' },
  async ({ step }) => {
    const supabase = createServerClient()

    const watchlists = await step.run('fetch-watchlists', async () => {
      const { data, error } = await supabase
        .from('watchlists')
        .select('id, filters')
        .eq('is_active', true)
      if (error) throw new Error(error.message)
      return (data ?? []) as Watchlist[]
    })

    // Fetch notification prefs once per scan run
    const { data: prefs } = await supabase
      .from('notification_preferences')
      .select('email_enabled, email_address, push_enabled')
      .limit(1)
      .maybeSingle()

    let totalAlerts = 0

    for (const watchlist of watchlists) {
      const f = watchlist.filters
      const searchQuery = [f.player, f.set, f.grade !== 'Any' ? f.grade : '']
        .filter(Boolean)
        .join(' ')
      const cardKey = buildCardKey(f.player, f.set, f.grade)

      const listings = await step.run(`browse-${watchlist.id}`, async () => {
        return searchListings(searchQuery, f.max_price ?? undefined)
      })

      if (listings.length === 0) continue

      // Refresh comps if stale (no entry in last hour)
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
      const { data: recentCache } = await supabase
        .from('price_cache')
        .select('created_at')
        .eq('card_key', cardKey)
        .gt('created_at', oneHourAgo)
        .limit(1)
        .maybeSingle()

      if (!recentCache) {
        await step.run(`refresh-comps-${cardKey}`, async () => {
          const comps = await fetchSoldComps(searchQuery)
          if (comps.length > 0) {
            await supabase.from('price_cache').insert(
              comps.map((c) => ({
                card_key: cardKey,
                sale_price: c.price,
                sale_date: c.saleDate.toISOString(),
              }))
            )
          }
        })
      }

      // Load 90-day comps for fair value
      const ninetyDaysAgo = new Date()
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)

      const { data: cacheRows } = await supabase
        .from('price_cache')
        .select('sale_price, sale_date')
        .eq('card_key', cardKey)
        .gte('sale_date', ninetyDaysAgo.toISOString())
        .order('sale_date', { ascending: false })

      if (!cacheRows || cacheRows.length < 3) continue

      const fairValueResult = calculateFairValue(
        cacheRows.map((r) => ({
          price: r.sale_price as number,
          saleDate: new Date(r.sale_date as string),
        }))
      )
      if (!fairValueResult) continue

      for (const listing of listings) {
        const roiPct = calculateRoiPct(listing.price, fairValueResult.fairValue)
        if (roiPct < f.min_roi_pct) continue

        const { error } = await supabase.from('alerts').insert({
          watchlist_id: watchlist.id,
          ebay_item_id: listing.itemId,
          card_title: listing.title,
          listed_price: listing.price,
          fair_value: Math.round(fairValueResult.fairValue * 100) / 100,
          roi_pct: Math.round(roiPct * 100) / 100,
          grade: f.grade,
          player: f.player,
          set_name: f.set,
          listing_url: listing.listingUrl,
          image_url: listing.imageUrl,
          end_time: listing.endTime,
        })

        // Skip duplicate eBay items (unique constraint on ebay_item_id)
        if (error && error.code === '23505') continue
        if (error) throw new Error(error.message)

        totalAlerts++

        // Notifications wired in Task 22 — prefs fetched above but not used yet
        void prefs
      }
    }

    return { watchlistsScanned: watchlists.length, alertsGenerated: totalAlerts }
  }
)
