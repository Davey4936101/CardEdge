// lib/grade/grade-distribution.ts
import type { GradeDistribution, AttributeResult } from './types'

const FLAT_PRIOR: GradeDistribution = { 10: 0.08, 9: 0.50, 8: 0.30, 7: 0.12 }

export function applyBayesianUpdate(
  prior: GradeDistribution,
  attributes: AttributeResult[],
  centeringEligible: boolean
): GradeDistribution {
  // Start with centering multipliers
  const centeringMultipliers: [number, number, number, number] = centeringEligible
    ? [1.2, 1.0, 0.9, 0.7]  // eligible → boosts P(10)
    : [0.1, 0.8, 1.2, 1.3]  // not eligible → kills P(10)

  const allMultipliers = [centeringMultipliers, ...attributes.map((a) => a.multipliers)]

  // Multiply all multiplier vectors element-wise
  const combined: [number, number, number, number] = [1, 1, 1, 1]
  for (const mults of allMultipliers) {
    combined[0] *= mults[0]
    combined[1] *= mults[1]
    combined[2] *= mults[2]
    combined[3] *= mults[3]
  }

  const unnormalized = {
    10: prior[10] * combined[0],
    9: prior[9] * combined[1],
    8: prior[8] * combined[2],
    7: prior[7] * combined[3],
  }

  return normalize(unnormalized)
}

function normalize(dist: GradeDistribution): GradeDistribution {
  const total = dist[10] + dist[9] + dist[8] + dist[7]
  if (total === 0) return FLAT_PRIOR
  return {
    10: dist[10] / total,
    9: dist[9] / total,
    8: dist[8] / total,
    7: dist[7] / total,
  }
}

export { FLAT_PRIOR }
