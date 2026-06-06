// lib/__tests__/grade/ev-engine.test.ts
import { describe, it, expect } from 'vitest'
import { calculateAllTiers } from '@/lib/grade/ev-engine'
import type { GradeDistribution, GradedComps } from '@/lib/grade/types'

const DISTRIBUTION: GradeDistribution = { 10: 0.09, 9: 0.54, 8: 0.28, 7: 0.09 }
const COMPS: GradedComps = { 10: 920, 9: 380, 8: 175, 7: 95 }
const RAW_PRICE = 120

describe('calculateAllTiers', () => {
  it('returns three tiers', () => {
    const tiers = calculateAllTiers(RAW_PRICE, DISTRIBUTION, COMPS)
    expect(tiers).toHaveLength(3)
    expect(tiers.map((t) => t.name)).toEqual(['regular', 'express', 'superExpress'])
  })

  it('total cost = raw + fee + shipping', () => {
    const tiers = calculateAllTiers(RAW_PRICE, DISTRIBUTION, COMPS)
    expect(tiers[0].ev.totalCost).toBe(120 + 25 + 12) // 157
    expect(tiers[1].ev.totalCost).toBe(120 + 150 + 12) // 282
    expect(tiers[2].ev.totalCost).toBe(120 + 500 + 12) // 632
  })

  it('EV is positive for profitable scenario on regular tier', () => {
    const tiers = calculateAllTiers(RAW_PRICE, DISTRIBUTION, COMPS)
    expect(tiers[0].ev.evGraded).toBeGreaterThan(tiers[0].ev.totalCost)
    expect(tiers[0].ev.expectedProfit).toBeGreaterThan(0)
  })

  it('super express shows skip when profit is negative', () => {
    const tiers = calculateAllTiers(RAW_PRICE, DISTRIBUTION, COMPS)
    expect(tiers[2].ev.recommendation).toBe('skip')
  })

  it('break-even grade is PSA 8 when PSA 8 comp exceeds regular cost', () => {
    // comps[8] = 175 > totalCost(regular) = 157 → break-even is 8
    const tiers = calculateAllTiers(RAW_PRICE, DISTRIBUTION, COMPS)
    expect(tiers[0].ev.breakEvenGrade).toBe(8)
  })

  it('P(break-even) for PSA 8 = P(8)+P(9)+P(10)', () => {
    const tiers = calculateAllTiers(RAW_PRICE, DISTRIBUTION, COMPS)
    const expected = DISTRIBUTION[8] + DISTRIBUTION[9] + DISTRIBUTION[10]
    expect(tiers[0].ev.breakEvenProbability).toBeCloseTo(expected, 4)
  })

  it('recommendation is grade when P(break-even) >= 0.8', () => {
    // P(>=8) = 0.28+0.54+0.09 = 0.91 → should be 'grade'
    const tiers = calculateAllTiers(RAW_PRICE, DISTRIBUTION, COMPS)
    expect(tiers[0].ev.recommendation).toBe('grade')
  })

  it('returns null annualizedReturn when EP is negative', () => {
    const tiers = calculateAllTiers(RAW_PRICE, DISTRIBUTION, COMPS)
    expect(tiers[2].ev.annualizedReturn).toBeNull()
  })

  it('handles missing grade comps gracefully', () => {
    const partialComps: GradedComps = { 9: 380 } // only PSA 9 data
    const tiers = calculateAllTiers(RAW_PRICE, DISTRIBUTION, partialComps)
    expect(tiers[0].ev.evGraded).toBeGreaterThan(0)
  })
})
