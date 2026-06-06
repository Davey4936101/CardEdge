import { describe, it, expect } from 'vitest'
import { canTransition } from '@/lib/portfolio/status-machine'

describe('canTransition', () => {
  it('raw_owned → submitted: valid', () => expect(canTransition('raw_owned', 'submitted')).toBe(true))
  it('raw_owned → sold: valid (raw flip)', () => expect(canTransition('raw_owned', 'sold')).toBe(true))
  it('raw_owned → graded_owned: invalid', () => expect(canTransition('raw_owned', 'graded_owned')).toBe(false))
  it('submitted → graded_owned: valid', () => expect(canTransition('submitted', 'graded_owned')).toBe(true))
  it('submitted → sold: invalid', () => expect(canTransition('submitted', 'sold')).toBe(false))
  it('graded_owned → sold: valid', () => expect(canTransition('graded_owned', 'sold')).toBe(true))
  it('sold has no valid transitions', () => {
    expect(canTransition('sold', 'raw_owned')).toBe(false)
    expect(canTransition('sold', 'submitted')).toBe(false)
  })
})
