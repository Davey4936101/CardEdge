import { inngest } from './client'
import { createServerClient } from '@/lib/supabase/server'
import { calculateFairValue } from '@/lib/fair-value'

export const portfolioValueRefresh = inngest.createFunction(
  { id: 'portfolio-value-refresh', triggers: [{ cron: '0 8 * * *' }] },
  async ({ step }) => {
    const supabase = createServerClient()

    const cards = await step.run('fetch-stale-cards', async () => {
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
      const { data, error } = await supabase
        .from('portfolio_cards')
        .select('id, card_key')
        .in('status', ['raw_owned', 'graded_owned'])
        .is('current_value_override', null)
        .or(`current_value_fetched_at.is.null,current_value_fetched_at.lt.${oneDayAgo}`)
      if (error) throw new Error(error.message)
      return data ?? []
    })

    let refreshed = 0
    for (const card of cards) {
      await step.run(`refresh-${card.id as string}`, async () => {
        const ninetyDaysAgo = new Date()
        ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)
        const { data: comps } = await supabase
          .from('price_cache')
          .select('sale_price, sale_date')
          .eq('card_key', card.card_key as string)
          .gte('sale_date', ninetyDaysAgo.toISOString())
          .order('sale_date', { ascending: false })

        if (!comps || comps.length < 3) return
        const result = calculateFairValue(
          comps.map((c) => ({ price: c.sale_price as number, saleDate: new Date(c.sale_date as string) }))
        )
        if (!result) return
        await supabase
          .from('portfolio_cards')
          .update({
            current_value_fetched: Math.round(result.fairValue * 100) / 100,
            current_value_fetched_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', card.id as string)
        refreshed++
      })
    }
    return { cardsChecked: cards.length, refreshed }
  }
)
