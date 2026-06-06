// lib/grade/grade-dist-cache.ts
import { fetchSoldComps } from '@/lib/ebay/finding'
import { createServerClient } from '@/lib/supabase/server'
import type { GradeDistribution, GradeKey } from './types'

const FLAT_PRIOR: GradeDistribution = { 10: 0.08, 9: 0.50, 8: 0.30, 7: 0.12 }
const CACHE_TTL_MS = 24 * 60 * 60 * 1000

export function parseGradeFromTitle(title: string): GradeKey | null {
  const lower = title.toLowerCase()
  if (/psa\s*10/.test(lower)) return 10
  if (/psa\s*9(?![\d.])/.test(lower)) return 9
  if (/psa\s*8(?![\d.])/.test(lower)) return 8
  if (/psa\s*[1-7](?![\d.])/.test(lower)) return 7
  return null
}

interface GradeCount {
  grades: Partial<Record<GradeKey, number>>
  total: number
}

async function fetchFromEbay(cardKey: string, player: string, year: number, set: string): Promise<GradeCount> {
  // fetchSoldComps only returns price+date; we need titles too.
  // Call the Finding API directly for this query to get titles.
  const base =
    process.env.EBAY_ENVIRONMENT === 'sandbox'
      ? 'https://svcs.sandbox.ebay.com'
      : 'https://svcs.ebay.com'

  const params = new URLSearchParams()
  params.set('OPERATION-NAME', 'findCompletedItems')
  params.set('SERVICE-VERSION', '1.0.0')
  params.set('SECURITY-APPNAME', process.env.EBAY_CLIENT_ID || '')
  params.set('RESPONSE-DATA-FORMAT', 'JSON')
  params.set('REST-PAYLOAD', 'true')
  params.set('keywords', `${player} ${year} ${set} PSA`)
  params.set('categoryId', '212')
  params.set('itemFilter(0).name', 'SoldItemsOnly')
  params.set('itemFilter(0).value', 'true')
  params.set('paginationInput.entriesPerPage', '100')
  params.set('outputSelector', 'SellerInfo')

  const res = await fetch(`${base}/services/search/FindingService/v1?${params}`)
  if (!res.ok) throw new Error(`eBay Finding API ${res.status}`)

  const data = (await res.json()) as {
    findCompletedItemsResponse?: Array<{
      searchResult?: Array<{
        item?: Array<{ title: string[] }>
      }>
    }>
  }

  const items = data.findCompletedItemsResponse?.[0]?.searchResult?.[0]?.item ?? []
  const grades: Partial<Record<GradeKey, number>> = {}
  let total = 0

  for (const item of items) {
    const title = item.title?.[0] ?? ''
    const grade = parseGradeFromTitle(title)
    if (grade !== null) {
      grades[grade] = (grades[grade] ?? 0) + 1
      total++
    }
  }

  return { grades, total }
}

export async function getGradeDistribution(
  cardKey: string,
  player: string,
  year: number,
  set: string
): Promise<GradeDistribution> {
  const supabase = createServerClient()

  const { data: cached } = await supabase
    .from('grade_dist_cache')
    .select('*')
    .eq('card_key', cardKey)
    .single()

  if (
    cached &&
    Date.now() - new Date(cached.last_fetched).getTime() < CACHE_TTL_MS
  ) {
    return normalizeGrades(cached.grades as Partial<Record<GradeKey, number>>, cached.total)
  }

  try {
    const { grades, total } = await fetchFromEbay(cardKey, player, year, set)

    if (total < 5) return FLAT_PRIOR

    await supabase.from('grade_dist_cache').upsert({
      card_key: cardKey,
      grades,
      total,
      last_fetched: new Date().toISOString(),
    })

    return normalizeGrades(grades, total)
  } catch {
    return FLAT_PRIOR
  }
}

function normalizeGrades(
  grades: Partial<Record<GradeKey, number>>,
  total: number
): GradeDistribution {
  if (total === 0) return FLAT_PRIOR
  return {
    10: (grades[10] ?? 0) / total,
    9: (grades[9] ?? 0) / total,
    8: (grades[8] ?? 0) / total,
    7: (grades[7] ?? 0) / total,
  }
}
