// lib/grade/grade-dist-cache.ts
import { searchListings } from '@/lib/ebay/rapidapi'
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

async function fetchFromEbay(_cardKey: string, player: string, year: number, set: string): Promise<GradeCount> {
  const listings = await searchListings(`${player} ${year} ${set} PSA`)
  const grades: Partial<Record<GradeKey, number>> = {}
  let total = 0

  for (const listing of listings) {
    const grade = parseGradeFromTitle(listing.title)
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
