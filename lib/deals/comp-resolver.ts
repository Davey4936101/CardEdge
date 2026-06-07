import type { SupabaseClient } from '@supabase/supabase-js'
import { identifyCardFromTitle, confidenceScore } from '@/lib/grade/card-identify'
import type { CardIdentity } from '@/lib/grade/types'
import { fetchSoldComps } from '@/lib/ebay/rapidapi'
import type { SoldComp } from '@/lib/ebay/rapidapi'
import { calculateFairValue } from '@/lib/fair-value'
import type { FairValueResult } from '@/lib/fair-value'

const CONFIDENCE_THRESHOLD = 0.6

export interface ResolvedComps {
  cardKey: string
  query: string
  comps: SoldComp[]
  fairValue: FairValueResult | null
  identity: CardIdentity | null
  identityConfidence: number
  lowConfidence: boolean
}

function buildCompQuery(identity: CardIdentity): string {
  const parts: string[] = [String(identity.year)]
  if (identity.player !== 'Unknown') parts.push(identity.player)
  if (identity.set !== 'Unknown') parts.push(identity.set)
  if (identity.cardNumber) parts.push(`#${identity.cardNumber}`)
  if (identity.grade) parts.push(`${identity.grade.grader} ${identity.grade.score}`)
  return parts.join(' ')
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)
}

export async function resolveCompsForListing(
  listing: { title: string },
  supabase: SupabaseClient,
  fallbackQuery: string,
): Promise<ResolvedComps | null> {
  const identity = await identifyCardFromTitle(listing.title)
  const confidence = confidenceScore(identity)
  const lowConfidence = confidence < CONFIDENCE_THRESHOLD

  const query = !lowConfidence && identity ? buildCompQuery(identity) : fallbackQuery
  const cardKey = !lowConfidence && identity
    ? identity.cardKey
    : `fallback-${slugify(fallbackQuery)}`

  // Return cached comps if we fetched this card within the last 4 hours
  const { data: cachedRows } = await supabase
    .from('price_cache')
    .select('sale_price, sale_date')
    .eq('card_key', cardKey)
    .gt('created_at', new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString())

  let comps: SoldComp[]
  if (cachedRows && cachedRows.length >= 3) {
    comps = (cachedRows as { sale_price: number; sale_date: string }[]).map((row) => ({
      price: Number(row.sale_price),
      saleDate: new Date(row.sale_date),
    }))
  } else {
    comps = await fetchSoldComps(query)

    if (comps.length > 0) {
      const rows = comps.map((c) => ({
        card_key: cardKey,
        sale_price: c.price,
        sale_date: c.saleDate.toISOString(),
        source: 'ebay',
      }))
      const { error } = await supabase.from('price_cache').insert(rows)
      if (error) console.warn('[comp-resolver] price_cache insert failed:', error.message)
    }
  }

  return {
    cardKey,
    query,
    comps,
    fairValue: calculateFairValue(comps),
    identity,
    identityConfidence: confidence,
    lowConfidence,
  }
}
