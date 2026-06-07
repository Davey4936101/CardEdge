import { fetchSoldComps } from '@/lib/ebay/rapidapi'
import { calculateFairValue } from '@/lib/fair-value'
import { createServerClient } from '@/lib/supabase/server'

export interface GradeLadderTier {
  price: number | null
  compCount: number
  premium: number | null // multiple vs raw, e.g. 3.2
}

export interface GradeLadder {
  cardKey: string
  raw: GradeLadderTier
  psa7: GradeLadderTier
  psa8: GradeLadderTier
  psa9: GradeLadderTier
  psa10: GradeLadderTier
  fetchedAt: string
}

interface TierResult {
  price: number | null
  count: number
}

async function fetchTierPrice(keywords: string): Promise<TierResult> {
  try {
    const comps = await fetchSoldComps(keywords)
    if (comps.length < 3) return { price: null, count: comps.length }
    const fv = calculateFairValue(comps)
    return { price: fv ? Math.round(fv.fairValue * 100) / 100 : null, count: comps.length }
  } catch {
    return { price: null, count: 0 }
  }
}

export async function fetchGradeLadder(
  player: string,
  year: string | null,
  setName: string,
  cardKey: string
): Promise<GradeLadder> {
  const base = [player, year, setName].filter(Boolean).join(' ')

  const [rawResult, p7, p8, p9, p10] = await Promise.all([
    fetchTierPrice(`${base} raw`),
    fetchTierPrice(`${base} PSA 7`),
    fetchTierPrice(`${base} PSA 8`),
    fetchTierPrice(`${base} PSA 9`),
    fetchTierPrice(`${base} PSA 10`),
  ])

  const rawPrice = rawResult.price

  function premium(price: number | null): number | null {
    if (!price || !rawPrice) return null
    return Math.round((price / rawPrice) * 10) / 10
  }

  const ladder: GradeLadder = {
    cardKey,
    raw: { price: rawPrice, compCount: rawResult.count, premium: null },
    psa7: { price: p7.price, compCount: p7.count, premium: premium(p7.price) },
    psa8: { price: p8.price, compCount: p8.count, premium: premium(p8.price) },
    psa9: { price: p9.price, compCount: p9.count, premium: premium(p9.price) },
    psa10: { price: p10.price, compCount: p10.count, premium: premium(p10.price) },
    fetchedAt: new Date().toISOString(),
  }

  // Upsert to cache
  const supabase = createServerClient()
  await supabase.from('grade_price_cache').upsert({
    card_key: cardKey,
    raw_price: rawPrice,
    psa7_price: p7.price,
    psa8_price: p8.price,
    psa9_price: p9.price,
    psa10_price: p10.price,
    raw_comp_count: rawResult.count,
    psa7_comp_count: p7.count,
    psa8_comp_count: p8.count,
    psa9_comp_count: p9.count,
    psa10_comp_count: p10.count,
    fetched_at: ladder.fetchedAt,
  })

  return ladder
}

export async function getGradeLadder(
  player: string,
  year: string | null,
  setName: string,
  cardKey: string
): Promise<GradeLadder> {
  const supabase = createServerClient()
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  const { data } = await supabase
    .from('grade_price_cache')
    .select('*')
    .eq('card_key', cardKey)
    .gt('fetched_at', oneDayAgo)
    .maybeSingle()

  if (data) {
    const d = data as Record<string, unknown>
    return {
      cardKey,
      raw: { price: d.raw_price as number | null, compCount: (d.raw_comp_count as number) ?? 0, premium: null },
      psa7: { price: d.psa7_price as number | null, compCount: (d.psa7_comp_count as number) ?? 0, premium: calcPremium(d.psa7_price as number | null, d.raw_price as number | null) },
      psa8: { price: d.psa8_price as number | null, compCount: (d.psa8_comp_count as number) ?? 0, premium: calcPremium(d.psa8_price as number | null, d.raw_price as number | null) },
      psa9: { price: d.psa9_price as number | null, compCount: (d.psa9_comp_count as number) ?? 0, premium: calcPremium(d.psa9_price as number | null, d.raw_price as number | null) },
      psa10: { price: d.psa10_price as number | null, compCount: (d.psa10_comp_count as number) ?? 0, premium: calcPremium(d.psa10_price as number | null, d.raw_price as number | null) },
      fetchedAt: d.fetched_at as string,
    }
  }

  return fetchGradeLadder(player, year, setName, cardKey)
}

function calcPremium(price: number | null, raw: number | null): number | null {
  if (!price || !raw) return null
  return Math.round((price / raw) * 10) / 10
}
