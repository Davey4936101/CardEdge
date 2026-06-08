// lib/grade/card-type.ts
import type { CardType } from './types'

const FOIL_CHROME_SETS = new Set([
  'prizm', 'chrome', 'optic', 'refractor', 'select chrome',
  'topps chrome', 'bowman chrome', 'finest',
])

// Dark border sets — edge whitening is critical on these
const DARK_BORDER_SETS = new Set([
  'prizm silver', 'prizm black', 'select', 'mosaic black',
  'spectra', 'select silver', 'select gold',
])

export function detectCardType(
  _player: string,
  year: number,
  set: string,
  _cardNumber: string
): CardType {
  if (year < 1990) return 'vintage'

  const normalised = set.toLowerCase().trim()

  for (const darkSet of DARK_BORDER_SETS) {
    if (normalised.includes(darkSet)) return 'dark_border'
  }

  for (const foilSet of FOIL_CHROME_SETS) {
    if (normalised.includes(foilSet)) return 'foil_chrome'
  }

  return 'matte'
}
