// lib/grade/card-identify.ts
import Anthropic from '@anthropic-ai/sdk'
import type { CardIdentity } from './types'
import { toAnthropicImageSource } from './image-source'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// Manufacturer/brand names to strip when building the set label
const MANUFACTURER_WORDS = new Set([
  'Panini', 'Topps', 'Bowman', 'Fleer', 'Upper', 'Deck', 'Donruss', 'Score',
])

// All words that appear capitalised in titles but are NOT part of a player name.
// Used to skip false-positive Firstname-Lastname matches (e.g. "Panini Prizm").
const NON_PLAYER_WORDS = new Set([
  ...MANUFACTURER_WORDS,
  // Set lines / product names
  'Prizm', 'Chrome', 'Optic', 'Select', 'Mosaic', 'National', 'Treasures',
  'Absolute', 'Contenders', 'Spectra', 'Certified', 'Crown', 'Royale',
  'Immaculate', 'Playoff', 'Stadium', 'Club', 'Finest', 'Heritage',
  'Flawless', 'Origins', 'Chronicles', 'Illusions', 'Flux', 'Luminance',
  'Elements', 'Draft', 'Prospects', 'Ginter', 'Refractor', 'Parallel',
  'Holo', 'Graded', 'Auto',
  // Colors (parallels)
  'Silver', 'Gold', 'Blue', 'Red', 'Black', 'White', 'Green', 'Purple',
  'Orange', 'Pink', 'Yellow', 'Aqua', 'Teal',
])

function buildCardKey(player: string, year: number, set: string, cardNumber: string): string {
  return [player, String(year), set, cardNumber]
    .map((s) =>
      s.toLowerCase()
       .replace(/\s+/g, '-')
       .replace(/[^a-z0-9-]/g, '')
       .replace(/-+/g, '-')
       .replace(/^-|-$/g, '')
    )
    .join('-')
}

export async function identifyCardFromTitle(title: string): Promise<CardIdentity | null> {
  // Fast path: parse eBay listing title directly
  // e.g. "2018 Panini Prizm Patrick Mahomes RC #168 PSA 10"
  const yearMatch = title.match(/\b(19|20)\d{2}\b/)
  const cardNumMatch = title.match(/#\s*(\w+)/)

  if (!yearMatch || !cardNumMatch) return null

  const year = parseInt(yearMatch[0], 10)
  const cardNumber = cardNumMatch[1]

  const afterYear = title.slice(title.indexOf(yearMatch[0]) + yearMatch[0].length).trim()

  // Scan word-by-word so overlapping pairs ("Silver Patrick Mahomes") don't
  // consume "Patrick" before "Patrick Mahomes" is tested.
  const words = afterYear.split(/\s+/)
  let playerIdx = -1
  for (let i = 0; i < words.length - 1; i++) {
    const w1 = words[i], w2 = words[i + 1]
    if (
      /^[A-Z][a-z]+$/.test(w1) && /^[A-Z][a-z]+$/.test(w2) &&
      !NON_PLAYER_WORDS.has(w1) && !NON_PLAYER_WORDS.has(w2)
    ) {
      playerIdx = i
      break
    }
  }
  const player = playerIdx >= 0 ? `${words[playerIdx]} ${words[playerIdx + 1]}` : 'Unknown'

  // Set: words before the player pair, manufacturer brands stripped out
  const set = (playerIdx > 0 ? words.slice(0, playerIdx) : [])
    .filter((w) => !MANUFACTURER_WORDS.has(w))
    .join(' ')
    .trim() || 'Unknown'

  const cardKey = buildCardKey(player, year, set, cardNumber)
  const identity: CardIdentity = { player, year, set, cardNumber, cardKey }

  const gradeMatch = title.match(/\b(PSA|BGS|SGC)\s+(\d+(?:\.\d+)?)\b/i)
  if (gradeMatch) {
    identity.grade = {
      grader: gradeMatch[1].toUpperCase() as 'PSA' | 'BGS' | 'SGC',
      score: parseFloat(gradeMatch[2]),
    }
  }

  return identity
}

// Returns 0–1 reflecting how many fields were confidently extracted.
// Weights: year=0.25, player=0.35, cardNumber=0.20, set=0.20.
// Threshold for "trustworthy" comp query: ≥ 0.6.
export function confidenceScore(identity: CardIdentity | null): number {
  if (!identity) return 0
  let score = 0.25 // year always present for a non-null identity
  if (identity.player !== 'Unknown') score += 0.35
  if (identity.cardNumber) score += 0.20
  if (identity.set !== 'Unknown') score += 0.20
  return score
}

export async function identifyCardFromImage(imageUrl: string): Promise<CardIdentity | null> {
  const prompt = `Look at this sports card image and extract the following details. Return JSON only, no prose.

{
  "player": "Full name as printed on the card",
  "year": 2018,
  "set": "Set name e.g. Prizm, Topps Chrome, Bowman",
  "cardNumber": "Card number as printed e.g. 168, RC-1, PA-1"
}

If you cannot determine any field, use null for that field.`

  try {
    const response = await client.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 256,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: toAnthropicImageSource(imageUrl) },
            { type: 'text', text: prompt },
          ],
        },
      ],
    })

    const text = response.content[0].type === 'text' ? response.content[0].text : ''
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return null

    const parsed = JSON.parse(jsonMatch[0]) as {
      player?: string | null
      year?: number | null
      set?: string | null
      cardNumber?: string | null
    }

    if (!parsed.player || !parsed.year || !parsed.set || !parsed.cardNumber) return null

    const cardKey = buildCardKey(parsed.player, parsed.year, parsed.set, parsed.cardNumber)
    return {
      player: parsed.player,
      year: parsed.year,
      set: parsed.set,
      cardNumber: parsed.cardNumber,
      cardKey,
    }
  } catch {
    return null
  }
}
