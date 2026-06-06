// lib/grade/reliability.ts
import type { PhotoQualityResult, Reliability, SessionReliability } from './types'

const BANNER: Record<Exclude<Reliability, 'high'>, string> = {
  medium:
    '⚠ Medium Reliability — seller photos have limited coverage. Surface estimate may be inaccurate.',
  low: '⚠ Low Reliability — photo quality is poor. This estimate is directional only. Consider requesting better photos from the seller before bidding.',
}

export function aggregateReliability(
  photoScores: PhotoQualityResult[]
): SessionReliability {
  if (photoScores.length === 0) {
    return { score: 'low', photoScores, bannerText: BANNER.low }
  }

  // Session score = worst individual photo score (conservative)
  const order: Reliability[] = ['high', 'medium', 'low']
  const worst = photoScores.reduce<Reliability>((acc, p) => {
    return order.indexOf(p.score) > order.indexOf(acc) ? p.score : acc
  }, 'high')

  return {
    score: worst,
    photoScores,
    bannerText: worst === 'high' ? null : BANNER[worst],
  }
}
