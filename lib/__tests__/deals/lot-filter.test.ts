import { describe, it, expect } from 'vitest'
import { isLotListing } from '@/lib/deals/lot-filter'

describe('isLotListing', () => {
  it('flags the original problem case', () => {
    expect(isLotListing('2025 Select Football cards 1-300, 6 CARD MINIMUM, you pick cards, Free Shipping')).toBe(true)
  })

  it('flags explicit lot language', () => {
    expect(isLotListing('Patrick Mahomes lot of 5 cards')).toBe(true)
    expect(isLotListing('10 Card Lot PSA 10')).toBe(true)
    expect(isLotListing('Football card lots')).toBe(true)
  })

  it('flags you-pick listings', () => {
    expect(isLotListing('You Pick PSA 10 football cards')).toBe(true)
    expect(isLotListing('u pick your card from list')).toBe(true)
    expect(isLotListing('Pick your card - Josh Allen rookies')).toBe(true)
    expect(isLotListing('Buyer picks 3 cards')).toBe(true)
  })

  it('flags minimum order listings', () => {
    expect(isLotListing('6 Card Minimum - Football Base')).toBe(true)
    expect(isLotListing('Minimum 5 cards per order')).toBe(true)
  })

  it('flags complete sets', () => {
    expect(isLotListing('2021 Prizm Football Complete Set 1-300')).toBe(true)
    expect(isLotListing('Full Set Topps Chrome 2020')).toBe(true)
  })

  it('flags per-card pricing', () => {
    expect(isLotListing('$2 per card - you choose Mahomes')).toBe(true)
  })

  it('flags sealed wax / cases', () => {
    expect(isLotListing('2023 Prizm Hobby Box Sealed')).toBe(true)
    expect(isLotListing('Blaster Box 2024 Select Football')).toBe(true)
    expect(isLotListing('Retail Pack Football 2022')).toBe(true)
  })

  it('does NOT flag individual graded cards', () => {
    expect(isLotListing('2018 Panini Prizm Patrick Mahomes RC PSA 10')).toBe(false)
    expect(isLotListing('Josh Allen 2018 Prizm #183 BGS 9.5 Rookie')).toBe(false)
    expect(isLotListing('Justin Herbert 2020 Donruss Rookie Card #306')).toBe(false)
    expect(isLotListing('Victor Wembanyama 2023 Hoops Rookie RC')).toBe(false)
  })

  it('does NOT flag base set references in card names', () => {
    expect(isLotListing('2021 Prizm Base #123 Mahomes')).toBe(false)
    expect(isLotListing('Topps Chrome Base Card Patrick Mahomes')).toBe(false)
  })

  it('does NOT flag set-name cards', () => {
    expect(isLotListing('2023 Topps Series 1 Base Set Card #45 Aaron Judge')).toBe(false)
  })
})
