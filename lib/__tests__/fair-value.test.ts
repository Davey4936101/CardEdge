import { describe, it, expect } from 'vitest'
import { calculateFairValue, calculateRoiPct } from '../fair-value'

describe('calculateFairValue', () => {
  it('returns null for empty array', () => {
    expect(calculateFairValue([])).toBeNull()
  })

  it('returns null when fewer than 3 comps', () => {
    const now = new Date()
    expect(
      calculateFairValue([
        { price: 100, saleDate: now },
        { price: 200, saleDate: now },
      ])
    ).toBeNull()
  })

  it('returns a result with 3 or more comps', () => {
    const now = new Date()
    const result = calculateFairValue([
      { price: 100, saleDate: now },
      { price: 200, saleDate: now },
      { price: 300, saleDate: now },
    ])
    expect(result).not.toBeNull()
    expect(result!.compCount).toBe(3)
  })

  it('gives higher weight to more recent sales', () => {
    const today = new Date()
    const daysAgo1 = new Date(today.getTime() - 1 * 86_400_000)
    const daysAgo60 = new Date(today.getTime() - 60 * 86_400_000)
    const daysAgo89 = new Date(today.getTime() - 89 * 86_400_000)

    const result = calculateFairValue([
      { price: 500, saleDate: daysAgo1 },
      { price: 100, saleDate: daysAgo60 },
      { price: 100, saleDate: daysAgo89 },
    ])
    expect(result).not.toBeNull()
    expect(result!.fairValue).toBeGreaterThan(400)
  })

  it('with equal-age comps produces simple weighted average', () => {
    const now = new Date()
    const result = calculateFairValue([
      { price: 100, saleDate: now },
      { price: 200, saleDate: now },
      { price: 300, saleDate: now },
    ])
    expect(result!.fairValue).toBeCloseTo(200, 0)
  })
})

describe('calculateRoiPct', () => {
  it('returns ~22.1% when listed at $180 vs $231 FV', () => {
    expect(calculateRoiPct(180, 231)).toBeCloseTo(22.08, 1)
  })

  it('returns 0 when listed at fair value', () => {
    expect(calculateRoiPct(100, 100)).toBe(0)
  })

  it('returns negative when listed above fair value', () => {
    expect(calculateRoiPct(200, 100)).toBeLessThan(0)
  })
})
