// lib/grade/batch-optimizer.ts
import type { GradeDistribution, GradedComps } from './types'

const PSA_REGULAR_FEE    = Number(process.env.PSA_REGULAR_FEE    ?? 25)
const PSA_SHIPPING_COST  = Number(process.env.PSA_SHIPPING_COST   ?? 12)
const PSA_REGULAR_FEE_TOTAL = PSA_REGULAR_FEE + PSA_SHIPPING_COST

const DEFAULT_BATCH_SIZE = 25

export interface BatchCard {
  id: string
  cardKey: string
  rawPrice: number
  distribution: GradeDistribution
  comps: GradedComps
  continuousScore?: number
}

export interface RankedCard extends BatchCard {
  evGraded: number
  expectedProfit: number
  roi: number
  aboveBreakEven: boolean
}

export interface BatchResult {
  ranked: RankedCard[]
  recommended: RankedCard[]
  totalExpectedReturn: number
  totalCost: number
  batchRoi: number
}

function computeEv(distribution: GradeDistribution, comps: GradedComps): number {
  const grades = [10, 9, 8, 7] as const
  let ev = 0
  let covered = 0
  for (const g of grades) {
    const comp = comps[g]
    if (comp !== undefined) {
      ev += distribution[g] * comp
      covered += distribution[g]
    }
  }
  return covered > 0 ? ev / covered : 0
}

export function rankCards(cards: BatchCard[]): RankedCard[] {
  return cards
    .map((c) => {
      const evGraded = computeEv(c.distribution, c.comps)
      const expectedProfit = evGraded - c.rawPrice - PSA_REGULAR_FEE_TOTAL
      const roi =
        c.rawPrice + PSA_REGULAR_FEE_TOTAL > 0
          ? expectedProfit / (c.rawPrice + PSA_REGULAR_FEE_TOTAL)
          : 0
      return {
        ...c,
        evGraded:       Math.round(evGraded        * 100) / 100,
        expectedProfit: Math.round(expectedProfit  * 100) / 100,
        roi:            Math.round(roi             * 10000) / 10000,
        aboveBreakEven: expectedProfit > 0,
      }
    })
    .sort((a, b) => b.expectedProfit - a.expectedProfit)
}

export function buildBatch(cards: BatchCard[], batchSize = DEFAULT_BATCH_SIZE): BatchResult {
  const ranked = rankCards(cards)
  const recommended = ranked.filter((c) => c.aboveBreakEven).slice(0, batchSize)

  const totalExpectedReturn = recommended.reduce((s, c) => s + c.evGraded, 0)
  const totalCost = recommended.reduce((s, c) => s + c.rawPrice + PSA_REGULAR_FEE_TOTAL, 0)
  const batchRoi = totalCost > 0 ? (totalExpectedReturn - totalCost) / totalCost : 0

  return {
    ranked,
    recommended,
    totalExpectedReturn: Math.round(totalExpectedReturn * 100) / 100,
    totalCost:           Math.round(totalCost           * 100) / 100,
    batchRoi:            Math.round(batchRoi            * 10000) / 10000,
  }
}
