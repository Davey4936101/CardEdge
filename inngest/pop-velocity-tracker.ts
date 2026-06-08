import { inngest } from './client'
import { createServerClient } from '@/lib/supabase/server'
import { getPopData } from '@/lib/psa/api-client'

interface CacheEntry {
  card_key: string
  player: string
  year_val: number
  set_name: string
  card_number: string
}

export const popVelocityTracker = inngest.createFunction(
  { id: 'pop-velocity-tracker', triggers: [{ cron: '0 2 * * *' }] },
  async ({ step }) => {
    const supabase = createServerClient()

    const cards = await step.run('fetch-tracked-cards', async () => {
      const { data, error } = await supabase
        .from('grade_dist_cache')
        .select('card_key, player, year_val, set_name, card_number')
        .not('player', 'is', null)
        .not('year_val', 'is', null)
      if (error) throw new Error(error.message)
      return (data ?? []) as CacheEntry[]
    })

    const today = new Date().toISOString().slice(0, 10)
    let snapshotted = 0

    for (const card of cards) {
      await step.run(`snapshot-${card.card_key}`, async () => {
        const pop = await getPopData(card.player, card.year_val, card.set_name, card.card_number)
        if (!pop) return

        await supabase.from('pop_snapshots').upsert(
          {
            card_key: card.card_key,
            snapshot_date: today,
            count_10: pop.count10,
            count_9: pop.count9,
            count_8: pop.count8,
            count_7: pop.count7,
            total: pop.total,
          },
          { onConflict: 'card_key,snapshot_date' }
        )
        snapshotted++
      })
    }

    return { snapshotted, date: today }
  }
)
