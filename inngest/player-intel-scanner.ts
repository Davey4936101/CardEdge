import { inngest } from './client'
import { createServerClient } from '@/lib/supabase/server'
import { fetchSportNews, findPlayerInArticle, type Sport } from '@/lib/intel/espn'
import { classifyArticle } from '@/lib/intel/event-classifier'

const SPORTS: Sport[] = ['nfl', 'nba', 'mlb']

interface PortfolioPlayer {
  user_id: string
  id: string
  player: string
}

export const playerIntelScanner = inngest.createFunction(
  { id: 'player-intel-scanner', triggers: [{ cron: '0 */6 * * *' }] },
  async ({ step }) => {
    const supabase = createServerClient()

    const players = await step.run('fetch-portfolio-players', async () => {
      const { data, error } = await supabase
        .from('portfolio_cards')
        .select('user_id, id, player')
        .in('status', ['raw_owned', 'submitted', 'graded_owned'])
        .not('user_id', 'is', null)
      if (error) throw new Error(error.message)
      return (data ?? []).map((row) => ({
        user_id: row.user_id as string,
        id: row.id as string,
        player: row.player as string,
      })) as PortfolioPlayer[]
    })

    if (players.length === 0) return { eventsCreated: 0, alertsCreated: 0 }

    // Unique player names for article scanning
    const uniquePlayers = [...new Set(players.map((p) => p.player))]

    // Fetch all sports news once per sport
    const allArticles = await step.run('fetch-espn-news', async () => {
      const results: Array<{ sport: Sport; headline: string; description: string; publishedAt: string; url: string }> = []
      for (const sport of SPORTS) {
        try {
          const articles = await fetchSportNews(sport)
          results.push(...articles.map((a) => ({ sport, ...a })))
        } catch (err) {
          console.error(`ESPN ${sport} fetch failed:`, err)
        }
      }
      return results
    })

    let eventsCreated = 0
    let alertsCreated = 0

    // Match articles to players and classify
    for (const playerName of uniquePlayers) {
      const matchingArticles = allArticles.filter((a) =>
        findPlayerInArticle(playerName, a)
      )

      for (const article of matchingArticles.slice(0, 3)) {
        const eventId = await step.run(
          `classify-${playerName.replace(/\s+/g, '-')}-${article.url.slice(-20)}`,
          async () => {
            let classification
            try {
              classification = await classifyArticle(article, playerName)
            } catch {
              return null
            }

            const { data: existing } = await supabase
              .from('player_events')
              .select('id')
              .eq('player_name', playerName)
              .eq('title', article.headline.slice(0, 255))
              .maybeSingle()

            if (existing) return existing.id as string

            const { data: event, error } = await supabase
              .from('player_events')
              .insert({
                player_name: playerName,
                sport: article.sport,
                event_type: classification.event_type,
                title: article.headline.slice(0, 255),
                summary: classification.summary,
                sentiment: classification.sentiment,
                severity: classification.severity,
                source_url: article.url,
                event_date: article.publishedAt,
              })
              .select('id')
              .single()

            if (error && error.code !== '23505') throw new Error(error.message)
            if (error) return null

            eventsCreated++
            return (event?.id ?? null) as string | null
          }
        )

        if (!eventId) continue

        // Link event to all portfolio cards for this player
        const affectedCards = players.filter((p) => p.player === playerName)
        for (const card of affectedCards) {
          await supabase
            .from('player_alerts')
            .upsert({
              user_id: card.user_id,
              portfolio_card_id: card.id,
              player_event_id: eventId,
            })
            .then(({ error }) => {
              if (!error) alertsCreated++
            })
        }
      }
    }

    return { eventsCreated, alertsCreated, playersScanned: uniquePlayers.length }
  }
)
