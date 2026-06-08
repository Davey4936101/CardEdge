// lib/grade/grade-dist-cache.ts
import { searchListings } from '@/lib/ebay/rapidapi'
import { getPopData } from '@/lib/psa/api-client'
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

// Try PSA API first; fall back to eBay listing grade counts; fall back to flat prior.
export async function getGradeDistribution(
  cardKey: string,
  player: string,
  year: number,
  set: string,
  cardNumber: string
): Promise<{ distribution: GradeDistribution; popData: { count10: number; count9: number; count8: number; count7: number; total: number; gemRate: number } | null }> {
  const supabase = createServerClient()

  // Check cache
  const { data: cached } = await supabase
    .from('grade_dist_cache')
    .select('*')
    .eq('card_key', cardKey)
    .single()

  if (cached && Date.now() - new Date(cached.last_fetched).getTime() < CACHE_TTL_MS) {
    return {
      distribution: normalizeGrades(
        cached.grades as Partial<Record<GradeKey, number>>,
        cached.total
      ),
      popData: null,
    }
  }

  // Primary: PSA API
  const popData = await getPopData(player, year, set, cardNumber)
  if (popData && popData.total >= 10) {
    const distribution: GradeDistribution = {
      10: popData.count10 / popData.total,
      9:  popData.count9  / popData.total,
      8:  popData.count8  / popData.total,
      7:  popData.count7  / popData.total,
    }

    await supabase.from('grade_dist_cache').upsert({
      card_key: cardKey,
      grades: { 10: popData.count10, 9: popData.count9, 8: popData.count8, 7: popData.count7 },
      total: popData.total,
      last_fetched: new Date().toISOString(),
    })

    return { distribution, popData }
  }

  // Fallback: eBay listing grades
  try {
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

    if (total >= 5) {
      await supabase.from('grade_dist_cache').upsert({
        card_key: cardKey,
        grades,
        total,
        last_fetched: new Date().toISOString(),
      })
      return { distribution: normalizeGrades(grades, total), popData: null }
    }
  } catch {
    // fall through
  }

  return { distribution: FLAT_PRIOR, popData: null }
}

function normalizeGrades(
  grades: Partial<Record<GradeKey, number>>,
  total: number
): GradeDistribution {
  if (total === 0) return FLAT_PRIOR
  return {
    10: (grades[10] ?? 0) / total,
    9:  (grades[9]  ?? 0) / total,
    8:  (grades[8]  ?? 0) / total,
    7:  (grades[7]  ?? 0) / total,
  }
}
