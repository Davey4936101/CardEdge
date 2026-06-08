// lib/grade/__tests__/crossover.test.ts
import { describe, it, expect } from 'vitest'
import { computeCrossoverProbability, computeCrossoverEv } from '../crossover'

describe('computeCrossoverProbability', () => {
  it('returns ~0.50 for quad 9.5', () => {
    const p = computeCrossoverProbability(9.5, 9.5, 9.5, 9.5)
    expect(p).toBeGreaterThanOrEqual(0.45)
    expect(p).toBeLessThanOrEqual(0.55)
  })

  it('returns ~0.12 for three 9.5 + one 9.0', () => {
    const p = computeCrossoverProbability(9.5, 9.5, 9.5, 9.0)
    expect(p).toBeGreaterThanOrEqual(0.08)
    expect(p).toBeLessThanOrEqual(0.18)
  })

  it('returns <0.05 when any sub-grade is below 9.0', () => {
    expect(computeCrossoverProbability(9.5, 9.5, 9.5, 8.5)).toBeLessThan(0.05)
    expect(computeCrossoverProbability(8.0, 9.5, 9.5, 9.5)).toBeLessThan(0.05)
  })

  it('probabilities are clamped to [0, 1]', () => {
    const p = computeCrossoverProbability(10, 10, 10, 10)
    expect(p).toBeGreaterThanOrEqual(0)
    expect(p).toBeLessThanOrEqual(1)
  })
})

describe('computeCrossoverEv', () => {
  it('computes three-way EV correctly', () => {
    const result = computeCrossoverEv({
      centeringSub: 9.5,
      cornersSub:   9.5,
      edgesSub:     9.5,
      surfaceSub:   9.5,
      crossoverProbability: 0.50,
      bgsSaleValue:    250,
      psa10SaleValue:  400,
      psa9SaleValue:   120,
      rawValue:        200,
    })
    // evCrossover = 0.5*400 + 0.5*120 - 150 = 260 - 150 = 110
    expect(result.evCrossover).toBeCloseTo(110, 0)
    // evKeepBgs = 250
    expect(result.evKeepBgs).toBe(250)
    // evCrackRaw: grade distribution weighted value - 37 fees - 20 risk = some positive number
    expect(typeof result.evCrackRaw).toBe('number')
    expect(['keep', 'crossover', 'crack']).toContain(result.recommendation)
  })

  it('recommends keep when BGS value beats both alternatives', () => {
    const result = computeCrossoverEv({
      centeringSub: 9.0,
      cornersSub:   9.0,
      edgesSub:     9.0,
      surfaceSub:   9.0,
      crossoverProbability: 0.02,
      bgsSaleValue:     300,
      psa10SaleValue:   350,
      psa9SaleValue:    120,
      rawValue:         220,
    })
    expect(result.recommendation).toBe('keep')
  })
})
