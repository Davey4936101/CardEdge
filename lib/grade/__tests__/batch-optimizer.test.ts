import { describe, it, expect } from 'vitest'
import { rankCards, buildBatch } from '../batch-optimizer'
import type { BatchCard } from '../batch-optimizer'

const makeCard = (id: string, rawPrice: number, p10: number, comp10: number, comp9: number): BatchCard => ({
  id,
  cardKey: `card-${id}`,
  rawPrice,
  distribution: { 10: p10, 9: 1 - p10 - 0.15, 8: 0.10, 7: 0.05 },
  comps: { 10: comp10, 9: comp9 },
})

describe('rankCards', () => {
  it('sorts by expected profit descending', () => {
    const cards = [
      makeCard('a', 50, 0.4, 300, 120),
      makeCard('b', 50, 0.05, 100, 60),
    ]
    const ranked = rankCards(cards)
    expect(ranked[0].id).toBe('a')
    expect(ranked[1].id).toBe('b')
  })

  it('marks cards below break-even', () => {
    const cards = [makeCard('cheap', 5, 0.02, 40, 20)]
    const ranked = rankCards(cards)
    expect(ranked[0].aboveBreakEven).toBe(false)
  })

  it('marks cards above break-even', () => {
    const cards = [makeCard('good', 30, 0.50, 400, 150)]
    const ranked = rankCards(cards)
    expect(ranked[0].aboveBreakEven).toBe(true)
    expect(ranked[0].expectedProfit).toBeGreaterThan(0)
  })
})

describe('buildBatch', () => {
  it('includes only above-break-even cards in recommendation', () => {
    const cards = [
      makeCard('good',  30, 0.50, 400, 150),
      makeCard('bad',    5, 0.01,  30,  15),
    ]
    const result = buildBatch(cards)
    expect(result.recommended.every((c) => c.aboveBreakEven)).toBe(true)
    expect(result.recommended.some((c) => c.id === 'bad')).toBe(false)
  })

  it('limits recommendation to batchSize', () => {
    const cards = Array.from({ length: 30 }, (_, i) =>
      makeCard(`c${i}`, 20, 0.40, 200, 80)
    )
    const result = buildBatch(cards, 10)
    expect(result.recommended.length).toBeLessThanOrEqual(10)
  })

  it('computes aggregate totals', () => {
    const cards = [makeCard('x', 50, 0.50, 400, 150)]
    const result = buildBatch(cards)
    expect(result.totalCost).toBeGreaterThan(0)
    expect(result.totalExpectedReturn).toBeGreaterThan(0)
    expect(typeof result.batchRoi).toBe('number')
  })
})
