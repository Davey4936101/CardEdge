import type { PortfolioStatus } from './types'

const VALID: Record<PortfolioStatus, PortfolioStatus[]> = {
  raw_owned:    ['submitted', 'sold'],
  submitted:    ['graded_owned'],
  graded_owned: ['sold'],
  sold:         [],
}

export function canTransition(from: PortfolioStatus, to: PortfolioStatus): boolean {
  return VALID[from].includes(to)
}
