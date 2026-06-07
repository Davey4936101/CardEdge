import type { PortfolioCard } from './types'
import { resolveCurrentValue } from './pnl'

export type SellSignal = 'SELL NOW' | 'SELL SOON' | 'HOLD' | 'ACCUMULATE'

export interface SellSignalResult {
  signal: SellSignal
  color: string
  reason: string
  netRoiAfterFees: number | null
}

const FEES_PCT = 0.13

export function computeSellSignal(card: PortfolioCard): SellSignalResult {
  if (card.status === 'sold') {
    return { signal: 'HOLD', color: 'text-slate-500', reason: 'Already sold.', netRoiAfterFees: null }
  }

  const currentValue = resolveCurrentValue(card)
  if (currentValue === null) {
    return { signal: 'HOLD', color: 'text-slate-500', reason: 'No market data — update value manually.', netRoiAfterFees: null }
  }

  const cost = card.raw_purchase_price
  const grossRoi = ((currentValue - cost) / cost) * 100
  const netRoi = grossRoi - FEES_PCT * 100
  const daysHeld = Math.floor((Date.now() - new Date(card.raw_purchase_date).getTime()) / 86_400_000)

  if (netRoi >= 25 || (netRoi >= 15 && daysHeld >= 90)) {
    return {
      signal: 'SELL NOW',
      color: 'text-emerald-400',
      reason: `${netRoi.toFixed(0)}% net ROI after fees${daysHeld >= 90 ? ` over ${daysHeld}d` : ''}. Strong exit point.`,
      netRoiAfterFees: netRoi,
    }
  }

  if (netRoi >= 10) {
    return {
      signal: 'SELL SOON',
      color: 'text-amber-400',
      reason: `${netRoi.toFixed(0)}% net ROI. Solid gain — consider listing if you need liquidity.`,
      netRoiAfterFees: netRoi,
    }
  }

  if (netRoi < -20) {
    return {
      signal: 'ACCUMULATE',
      color: 'text-indigo-400',
      reason: `Down ${Math.abs(netRoi).toFixed(0)}% after fees. Market may recover — monitor or average down.`,
      netRoiAfterFees: netRoi,
    }
  }

  return {
    signal: 'HOLD',
    color: 'text-slate-300',
    reason: `${netRoi >= 0 ? '+' : ''}${netRoi.toFixed(0)}% after fees. Not worth selling yet — fees would eat the gain.`,
    netRoiAfterFees: netRoi,
  }
}
