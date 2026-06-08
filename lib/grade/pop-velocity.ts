export type PopTrend = 'rising' | 'stable' | 'falling'
export type PopPressure = 'high' | 'moderate' | 'low'

export interface PopSnapshot {
  snapshot_date: string
  count_10: number
  count_9: number
  count_8: number
  count_7: number
  total: number
}

export interface PopVelocityResult {
  currentPop10: number
  pop10Growth30d: number
  pop10GrowthRate30d: number
  gemRateTrend: PopTrend
  popPressure: PopPressure
  snapshotDate: string
  message: string
}

const GEM_RATE_CHANGE_THRESHOLD = 0.02    // 2% gem rate delta = trend signal
const HIGH_PRESSURE_THRESHOLD   = 0.15    // >15% 30-day PSA 10 growth
const MODERATE_PRESSURE_THRESHOLD = 0.05  // 5–15% = moderate; <5% = low

export function computePopVelocity(snapshots: PopSnapshot[]): PopVelocityResult | null {
  if (snapshots.length === 0) return null

  // Expect snapshots sorted date DESC (newest first)
  const latest = snapshots[0]

  const thirtyDaysAgo = new Date(latest.snapshot_date)
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  const snap30 =
    snapshots.find((s) => new Date(s.snapshot_date) <= thirtyDaysAgo) ??
    snapshots[snapshots.length - 1]

  const ninetyDaysAgo = new Date(latest.snapshot_date)
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)
  const snap90 =
    snapshots.find((s) => new Date(s.snapshot_date) <= ninetyDaysAgo) ?? snap30

  const pop10Growth30d = latest.count_10 - snap30.count_10
  const pop10GrowthRate30d =
    snap30.count_10 > 0 ? pop10Growth30d / snap30.count_10 : 0

  const gemRateLatest = latest.total > 0 ? latest.count_10 / latest.total : 0
  const gemRate90 = snap90.total > 0 ? snap90.count_10 / snap90.total : 0
  const gemRateDelta = gemRateLatest - gemRate90

  const gemRateTrend: PopTrend =
    gemRateDelta > GEM_RATE_CHANGE_THRESHOLD ? 'rising' :
    gemRateDelta < -GEM_RATE_CHANGE_THRESHOLD ? 'falling' : 'stable'

  const popPressure: PopPressure =
    pop10GrowthRate30d > HIGH_PRESSURE_THRESHOLD ? 'high' :
    pop10GrowthRate30d > MODERATE_PRESSURE_THRESHOLD ? 'moderate' : 'low'

  const pct = Math.round(pop10GrowthRate30d * 100)
  const sign = pop10Growth30d >= 0 ? '+' : ''
  const message =
    popPressure === 'high'
      ? `PSA 10 population: ${latest.count_10} copies. ${sign}${pop10Growth30d} in 30 days (${sign}${pct}%). Submit soon before additional supply compresses pricing.`
      : popPressure === 'moderate'
      ? `PSA 10 population: ${latest.count_10} copies. ${sign}${pop10Growth30d} in 30 days (${sign}${pct}%). Moderate growth — monitor before submitting.`
      : `PSA 10 population: ${latest.count_10} copies. Population stable. No near-term pricing pressure.`

  return {
    currentPop10: latest.count_10,
    pop10Growth30d,
    pop10GrowthRate30d: Math.round(pop10GrowthRate30d * 10000) / 10000,
    gemRateTrend,
    popPressure,
    snapshotDate: latest.snapshot_date,
    message,
  }
}
