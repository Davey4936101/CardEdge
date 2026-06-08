// lib/grade/deal-grade-potential.ts
import { fetchGradedComps } from './graded-comps'
import type { QuickGradeResult } from './quick-grade'

const PSA_REGULAR_TOTAL_COST = (
  Number(process.env.PSA_REGULAR_FEE ?? 25) +
  Number(process.env.PSA_SHIPPING_COST ?? 12)
)

export interface GradePotential {
  gradePotentialScore: number   // P(PSA 10), 0–1
  evIfGraded: number | null     // null when no comps available
  gradeUpside: number | null    // null when no comps available
}

export async function computeGradePotential(
  quickGrade: QuickGradeResult,
  player: string,
  year: number,
  set: string,
  cardNumber: string,
  listedPrice: number
): Promise<GradePotential> {
  const comps = await fetchGradedComps(player, year, set, cardNumber)

  const grades = [10, 9, 8, 7] as const
  let evIfGraded = 0
  let coveredProb = 0

  for (const grade of grades) {
    const comp = comps[grade]
    if (comp !== undefined) {
      evIfGraded += quickGrade.distribution[grade] * comp
      coveredProb += quickGrade.distribution[grade]
    }
  }

  if (coveredProb === 0) {
    return { gradePotentialScore: quickGrade.psa10Probability, evIfGraded: null, gradeUpside: null }
  }

  // Scale EV to full probability mass
  evIfGraded = evIfGraded / coveredProb

  return {
    gradePotentialScore: quickGrade.psa10Probability,
    evIfGraded: Math.round(evIfGraded * 100) / 100,
    gradeUpside: Math.round((evIfGraded - listedPrice - PSA_REGULAR_TOTAL_COST) * 100) / 100,
  }
}
