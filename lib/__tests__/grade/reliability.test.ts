// lib/__tests__/grade/reliability.test.ts
import { describe, it, expect } from 'vitest'
import { aggregateReliability } from '@/lib/grade/reliability'
import type { PhotoQualityResult } from '@/lib/grade/types'

function photo(score: 'high' | 'medium' | 'low'): PhotoQualityResult {
  return { imageUrl: 'https://x.com/a.jpg', resolution: score, blurSevere: false, glare: false, score }
}

describe('aggregateReliability', () => {
  it('returns high when all photos are high', () => {
    const r = aggregateReliability([photo('high'), photo('high')])
    expect(r.score).toBe('high')
    expect(r.bannerText).toBeNull()
  })

  it('returns low when any photo is low', () => {
    const r = aggregateReliability([photo('high'), photo('low')])
    expect(r.score).toBe('low')
    expect(r.bannerText).toContain('directional only')
  })

  it('returns medium when worst is medium', () => {
    const r = aggregateReliability([photo('high'), photo('medium')])
    expect(r.score).toBe('medium')
    expect(r.bannerText).toContain('limited coverage')
  })

  it('returns low for empty array', () => {
    const r = aggregateReliability([])
    expect(r.score).toBe('low')
  })
})
