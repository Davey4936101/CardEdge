// lib/grade/accuracy.ts

export interface AccuracySubgrades {
  centering?: number
  corners?: number
  edges?: number
  surface?: number
}

export interface AccuracyEntry {
  analysisId: string
  cardKey: string
  predictedScore: number
  actualGrade: number
  discrepancy: number
  isWithinHalfGrade: boolean
  isWithinOneGrade: boolean
  subgrades: AccuracySubgrades
  dominantBlindSpot: 'centering' | 'corners' | 'edges' | 'surface' | null
  summary: string
}

export interface AccuracyStats {
  totalPredictions: number
  withinHalfGrade: number
  withinOneGrade: number
  withinHalfGradePct: number
  withinOneGradePct: number
  meanDiscrepancy: number
  blindSpots: Record<'centering' | 'corners' | 'edges' | 'surface', number>
}

const ATTRS = ['centering', 'corners', 'edges', 'surface'] as const

function findDominantBlindSpot(
  predictedScore: number,
  actualGrade: number,
  subgrades: AccuracySubgrades
): AccuracyEntry['dominantBlindSpot'] {
  if (predictedScore <= actualGrade) return null
  let lowest: typeof ATTRS[number] | null = null
  let lowestVal = Infinity
  for (const attr of ATTRS) {
    const v = subgrades[attr]
    if (v !== undefined && v < lowestVal) {
      lowestVal = v
      lowest = attr
    }
  }
  return lowest
}

export function analyzeAccuracyEntry(
  analysisId: string,
  cardKey: string,
  predictedScore: number,
  actualGrade: number,
  subgrades: AccuracySubgrades
): AccuracyEntry {
  const discrepancy = actualGrade - predictedScore
  const absDiff = Math.abs(discrepancy)
  const dominantBlindSpot = findDominantBlindSpot(predictedScore, actualGrade, subgrades)
  const direction = discrepancy >= 0 ? 'above' : 'below'

  const summary =
    absDiff <= 0.5
      ? `Predicted ${predictedScore.toFixed(1)}, received PSA ${actualGrade}. Excellent accuracy.`
      : dominantBlindSpot
      ? `Predicted ${predictedScore.toFixed(1)}, received PSA ${actualGrade}. ${(Math.round(absDiff * 10) / 10).toFixed(1)} grade ${direction} prediction. ${dominantBlindSpot.charAt(0).toUpperCase() + dominantBlindSpot.slice(1)} sub-grade was lowest (${subgrades[dominantBlindSpot]?.toFixed(1)}) — consider more careful ${dominantBlindSpot} evaluation next time.`
      : `Predicted ${predictedScore.toFixed(1)}, received PSA ${actualGrade}. ${(Math.round(absDiff * 10) / 10).toFixed(1)} grade ${direction} prediction.`

  return {
    analysisId,
    cardKey,
    predictedScore: Math.round(predictedScore * 10) / 10,
    actualGrade,
    discrepancy: Math.round(discrepancy * 10) / 10,
    isWithinHalfGrade: absDiff <= 0.5,
    isWithinOneGrade:  absDiff <= 1.0,
    subgrades,
    dominantBlindSpot,
    summary,
  }
}

export function computeAccuracyStats(entries: AccuracyEntry[]): AccuracyStats {
  const blindSpots: AccuracyStats['blindSpots'] = { centering: 0, corners: 0, edges: 0, surface: 0 }
  if (entries.length === 0) {
    return { totalPredictions: 0, withinHalfGrade: 0, withinOneGrade: 0, withinHalfGradePct: 0, withinOneGradePct: 0, meanDiscrepancy: 0, blindSpots }
  }

  const withinHalf = entries.filter((e) => e.isWithinHalfGrade).length
  const withinOne  = entries.filter((e) => e.isWithinOneGrade).length
  const meanDisc   = entries.reduce((s, e) => s + e.discrepancy, 0) / entries.length

  for (const e of entries) {
    if (e.dominantBlindSpot) blindSpots[e.dominantBlindSpot]++
  }

  return {
    totalPredictions:  entries.length,
    withinHalfGrade:   withinHalf,
    withinOneGrade:    withinOne,
    withinHalfGradePct: Math.round(withinHalf / entries.length * 1000) / 1000,
    withinOneGradePct:  Math.round(withinOne  / entries.length * 1000) / 1000,
    meanDiscrepancy:    Math.round(meanDisc   * 10) / 10,
    blindSpots,
  }
}
