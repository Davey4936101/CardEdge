import { inngest } from './client'
import { createServerClient } from '@/lib/supabase/server'
import { searchListings, fetchSoldComps } from '@/lib/ebay/rapidapi'
import { calculateFairValue, calculateRoiPct } from '@/lib/fair-value'
import { sendAlertEmail } from '@/lib/resend'
import { sendPushToAll } from '@/lib/push'

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
  name: string
  user_id: string | null
  filters: WatchlistFilters
}

interface NotifPrefs {
  email_enabled: boolean
  email_address: string | null
  push_enabled: boolean
}

interface PushSub {
  endpoint: string
  p256dh: string
  auth: string
}

export const dealScanner = inngest.createFunction(
  { id: 'deal-scanner', triggers: [{ cron: '*/5 * * * *' }] },
  async ({ step }) => {
    const supabase = createServerClient()

    const watchlists = await step.run('fetch-watchlists', async () => {
      const { data, error } = await supabase
        .from('watchlists')
        .select('id, name, user_id, filters')
        .eq('is_active', true)
      if (error) throw new Error(error.message)
      return (data ?? []) as Watchlist[]
    })

    let totalAlerts = 0

    for (const watchlist of watchlists) {
      const f = watchlist.filters

      // Load notification prefs scoped to this watchlist's owner
      let prefs: NotifPrefs | null = null
      let pushSubs: PushSub[] = []
      if (watchlist.user_id) {
        const { data: p } = await supabase
          .from('notification_preferences')
          .select('email_enabled, email_address, push_enabled')
          .eq('user_id', watchlist.user_id)
          .maybeSingle()
        prefs = p as NotifPrefs | null
        if (prefs?.push_enabled) {
          const { data: subs } = await supabase
            .from('push_subscriptions')
            .select('endpoint, p256dh, auth')
            .eq('user_id', watchlist.user_id)
          pushSubs = (subs ?? []) as PushSub[]
        }
      }
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
          buying_format: listing.buyingFormat,
        })

        // Skip duplicate eBay items (unique constraint on ebay_item_id)
        if (error && error.code === '23505') continue
        if (error) throw new Error(error.message)

        totalAlerts++

        // Fire notifications (non-blocking — don't fail the scan on notification errors)
        const notifPayload = {
          cardTitle: listing.title,
          listedPrice: listing.price,
          fairValue: Math.round(fairValueResult.fairValue * 100) / 100,
          roiPct: Math.round(roiPct * 100) / 100,
          listingUrl: listing.listingUrl,
          watchlistName: watchlist.name,
        }

        if (prefs?.email_enabled && prefs.email_address) {
          void sendAlertEmail({
            to: prefs.email_address,
            ...notifPayload,
            cardTitle: notifPayload.cardTitle,
          }).catch((err: unknown) => console.error('Email notification failed:', err))
        }

        if (prefs?.push_enabled && pushSubs && pushSubs.length > 0) {
          void sendPushToAll(pushSubs, {
            title: `Deal Alert: ${listing.title}`,
            body: `+${notifPayload.roiPct.toFixed(1)}% below market — $${listing.price.toFixed(2)} listed`,
            url: listing.listingUrl,
          }).catch((err: unknown) => console.error('Push notification failed:', err))
        }
      }

      await supabase
        .from('watchlists')
        .update({ last_scanned_at: new Date().toISOString() })
        .eq('id', watchlist.id)
    }

    return { watchlistsScanned: watchlists.length, alertsGenerated: totalAlerts }
  }
)
