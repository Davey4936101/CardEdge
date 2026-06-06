// lib/__tests__/grade/grade-distribution.test.ts
import { describe, it, expect } from 'vitest'
import { applyBayesianUpdate } from '@/lib/grade/grade-distribution'
import type { AttributeResult, GradeDistribution } from '@/lib/grade/types'

const UNIFORM: GradeDistribution = { 10: 0.25, 9: 0.25, 8: 0.25, 7: 0.25 }

function attr(mults: [number, number, number, number]): AttributeResult {
  return {
    attribute: 'corners',
    assessment: 'good',
    confidence: 'high',
    multipliers: mults,
    notes: '',
  }
}

describe('applyBayesianUpdate', () => {
  it('no-op multipliers return normalized prior', () => {
    const result = applyBayesianUpdate(UNIFORM, [attr([1, 1, 1, 1])], true)
    // centering eligible boosts 10 slightly, but with uniform prior expect rough normalization
    expect(result[10] + result[9] + result[8] + result[7]).toBeCloseTo(1.0, 5)
  })

  it('centering not eligible crushes P(10)', () => {
    const result = applyBayesianUpdate(UNIFORM, [], false)
    expect(result[10]).toBeLessThan(0.05)
    expect(result[9] + result[8] + result[7]).toBeGreaterThan(0.95)
  })

  it('excellent attributes boost P(10)', () => {
    const result = applyBayesianUpdate(
      UNIFORM,
      [
        attr([2.0, 1.0, 0.5, 0.3]),
        attr([2.0, 1.0, 0.5, 0.3]),
      ],
      true
    )
    expect(result[10]).toBeGreaterThan(result[9])
  })

  it('poor corners crush P(10)', () => {
    const result = applyBayesianUpdate(UNIFORM, [attr([0.1, 0.8, 1.2, 1.5])], true)
    expect(result[10]).toBeLessThan(0.05)
  })

  it('distribution always sums to 1', () => {
    const result = applyBayesianUpdate(
      { 10: 0.14, 9: 0.63, 8: 0.16, 7: 0.07 },
      [attr([0.6, 1.3, 1.0, 0.7])],
      true
    )
    expect(result[10] + result[9] + result[8] + result[7]).toBeCloseTo(1.0, 5)
  })
})
