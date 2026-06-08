import { describe, it, expect } from 'vitest'
import { computePopVelocity } from '../pop-velocity'

const makeSnapshot = (date: string, count10: number, total = 100) => ({
  snapshot_date: date,
  count_10: count10,
  count_9: total - count10 - 10,
  count_8: 8,
  count_7: 2,
  total,
})

describe('computePopVelocity', () => {
  it('returns null for empty snapshots', () => {
    expect(computePopVelocity([])).toBeNull()
  })

  it('detects high pop pressure (>15% growth in 30 days)', () => {
    const snapshots = [
      makeSnapshot('2026-06-08', 62),
      makeSnapshot('2026-05-08', 50),
      makeSnapshot('2026-03-08', 40),
    ]
    const result = computePopVelocity(snapshots)
    expect(result).not.toBeNull()
    expect(result!.popPressure).toBe('high')
    expect(result!.pop10Growth30d).toBe(12)
    expect(result!.pop10GrowthRate30d).toBeGreaterThan(0.15)
  })

  it('detects moderate pop pressure (5–15% growth)', () => {
    const snapshots = [
      makeSnapshot('2026-06-08', 55),
      makeSnapshot('2026-05-08', 50),
      makeSnapshot('2026-03-08', 48),
    ]
    const result = computePopVelocity(snapshots)
    expect(result!.popPressure).toBe('moderate')
  })

  it('detects low pop pressure (<5% growth)', () => {
    const snapshots = [
      makeSnapshot('2026-06-08', 51),
      makeSnapshot('2026-05-08', 50),
      makeSnapshot('2026-03-08', 50),
    ]
    const result = computePopVelocity(snapshots)
    expect(result!.popPressure).toBe('low')
  })

  it('detects rising gem rate trend', () => {
    const snapshots = [
      makeSnapshot('2026-06-08', 40, 100),
      makeSnapshot('2026-05-08', 38, 100),
      makeSnapshot('2026-03-08', 35, 100),
    ]
    const result = computePopVelocity(snapshots)
    expect(result!.gemRateTrend).toBe('rising')
  })

  it('includes a human-readable message', () => {
    const snapshots = [makeSnapshot('2026-06-08', 60, 150)]
    const result = computePopVelocity(snapshots)
    expect(result!.message).toContain('60')
  })
})
