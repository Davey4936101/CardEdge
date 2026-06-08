// lib/grade/__tests__/card-type.test.ts
import { describe, it, expect } from 'vitest'
import { detectCardType } from '../card-type'

describe('detectCardType', () => {
  it('identifies Prizm as foil_chrome', () => {
    expect(detectCardType('Patrick Mahomes', 2018, 'Prizm', '168')).toBe('foil_chrome')
  })

  it('identifies Chrome as foil_chrome', () => {
    expect(detectCardType('Luka Doncic', 2018, 'Topps Chrome', '168')).toBe('foil_chrome')
  })

  it('identifies Optic as foil_chrome', () => {
    expect(detectCardType('Joe Burrow', 2020, 'Optic', '151')).toBe('foil_chrome')
  })

  it('identifies Prizm Silver as dark_border', () => {
    expect(detectCardType('Patrick Mahomes', 2018, 'Prizm Silver', '168')).toBe('dark_border')
  })

  it('identifies Select as dark_border', () => {
    expect(detectCardType('Josh Allen', 2018, 'Select', '290')).toBe('dark_border')
  })

  it('identifies pre-1990 card as vintage', () => {
    expect(detectCardType('Nolan Ryan', 1972, 'Topps', '595')).toBe('vintage')
  })

  it('identifies base Topps as matte', () => {
    expect(detectCardType('Ronald Acuna', 2019, 'Topps', '1')).toBe('matte')
  })

  it('identifies Heritage as matte', () => {
    expect(detectCardType('Mike Trout', 2011, 'Heritage', '207')).toBe('matte')
  })
})
