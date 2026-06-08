// lib/psa/__tests__/api-client.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock fetch before importing the module
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

import { getPopData, type PopData } from '../api-client'

describe('getPopData', () => {
  beforeEach(() => {
    mockFetch.mockReset()
    // Set env vars for tests
    process.env.PSA_API_USERNAME = 'test-user'
    process.env.PSA_API_PASSWORD = 'test-pass'
  })

  it('returns parsed population data when API responds', async () => {
    // Token request
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: 'test-token', expires_in: 3600 }),
    })
    // Population data request
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        PSASet: {
          PSACards: [
            {
              cardID: '123',
              pop10: 47,
              pop9: 210,
              pop8: 88,
              pop7: 31,
              totalGraded: 376,
            },
          ],
        },
      }),
    })

    const result = await getPopData('Patrick Mahomes', 2018, 'Prizm', '168')
    expect(result).not.toBeNull()
    expect(result!.count10).toBe(47)
    expect(result!.total).toBe(376)
    expect(result!.gemRate).toBeCloseTo(47 / 376, 5)
  })

  it('returns null when API call fails', async () => {
    // Token request
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: 'test-token', expires_in: 3600 }),
    })
    // Population data request fails
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404 })
    const result = await getPopData('Unknown Player', 1900, 'Unknown Set', '1')
    expect(result).toBeNull()
  })

  it('returns null when PSA_API_USERNAME env var is missing', async () => {
    const original = process.env.PSA_API_USERNAME
    delete process.env.PSA_API_USERNAME
    const result = await getPopData('Patrick Mahomes', 2018, 'Prizm', '168')
    expect(result).toBeNull()
    process.env.PSA_API_USERNAME = original
  })
})
