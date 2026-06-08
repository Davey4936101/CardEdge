// lib/grade/grade-distribution.ts
import type { GradeDistribution, GradeScore } from './types'

const FLAT_PRIOR: GradeDistribution = { 10: 0.08, 9: 0.50, 8: 0.30, 7: 0.12 }

export function computeGradeScore(distribution: GradeDistribution): GradeScore {
  const continuousScore =
    10 * distribution[10] +
    9  * distribution[9]  +
    8  * distribution[8]  +
    7  * distribution[7]

  // Standard deviation of the distribution
  const variance =
    distribution[10] * Math.pow(10 - continuousScore, 2) +
    distribution[9]  * Math.pow(9  - continuousScore, 2) +
    distribution[8]  * Math.pow(8  - continuousScore, 2) +
    distribution[7]  * Math.pow(7  - continuousScore, 2)

  const confidenceBand = Math.round(Math.sqrt(variance) * 100) / 100

  return { distribution, continuousScore: Math.round(continuousScore * 100) / 100, confidenceBand }
}

// multiplierSets: array of [mult_10, mult_9, mult_8, mult_7] from each attribute
export function applyBayesianUpdate(
  prior: GradeDistribution,
  multiplierSets: [number, number, number, number][],
  centeringFrontEligible: boolean
): GradeDistribution {
  const centeringMults: [number, number, number, number] = centeringFrontEligible
    ? [1.2, 1.0, 0.9, 0.7]
    : [0.1, 0.8, 1.2, 1.3]

  const combined: [number, number, number, number] = [1, 1, 1, 1]
  for (const mults of [centeringMults, ...multiplierSets]) {
    combined[0] *= mults[0]
    combined[1] *= mults[1]
    combined[2] *= mults[2]
    combined[3] *= mults[3]
  }

  const unnormalized = {
    10: prior[10] * combined[0],
    9:  prior[9]  * combined[1],
    8:  prior[8]  * combined[2],
    7:  prior[7]  * combined[3],
  }

  return normalize(unnormalized)
}

function normalize(dist: GradeDistribution): GradeDistribution {
  const total = dist[10] + dist[9] + dist[8] + dist[7]
  if (total === 0) return FLAT_PRIOR
  return {
    10: dist[10] / total,
    9:  dist[9]  / total,
    8:  dist[8]  / total,
    7:  dist[7]  / total,
  }
}

export { FLAT_PRIOR }
