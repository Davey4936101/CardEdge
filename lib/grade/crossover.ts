// lib/grade/crossover.ts
import type { GradeDistribution } from './types'

const PSA_REGULAR_TOTAL_COST = (
  Number(process.env.PSA_REGULAR_FEE ?? 25) +
  Number(process.env.PSA_SHIPPING_COST ?? 12)
)
const CROSSOVER_FEE = 150   // PSA Express — standard for crossover requests
const CRACK_RISK_PCT = 0.10 // 10% of raw value as cracking-damage risk discount

/**
 * Crossover probability to PSA 10, encoded from collector community data:
 * - quad 9.5 (all subs ≥ 9.5): ~50% probability
 * - one 9.0 sub with rest ≥ 9.5: ~12%
 * - any sub < 9.0: near-zero (~2%)
 */
export function computeCrossoverProbability(
  centeringSub: number,
  cornersSub: number,
  edgesSub: number,
  surfaceSub: number
): number {
  const subs = [centeringSub, cornersSub, edgesSub, surfaceSub]
  const minSub = Math.min(...subs)

  if (minSub < 9.0) return 0.02

  // Count subs exactly at 9.0 vs ≥ 9.5
  const ninePointZeros = subs.filter((s) => s >= 9.0 && s < 9.5).length

  if (ninePointZeros === 0) {
    // Quad 9.5 or better
    return 0.50
  }
  if (ninePointZeros === 1) {
    return 0.12
  }
  if (ninePointZeros === 2) {
    return 0.05
  }
  // 3 or 4 nines
  return 0.02
}

function subgradesToDistribution(
  centeringSub: number,
  cornersSub: number,
  edgesSub: number,
  surfaceSub: number
): GradeDistribution {
  const minSub = Math.min(centeringSub, cornersSub, edgesSub, surfaceSub)
  const crossoverProb = computeCrossoverProbability(centeringSub, cornersSub, edgesSub, surfaceSub)

  if (minSub >= 9.5) {
    return { 10: crossoverProb, 9: 0.55, 8: 0.30 - crossoverProb * 0.5, 7: 0.15 }
  }
  if (minSub >= 9.0) {
    return { 10: crossoverProb, 9: 0.45, 8: 0.35, 7: 0.20 - crossoverProb * 0.5 }
  }
  return { 10: 0.02, 9: 0.30, 8: 0.40, 7: 0.28 }
}

export interface CrossoverEvInput {
  centeringSub: number
  cornersSub: number
  edgesSub: number
  surfaceSub: number
  crossoverProbability: number
  bgsSaleValue: number
  psa10SaleValue: number
  psa9SaleValue: number
  rawValue: number
}

export interface CrossoverEvResult {
  evKeepBgs: number
  evCrossover: number
  evCrackRaw: number
  recommendation: 'keep' | 'crossover' | 'crack'
}

export function computeCrossoverEv(input: CrossoverEvInput): CrossoverEvResult {
  const {
    centeringSub, cornersSub, edgesSub, surfaceSub,
    crossoverProbability, bgsSaleValue, psa10SaleValue, psa9SaleValue, rawValue,
  } = input

  const evKeepBgs = bgsSaleValue

  const evCrossover =
    crossoverProbability * psa10SaleValue +
    (1 - crossoverProbability) * psa9SaleValue -
    CROSSOVER_FEE

  const dist = subgradesToDistribution(centeringSub, cornersSub, edgesSub, surfaceSub)
  const crackRawGradeEv =
    dist[10] * psa10SaleValue +
    dist[9] * psa9SaleValue +
    dist[8] * (psa9SaleValue * 0.55) +
    dist[7] * (psa9SaleValue * 0.35)
  const evCrackRaw = crackRawGradeEv - PSA_REGULAR_TOTAL_COST - rawValue * CRACK_RISK_PCT

  const best = Math.max(evKeepBgs, evCrossover, evCrackRaw)
  const recommendation: CrossoverEvResult['recommendation'] =
    best === evCrossover ? 'crossover' :
    best === evCrackRaw  ? 'crack'     : 'keep'

  return {
    evKeepBgs:   Math.round(evKeepBgs   * 100) / 100,
    evCrossover: Math.round(evCrossover * 100) / 100,
    evCrackRaw:  Math.round(evCrackRaw  * 100) / 100,
    recommendation,
  }
}
