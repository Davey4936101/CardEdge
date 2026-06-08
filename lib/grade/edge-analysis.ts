// lib/grade/edge-analysis.ts
import Anthropic from '@anthropic-ai/sdk'
import type { EdgeResult, CardType } from './types'
import { toAnthropicImageSource } from './image-source'
import { runMultiPass, averageMultipliers, majorityAssessment, aggregateConfidence } from './multi-pass'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

function buildEdgePrompt(cardType: CardType): string {
  const typeNote =
    cardType === 'dark_border'
      ? 'CRITICAL: This is a dark-bordered card. Edge whitening — white specks or streaks along dark edges — is the #1 PSA 10 killer on dark-bordered cards. Examine every edge extremely carefully under the angled lighting for any white.'
      : cardType === 'foil_chrome'
      ? 'This is a foil/chrome card. Look for edge chipping where the foil layer has separated, and for roughness along the cut edges.'
      : ''

  return `You are an expert PSA grader evaluating the edges of a raw sports card.

${typeNote}

Image order:
- First images: CONFIRMED PSA 10 edge crops of this same card
- Next images: CONFIRMED PSA 9 edge crops
- Next images: CONFIRMED PSA 8 edge crops
- Remaining images: The RAW CARD's edge crops (top, bottom, sides)

PSA EDGE STANDARDS:
- Excellent (→PSA 10): All edges perfectly clean — no chipping, whitening, roughness, or wear
- Good (→PSA 9): Slight handling on one edge; no chipping; minor white specks tolerable if non-distracting
- Fair (→PSA 8): Slight roughness or whitening on 1–2 edges; no heavy chipping
- Poor (→PSA 7 or below): Clear chipping, heavy whitening, or rough edges on multiple sides

Return ONLY valid JSON:
{
  "assessment": "excellent|good|fair|poor",
  "confidence": "high|medium|low",
  "multipliers": [1.0, 1.0, 1.0, 1.0],
  "notes": "one sentence — which edges have issues and what kind"
}`
}

const ASSESSMENT_SUBGRADE: Record<string, number> = {
  excellent: 10, good: 9, fair: 8, poor: 6,
}
const ASSESSMENT_MULTIPLIERS: Record<string, [number, number, number, number]> = {
  excellent: [1.1, 1.0, 0.9, 0.7],
  good:      [0.8, 1.2, 1.0, 0.7],
  fair:      [0.3, 0.9, 1.2, 1.0],
  poor:      [0.05, 0.5, 1.0, 1.4],
}

async function analyseEdgesOnce(
  edgeCropUrls: string[],
  referenceImages: Array<{ imageUrl: string; psa_grade: number }>,
  cardType: CardType
): Promise<{ assessment: string; confidence: string; multipliers: [number, number, number, number]; notes: string }> {
  const refs10 = referenceImages.filter((r) => r.psa_grade === 10).slice(0, 2)
  const refs9  = referenceImages.filter((r) => r.psa_grade === 9).slice(0, 2)
  const refs8  = referenceImages.filter((r) => r.psa_grade === 8).slice(0, 1)

  const allUrls = [
    ...refs10.map((r) => r.imageUrl),
    ...refs9.map((r) => r.imageUrl),
    ...refs8.map((r) => r.imageUrl),
    ...edgeCropUrls,
  ]

  const imageBlocks = allUrls.map((url) => ({
    type: 'image' as const,
    source: toAnthropicImageSource(url),
  }))

  const response = await client.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 256,
    messages: [
      {
        role: 'user',
        content: [
          ...imageBlocks,
          { type: 'text', text: buildEdgePrompt(cardType) },
        ],
      },
    ],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : '{}'
  const jsonMatch = text.match(/\{[\s\S]*\}/)

  try {
    const parsed = JSON.parse(jsonMatch?.[0] ?? '{}') as {
      assessment?: string
      confidence?: string
      multipliers?: [number, number, number, number]
      notes?: string
    }
    return {
      assessment: parsed.assessment ?? 'fair',
      confidence: parsed.confidence ?? 'low',
      multipliers: parsed.multipliers ?? [1, 1, 1, 1],
      notes: parsed.notes ?? '',
    }
  } catch {
    return { assessment: 'fair', confidence: 'low', multipliers: [1, 1, 1, 1], notes: 'Analysis unavailable.' }
  }
}

export async function analyzeEdges(
  manifest: { edgeTop: string; edgeBottom: string; edgeSides: string },
  referenceImages: Array<{ imageUrl: string; psa_grade: number }>,
  cardType: CardType,
  runs = 3
): Promise<EdgeResult> {
  const edgeCropUrls = [manifest.edgeTop, manifest.edgeBottom, manifest.edgeSides]
  const passResults = await runMultiPass(
    () => analyseEdgesOnce(edgeCropUrls, referenceImages, cardType),
    runs
  )

  const assessment = majorityAssessment(passResults.map((r) => r.assessment))
  const confidence = aggregateConfidence(passResults.map((r) => r.confidence))
  const multipliers = averageMultipliers(passResults.map((r) => r.multipliers))

  return {
    subGrade: ASSESSMENT_SUBGRADE[assessment] ?? 8,
    assessment: assessment as EdgeResult['assessment'],
    confidence: confidence as EdgeResult['confidence'],
    multipliers,
    notes: passResults[0].notes,
  }
}
