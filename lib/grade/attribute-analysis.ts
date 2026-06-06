// lib/grade/attribute-analysis.ts
import Anthropic from '@anthropic-ai/sdk'
import type { AttributeResult, AttributeName } from './types'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

function buildPrompt(referenceCount10: number, referenceCount9: number): string {
  return `You are an expert PSA card grader. You will analyze a raw (ungraded) sports card.

The images are structured as follows:
- First ${referenceCount10} images: CONFIRMED PSA 10 GEM MINT copies of this exact card
- Next ${referenceCount9} images: CONFIRMED PSA 9 MINT copies of this exact card
- Remaining images: The RAW CARD being evaluated

PSA STANDARDS:
- PSA 10: Four sharp corners, no edge wear, surface free of defects, near-perfect centering
- PSA 9: One minor flaw allowed (very slight corner wear OR minor edge wear OR minor print line)
- PSA 8: Moderate wear, slight surface wear, minor corner rounding on up to two corners
- PSA 7: Up to three corners with noticeable rounding, light scratches, heavier edge wear

For each attribute of the RAW CARD, compare it against the reference images and return a JSON object.
multipliers is [mult_for_10, mult_for_9, mult_for_8, mult_for_7] — relative likelihood adjustments, use 1.0 for no change.

Return ONLY valid JSON:
{
  "corners": {
    "assessment": "good",
    "confidence": "high",
    "multipliers": [0.6, 1.3, 1.0, 0.7],
    "notes": "Three sharp corners. Top-right shows slight rounding consistent with PSA 9 references."
  },
  "edges": {
    "assessment": "excellent",
    "confidence": "high",
    "multipliers": [1.1, 1.0, 0.9, 0.7],
    "notes": "All edges clean. No chipping or whitening visible."
  },
  "surface": {
    "assessment": "excellent",
    "confidence": "medium",
    "multipliers": [1.0, 1.0, 1.0, 1.0],
    "notes": "No visible defects. Confidence medium — flat lighting may hide micro-scratches."
  }
}`
}

export async function analyzeAttributes(
  submittedImageUrls: string[],
  referenceImages: Array<{ imageUrl: string; psa_grade: number }>
): Promise<AttributeResult[]> {
  const refs10 = referenceImages.filter((r) => r.psa_grade === 10).slice(0, 5)
  const refs9 = referenceImages.filter((r) => r.psa_grade === 9).slice(0, 5)

  const allImages = [
    ...refs10.map((r) => r.imageUrl),
    ...refs9.map((r) => r.imageUrl),
    ...submittedImageUrls,
  ]

  const imageBlocks = allImages.map((url) => ({
    type: 'image' as const,
    source: { type: 'url' as const, url },
  }))

  const response = await client.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: [
          ...imageBlocks,
          { type: 'text', text: buildPrompt(refs10.length, refs9.length) },
        ],
      },
    ],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : '{}'
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) return defaultAttributes()

  try {
    const parsed = JSON.parse(jsonMatch[0]) as Record<
      AttributeName,
      {
        assessment: string
        confidence: string
        multipliers: [number, number, number, number]
        notes: string
      }
    >

    const attrs: AttributeName[] = ['corners', 'edges', 'surface']
    return attrs.map((attr) => {
      const a = parsed[attr]
      if (!a) return defaultAttribute(attr)
      return {
        attribute: attr,
        assessment: (a.assessment ?? 'fair') as AttributeResult['assessment'],
        confidence: (a.confidence ?? 'low') as AttributeResult['confidence'],
        multipliers: a.multipliers ?? [1, 1, 1, 1],
        notes: a.notes ?? '',
      }
    })
  } catch {
    return defaultAttributes()
  }
}

function defaultAttribute(attribute: AttributeName): AttributeResult {
  return {
    attribute,
    assessment: 'fair',
    confidence: 'low',
    multipliers: [1, 1, 1, 1],
    notes: 'Analysis unavailable.',
  }
}

function defaultAttributes(): AttributeResult[] {
  return (['corners', 'edges', 'surface'] as AttributeName[]).map(defaultAttribute)
}
