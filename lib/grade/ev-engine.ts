// lib/grade/ev-engine.ts
import type { GradeDistribution, GradedComps, GradeKey, EvResult, GradingTierResult, Recommendation } from './types'

interface GradingTierConfig {
  name: 'regular' | 'express' | 'superExpress'
  displayName: string
  fee: number
  shippingCost: number
  turnaroundDays: number
}

function getTierConfigs(): GradingTierConfig[] {
  return [
    {
      name: 'regular',
      displayName: 'Regular',
      fee: Number(process.env.PSA_REGULAR_FEE ?? 25),
      shippingCost: Number(process.env.PSA_SHIPPING_COST ?? 12),
      turnaroundDays: Number(process.env.PSA_REGULAR_DAYS ?? 45),
    },
    {
      name: 'express',
      displayName: 'Express',
      fee: Number(process.env.PSA_EXPRESS_FEE ?? 150),
      shippingCost: Number(process.env.PSA_SHIPPING_COST ?? 12),
      turnaroundDays: Number(process.env.PSA_EXPRESS_DAYS ?? 5),
    },
    {
      name: 'superExpress',
      displayName: 'Super Express',
      fee: Number(process.env.PSA_SUPER_EXPRESS_FEE ?? 500),
      shippingCost: Number(process.env.PSA_SHIPPING_COST ?? 12),
      turnaroundDays: Number(process.env.PSA_SUPER_EXPRESS_DAYS ?? 2),
    },
  ]
}

function computeEvForTier(
  rawPrice: number,
  distribution: GradeDistribution,
  comps: GradedComps,
  tier: GradingTierConfig
): EvResult {
  const totalCost = rawPrice + tier.fee + tier.shippingCost

  // Only include grades with sufficient comp data
  const GRADES: GradeKey[] = [10, 9, 8, 7]
  let evGraded = 0
  let coveredProb = 0

  for (const grade of GRADES) {
    const compValue = comps[grade]
    const prob = distribution[grade]
    if (compValue !== undefined) {
      evGraded += prob * compValue
      coveredProb += prob
    }
  }

  // If we have partial comp coverage, scale up EV proportionally
  if (coveredProb > 0 && coveredProb < 1) {
    evGraded = evGraded / coveredProb
  }

  const expectedProfit = evGraded - totalCost

  // Break-even: lowest grade where comp value > total cost
  let breakEvenGrade: GradeKey | null = null
  let breakEvenProbability = 0
  for (const grade of GRADES.slice().sort((a, b) => a - b)) {
    const compValue = comps[grade]
    if (compValue !== undefined && compValue > totalCost) {
      breakEvenGrade = grade
      // P(break-even) = probability of this grade or higher
      breakEvenProbability = GRADES.filter((g) => g >= grade).reduce(
        (sum, g) => sum + distribution[g],
        0
      )
      break
    }
  }

  let recommendation: Recommendation
  if (expectedProfit <= 0 || breakEvenGrade === null || breakEvenProbability < 0.5) {
    recommendation = 'skip'
  } else if (breakEvenProbability >= 0.8) {
    recommendation = 'grade'
  } else {
    recommendation = 'uncertain'
  }

  const annualizedReturn =
    expectedProfit > 0
      ? (expectedProfit / totalCost) / (tier.turnaroundDays / 365)
      : null

  return {
    totalCost,
    evGraded: Math.round(evGraded * 100) / 100,
    expectedProfit: Math.round(expectedProfit * 100) / 100,
    breakEvenGrade,
    breakEvenProbability: Math.round(breakEvenProbability * 10000) / 10000,
    annualizedReturn: annualizedReturn !== null ? Math.round(annualizedReturn * 10000) / 10000 : null,
    recommendation,
  }
}

export function calculateAllTiers(
  rawPrice: number,
  distribution: GradeDistribution,
  comps: GradedComps
): GradingTierResult[] {
  return getTierConfigs().map((tier) => ({
    ...tier,
    ev: computeEvForTier(rawPrice, distribution, comps, tier),
  }))
}
