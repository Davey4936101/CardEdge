// lib/grade/card-identify.ts
import Anthropic from '@anthropic-ai/sdk'
import type { CardIdentity } from './types'
import { toAnthropicImageSource } from './image-source'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

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

  // Extract player — heuristic: words after year that look like a name
  const afterYear = title.slice(title.indexOf(yearMatch[0]) + yearMatch[0].length).trim()
  // Remove set/brand words and extract player name
  const playerMatch = afterYear.match(/([A-Z][a-z]+ [A-Z][a-z]+)/)
  const player = playerMatch ? playerMatch[1] : 'Unknown'

  // Extract set — words between year and player
  const beforePlayer = afterYear.slice(0, playerMatch ? afterYear.indexOf(playerMatch[0]) : afterYear.length).trim()
  const set = beforePlayer.replace(/\s+/g, ' ').trim() || 'Unknown'

  const cardKey = buildCardKey(player, year, set, cardNumber)
  return { player, year, set, cardNumber, cardKey }
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
