import { describe, it, expect } from 'vitest'
import { computeGradeScore, applyBayesianUpdate } from '../grade-distribution'

describe('computeGradeScore', () => {
  it('returns 10 for certain PSA 10 distribution', () => {
    const dist = { 10: 1, 9: 0, 8: 0, 7: 0 }
    const score = computeGradeScore(dist)
    expect(score.continuousScore).toBe(10)
    expect(score.confidenceBand).toBeCloseTo(0, 1)
  })

  it('returns 9 for certain PSA 9 distribution', () => {
    const dist = { 10: 0, 9: 1, 8: 0, 7: 0 }
    const score = computeGradeScore(dist)
    expect(score.continuousScore).toBe(9)
  })

  it('returns weighted average for mixed distribution', () => {
    // 50% PSA 10 + 50% PSA 9 = 9.5
    const dist = { 10: 0.5, 9: 0.5, 8: 0, 7: 0 }
    const score = computeGradeScore(dist)
    expect(score.continuousScore).toBeCloseTo(9.5, 5)
  })

  it('confidence band is wider for uncertain distributions', () => {
    const certain = computeGradeScore({ 10: 1, 9: 0, 8: 0, 7: 0 })
    const uncertain = computeGradeScore({ 10: 0.25, 9: 0.25, 8: 0.25, 7: 0.25 })
    expect(uncertain.confidenceBand).toBeGreaterThan(certain.confidenceBand)
  })
})

describe('applyBayesianUpdate', () => {
  it('boosts PSA 10 probability when all attributes are excellent', () => {
    const prior = { 10: 0.08, 9: 0.50, 8: 0.30, 7: 0.12 }
    const excellentMults: [number, number, number, number] = [1.5, 1.0, 0.7, 0.4]
    const result = applyBayesianUpdate(prior, [excellentMults, excellentMults, excellentMults], true)
    expect(result[10]).toBeGreaterThan(prior[10])
  })

  it('crushes PSA 10 probability when centering is not eligible', () => {
    const prior = { 10: 0.35, 9: 0.50, 8: 0.12, 7: 0.03 }
    const result = applyBayesianUpdate(prior, [], false)
    expect(result[10]).toBeLessThan(0.06)
  })
})
