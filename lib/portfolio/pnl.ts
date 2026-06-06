import type { PortfolioCard, PortfolioSummary } from './types'

export function resolveCurrentValue(card: PortfolioCard): number | null {
  if (card.status === 'sold') return card.sold_price ?? null
  return card.current_value_override ?? card.current_value_fetched ?? null
}

export function unrealizedPnl(card: PortfolioCard): { amount: number; pct: number } | null {
  if (card.status === 'sold') return null
  const value = resolveCurrentValue(card)
  if (value === null) return null
  const amount = value - card.raw_purchase_price
  const pct = card.raw_purchase_price > 0 ? (amount / card.raw_purchase_price) * 100 : 0
  return { amount, pct }
}

export function realizedPnl(card: PortfolioCard): { amount: number; pct: number } | null {
  if (card.status !== 'sold' || card.sold_price === null) return null
  const amount = card.sold_price - card.raw_purchase_price
  const pct = card.raw_purchase_price > 0 ? (amount / card.raw_purchase_price) * 100 : 0
  return { amount, pct }
}

export function summarize(cards: PortfolioCard[], alertCount: number): PortfolioSummary {
  const nonSold = cards.filter((c) => c.status !== 'sold')
  const sold = cards.filter((c) => c.status === 'sold')
  let portfolioValue = 0
  for (const c of nonSold) {
    const v = resolveCurrentValue(c)
    if (v !== null) portfolioValue += v
  }
  const costBasis = nonSold.reduce((s, c) => s + c.raw_purchase_price, 0)
  const unrealizedPnlAmount = portfolioValue - costBasis
  const unrealizedPnlPct = costBasis > 0 ? (unrealizedPnlAmount / costBasis) * 100 : 0
  const realizedPnlAmount = sold.reduce((s, c) => {
    const r = realizedPnl(c)
    return r ? s + r.amount : s
  }, 0)
  return {
    portfolioValue,
    costBasis,
    unrealizedPnl: unrealizedPnlAmount,
    unrealizedPnlPct,
    realizedPnl: realizedPnlAmount,
    activeAlertCount: alertCount,
    positionCount: nonSold.length,
    statusBreakdown: {
      raw_owned: nonSold.filter((c) => c.status === 'raw_owned').length,
      submitted: nonSold.filter((c) => c.status === 'submitted').length,
      graded_owned: nonSold.filter((c) => c.status === 'graded_owned').length,
    },
  }
}
