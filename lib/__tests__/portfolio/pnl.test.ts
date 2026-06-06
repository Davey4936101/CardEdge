import { describe, it, expect } from 'vitest'
import { resolveCurrentValue, unrealizedPnl, realizedPnl, summarize } from '@/lib/portfolio/pnl'
import type { PortfolioCard } from '@/lib/portfolio/types'

function makeCard(overrides: Partial<PortfolioCard> = {}): PortfolioCard {
  return {
    id: '1', user_id: null, card_key: 'test', player: 'Test', set_name: 'Set',
    year: null, grade: null, status: 'raw_owned', source: 'manual',
    alert_id: null, analysis_id: null,
    raw_purchase_price: 100, raw_purchase_date: '2026-01-01',
    submitted_at: null, received_grade: null, received_at: null,
    current_value_override: null, current_value_fetched: null,
    current_value_fetched_at: null, sold_price: null, sold_at: null,
    notes: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('resolveCurrentValue', () => {
  it('returns override when set', () => {
    expect(resolveCurrentValue(makeCard({ current_value_override: 150, current_value_fetched: 120 }))).toBe(150)
  })
  it('falls back to fetched when no override', () => {
    expect(resolveCurrentValue(makeCard({ current_value_fetched: 120 }))).toBe(120)
  })
  it('returns null when neither is set', () => {
    expect(resolveCurrentValue(makeCard())).toBeNull()
  })
  it('returns sold_price for sold cards', () => {
    expect(resolveCurrentValue(makeCard({ status: 'sold', sold_price: 200 }))).toBe(200)
  })
})

describe('unrealizedPnl', () => {
  it('returns null for sold cards', () => {
    expect(unrealizedPnl(makeCard({ status: 'sold', sold_price: 200 }))).toBeNull()
  })
  it('returns null when no current value', () => {
    expect(unrealizedPnl(makeCard())).toBeNull()
  })
  it('calculates positive P&L correctly', () => {
    const pnl = unrealizedPnl(makeCard({ current_value_fetched: 150 }))
    expect(pnl).not.toBeNull()
    expect(pnl!.amount).toBe(50)
    expect(pnl!.pct).toBeCloseTo(50, 1)
  })
  it('calculates negative P&L correctly', () => {
    const pnl = unrealizedPnl(makeCard({ current_value_fetched: 80 }))
    expect(pnl!.amount).toBe(-20)
    expect(pnl!.pct).toBeCloseTo(-20, 1)
  })
})

describe('realizedPnl', () => {
  it('returns null for non-sold cards', () => {
    expect(realizedPnl(makeCard())).toBeNull()
  })
  it('calculates realized gain', () => {
    const pnl = realizedPnl(makeCard({ status: 'sold', sold_price: 180 }))
    expect(pnl!.amount).toBe(80)
    expect(pnl!.pct).toBeCloseTo(80, 1)
  })
})

describe('summarize', () => {
  it('counts non-sold positions', () => {
    const cards = [makeCard(), makeCard({ id: '2', status: 'sold', sold_price: 120 })]
    const s = summarize(cards, 5)
    expect(s.positionCount).toBe(1)
    expect(s.activeAlertCount).toBe(5)
  })
  it('sums portfolio value from fetched prices', () => {
    const cards = [
      makeCard({ current_value_fetched: 150 }),
      makeCard({ id: '2', current_value_fetched: 200 }),
    ]
    const s = summarize(cards, 0)
    expect(s.portfolioValue).toBe(350)
    expect(s.costBasis).toBe(200)
    expect(s.unrealizedPnl).toBe(150)
    expect(s.unrealizedPnlPct).toBeCloseTo(75, 1)
  })
  it('sums realized P&L from sold cards', () => {
    const cards = [makeCard({ status: 'sold', sold_price: 130 })]
    const s = summarize(cards, 0)
    expect(s.realizedPnl).toBe(30)
  })
  it('breaks down status counts correctly', () => {
    const cards = [
      makeCard({ id: '1', status: 'raw_owned' }),
      makeCard({ id: '2', status: 'submitted' }),
      makeCard({ id: '3', status: 'graded_owned' }),
    ]
    const s = summarize(cards, 0)
    expect(s.statusBreakdown).toEqual({ raw_owned: 1, submitted: 1, graded_owned: 1 })
  })
})
