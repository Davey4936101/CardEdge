// lib/grade/quick-grade.ts
import Anthropic from '@anthropic-ai/sdk'
import { toAnthropicImageSource } from './image-source'
import type { GradeDistribution } from './types'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export interface QuickGradeResult {
  distribution: GradeDistribution
  psa10Probability: number  // 0–1, same as distribution[10]
  confidence: 'high' | 'low'
}

const PROMPT = `You are a PSA card grading expert evaluating a single listing photo.
Based ONLY on what is visible in this image, estimate the probability this raw card receives each PSA grade when submitted.

Return JSON only, no prose:
{
  "p10": 0.25,
  "p9": 0.45,
  "p8": 0.20,
  "p7": 0.10,
  "confidence": "high"
}

Rules:
- p10 + p9 + p8 + p7 must equal exactly 1.0
- confidence is "low" when the image is low-quality, shows only one side, or is a stock/placeholder photo
- confidence is "high" when centering, corners, and surface are reasonably visible
- If the card appears already graded (slab visible), set confidence to "low" and distribute conservatively`

export async function quickGrade(imageUrl: string): Promise<QuickGradeResult> {
  const fallback: QuickGradeResult = {
    distribution: { 10: 0.08, 9: 0.50, 8: 0.30, 7: 0.12 },
    psa10Probability: 0.08,
    confidence: 'low',
  }

  if (!imageUrl) return fallback

  try {
    const response = await client.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 256,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: toAnthropicImageSource(imageUrl) },
          { type: 'text', text: PROMPT },
        ],
      }],
    })

    const text = response.content[0].type === 'text' ? response.content[0].text : ''
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) return fallback

    const parsed = JSON.parse(match[0]) as {
      p10?: number; p9?: number; p8?: number; p7?: number; confidence?: string
    }

    const p10 = parsed.p10 ?? 0.08
    const p9  = parsed.p9  ?? 0.50
    const p8  = parsed.p8  ?? 0.30
    const p7  = parsed.p7  ?? 0.12
    const total = p10 + p9 + p8 + p7

    if (total <= 0) return fallback

    // Normalise to sum to exactly 1
    const distribution: GradeDistribution = {
      10: p10 / total,
      9:  p9  / total,
      8:  p8  / total,
      7:  p7  / total,
    }

    return {
      distribution,
      psa10Probability: distribution[10],
      confidence: parsed.confidence === 'high' ? 'high' : 'low',
    }
  } catch {
    return fallback
  }
}
