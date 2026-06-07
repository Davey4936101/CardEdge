import { inngest } from './client'
import { createServerClient } from '@/lib/supabase/server'
import { fetchAuctionItem } from '@/lib/ebay/rapidapi'

// Refreshes active bid watches that haven't been updated in the last 30 minutes.
// Prioritises watches ending within 24 hours so bid prices stay fresh when it matters.
export const bidWatchScanner = inngest.createFunction(
  { id: 'bid-watch-scanner', triggers: [{ cron: '*/30 * * * *' }] },
  async ({ step }) => {
    const supabase = createServerClient()

    const staleThreshold = new Date(Date.now() - 30 * 60 * 1000).toISOString()

    const rows = await step.run('fetch-active-watches', async () => {
      const { data } = await supabase
        .from('bid_watches')
        .select('id, ebay_item_id, current_bid, fair_value')
        .eq('is_ended', false)
        .or(`last_refreshed.is.null,last_refreshed.lt.${staleThreshold}`)
        .order('end_time', { ascending: true, nullsFirst: false })
        .limit(50)
      return data ?? []
    })
    let refreshed = 0

    for (const watch of rows) {
      const item = await step.run(`refresh-${watch.id}`, () =>
        fetchAuctionItem(watch.ebay_item_id)
      )
      if (!item) continue

      await supabase
        .from('bid_watches')
        .update({
          current_bid: item.currentBid,
          bin_price: item.binPrice,
          end_time: item.endTime,
          is_ended: item.isEnded,
          last_refreshed: new Date().toISOString(),
        })
        .eq('id', watch.id)

      refreshed++
    }

    return { watchesChecked: rows.length, refreshed }
  }
)
