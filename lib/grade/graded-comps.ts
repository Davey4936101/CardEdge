// lib/grade/graded-comps.ts
import { fetchSoldComps } from '@/lib/ebay/rapidapi'
import { calculateFairValue } from '@/lib/fair-value'
import type { GradeKey, GradedComps } from './types'

const GRADES: GradeKey[] = [10, 9, 8, 7]

export async function fetchGradedComps(
  player: string,
  year: number,
  set: string,
  cardNumber: string
): Promise<GradedComps> {
  const results: GradedComps = {}

  await Promise.all(
    GRADES.map(async (grade) => {
      const keywords = `${player} ${year} ${set} #${cardNumber} PSA ${grade}`
      try {
        const comps = await fetchSoldComps(keywords)
        if (comps.length < 3) return
        const fv = calculateFairValue(comps)
        if (fv) results[grade] = Math.round(fv.fairValue * 100) / 100
      } catch {
        // skip this grade tier if fetch fails
      }
    })
  )

  return results
}
