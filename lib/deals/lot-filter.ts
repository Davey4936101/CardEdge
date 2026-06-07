/**
 * Lot / multi-card listing detection.
 *
 * Returns true if the eBay title looks like a bulk listing rather than a
 * single card. Patterns are conservative to avoid false positives on
 * legitimate individual cards that happen to contain common words.
 */

const LOT_PATTERNS: RegExp[] = [
  // Explicit lot language
  /\blots?\b/i,
  /\blot\s+of\b/i,

  // Buyer-choice / you pick
  /\byou\s+pick\b/i,
  /\bu\s+pick\b/i,
  /\bpick\s+your\b/i,
  /\bchoose\s+your\b/i,
  /\bbuyer\s+picks?\b/i,

  // Minimum order language
  /\d+\s*card\s*minimum/i,
  /minimum\s+\d+\s*cards?/i,
  /\d+\s*minimum\b/i,

  // Card ranges (e.g., "cards 1-300", "1-300 cards")
  /cards?\s+\d+-\d+/i,
  /\d+-\d+\s+cards?/i,

  // Per-card pricing
  /\bper\s+card\b/i,

  // Complete / full sets
  /complete\s+set/i,
  /full\s+set/i,
  /\bpartial\s+set\b/i,
  /base\s+set\s+complete/i,

  // Wax / sealed product (not individual cards)
  /\b(wax|hobby|retail|blaster|mega|value|gravity|fat)\s+(box|pack|case)\b/i,
  /sealed\s+(box|case)/i,
  /\bbooster\s+(box|pack)\b/i,
  /\bcase\s+break\b/i,
  /\bgroup\s+break\b/i,

  // Multi-card counts in title  e.g., "(5 cards)" or "5-card set"
  /\(\s*\d{2,}\s*cards?\s*\)/i,
  /\b[3-9]\d*[\s-]card\s+(set|bundle|collection|pack)\b/i,

  // Explicit multi-card bundle language
  /\bbundle\s+of\s+\d+/i,
  /\bcollection\s+of\s+\d+/i,
  /\bpack\s+of\s+\d+\s+cards?\b/i,
]

export function isLotListing(title: string): boolean {
  return LOT_PATTERNS.some((re) => re.test(title))
}
