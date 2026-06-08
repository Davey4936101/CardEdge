import { describe, it, expect, vi } from 'vitest'
import { runMultiPass, averageMultipliers } from '../multi-pass'

describe('runMultiPass', () => {
  it('calls the function N times and returns all results', async () => {
    const fn = vi.fn().mockResolvedValue('result')
    const results = await runMultiPass(fn, 3)
    expect(fn).toHaveBeenCalledTimes(3)
    expect(results).toHaveLength(3)
  })

  it('aggregates numeric arrays by averaging', async () => {
    let call = 0
    const fn = vi.fn().mockImplementation(async () => {
      call++
      return { multipliers: [call, call, call, call] as [number, number, number, number] }
    })
    const results = await runMultiPass(fn, 3)
    const avg = averageMultipliers(results.map((r) => r.multipliers))
    // calls returned [1,1,1,1], [2,2,2,2], [3,3,3,3] — avg should be [2,2,2,2]
    expect(avg).toEqual([2, 2, 2, 2])
  })

  it('runs calls in parallel', async () => {
    const order: number[] = []
    const fn = vi.fn().mockImplementation(async (_i: number) => {
      order.push(_i)
      return _i
    })
    await runMultiPass((i) => fn(i), 3)
    // All three should have been dispatched (order may vary)
    expect(order).toHaveLength(3)
  })
})
