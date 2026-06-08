import { describe, it, expect } from 'vitest'
import { analyzeAccuracyEntry, computeAccuracyStats } from '../accuracy'

describe('analyzeAccuracyEntry', () => {
  it('marks within-half-grade correctly', () => {
    const e = analyzeAccuracyEntry('id1', 'card-a', 9.3, 9, { corners: 9.0, edges: 9.5, surface: 9.5 })
    expect(e.isWithinHalfGrade).toBe(true)
    expect(e.isWithinOneGrade).toBe(true)
    expect(e.discrepancy).toBeCloseTo(-0.3, 1)
  })

  it('identifies dominant blind spot when overestimated', () => {
    const e = analyzeAccuracyEntry('id2', 'card-b', 9.5, 8, {
      centering: 9.5,
      corners:   7.0,
      edges:     9.0,
      surface:   9.0,
    })
    expect(e.dominantBlindSpot).toBe('corners')
    expect(e.isWithinOneGrade).toBe(false)
  })

  it('returns null blind spot when actual >= predicted', () => {
    const e = analyzeAccuracyEntry('id3', 'card-c', 8.5, 10, {})
    expect(e.dominantBlindSpot).toBeNull()
  })

  it('generates a summary string', () => {
    const e = analyzeAccuracyEntry('id4', 'card-d', 9.2, 9, {})
    expect(typeof e.summary).toBe('string')
    expect(e.summary.length).toBeGreaterThan(0)
  })
})

describe('computeAccuracyStats', () => {
  it('returns zero stats for empty array', () => {
    const stats = computeAccuracyStats([])
    expect(stats.totalPredictions).toBe(0)
    expect(stats.withinHalfGradePct).toBe(0)
  })

  it('computes correct pct and mean discrepancy', () => {
    const entries = [
      analyzeAccuracyEntry('a', 'k', 9.0, 9, {}),   // exact
      analyzeAccuracyEntry('b', 'k', 9.5, 9, {}),   // -0.5
      analyzeAccuracyEntry('c', 'k', 9.0, 8, {}),   // -1.0
    ]
    const stats = computeAccuracyStats(entries)
    expect(stats.totalPredictions).toBe(3)
    expect(stats.withinHalfGrade).toBe(2)
    expect(stats.withinOneGrade).toBe(3)
  })

  it('tallies blind spots', () => {
    const entries = [
      analyzeAccuracyEntry('a', 'k', 9.5, 8, { corners: 7.0, edges: 9.0 }),
      analyzeAccuracyEntry('b', 'k', 9.5, 8, { corners: 7.0, edges: 9.5 }),
    ]
    const stats = computeAccuracyStats(entries)
    expect(stats.blindSpots.corners).toBe(2)
  })
})
