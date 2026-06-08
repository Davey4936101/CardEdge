// lib/grade/corner-analysis.ts
import Anthropic from '@anthropic-ai/sdk'
import type { CornerPosition, CornerResult, CornersResult, CardType } from './types'
import { toAnthropicImageSource } from './image-source'
import { runMultiPass, averageMultipliers, majorityAssessment, aggregateConfidence } from './multi-pass'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const CORNER_LABEL: Record<CornerPosition, string> = {
  top_left: 'Top-Left',
  top_right: 'Top-Right',
  bottom_left: 'Bottom-Left',
  bottom_right: 'Bottom-Right',
}

function buildCornerPrompt(position: CornerPosition, cardType: CardType): string {
  const label = CORNER_LABEL[position]
  const typeNote =
    cardType === 'dark_border'
      ? 'This is a dark-bordered card. Corner fraying shows as white fibres on the dark edge — look carefully for any white at the corner tip.'
      : cardType === 'foil_chrome'
      ? 'This is a foil/chrome card. Corner wear may appear as dull or silver-exposed areas at the tip.'
      : ''

  return `You are an expert PSA grader evaluating the ${label} corner of a raw sports card.

${typeNote}

You will see corner crop images in this order:
- First images: CONFIRMED PSA 10 (Gem Mint) corner crops of this same card
- Next images: CONFIRMED PSA 9 (Mint) corner crops
- Next images: CONFIRMED PSA 8 (NM-MT) corner crops
- Final image: The RAW CARD'S ${label} corner being evaluated

PSA CORNER STANDARDS:
- Excellent (→PSA 10): Perfectly sharp tip, zero fraying under any lighting
- Good (→PSA 9): Microscopic softness or single fibre, does not impair appeal
- Fair (→PSA 8): Slight fraying visible without magnification, corner not sharp
- Poor (→PSA 7 or below): Noticeable rounding, multiple fibres, heavy fraying

Return ONLY valid JSON:
{
  "assessment": "excellent|good|fair|poor",
  "confidence": "high|medium|low",
  "multiplier_10": 1.0,
  "multiplier_9": 1.0,
  "multiplier_8": 1.0,
  "multiplier_7": 1.0,
  "notes": "one sentence describing what you see"
}`
}

async function analyseOneCorner(
  position: CornerPosition,
  cornerCropUrl: string,
  referenceImages: Array<{ imageUrl: string; psa_grade: number }>,
  cardType: CardType
): Promise<CornerResult> {
  const refs10 = referenceImages.filter((r) => r.psa_grade === 10).slice(0, 3)
  const refs9 = referenceImages.filter((r) => r.psa_grade === 9).slice(0, 3)
  const refs8 = referenceImages.filter((r) => r.psa_grade === 8).slice(0, 2)

  const allUrls = [
    ...refs10.map((r) => r.imageUrl),
    ...refs9.map((r) => r.imageUrl),
    ...refs8.map((r) => r.imageUrl),
    cornerCropUrl,
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
          { type: 'text', text: buildCornerPrompt(position, cardType) },
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
      multiplier_10?: number
      multiplier_9?: number
      multiplier_8?: number
      multiplier_7?: number
      notes?: string
    }
    return {
      position,
      assessment: (parsed.assessment ?? 'fair') as CornerResult['assessment'],
      confidence: (parsed.confidence ?? 'low') as CornerResult['confidence'],
      multiplier: parsed.multiplier_10 ?? 1,
      notes: parsed.notes ?? '',
    }
  } catch {
    return {
      position,
      assessment: 'fair',
      confidence: 'low',
      multiplier: 1,
      notes: 'Analysis unavailable.',
    }
  }
}

const ASSESSMENT_ORDER = ['excellent', 'good', 'fair', 'poor']
const ASSESSMENT_SUBGRADE: Record<string, number> = {
  excellent: 10,
  good: 9,
  fair: 8,
  poor: 6,
}
const ASSESSMENT_MULTIPLIERS: Record<string, [number, number, number, number]> = {
  excellent: [1.2, 1.0, 0.8, 0.5],
  good:      [0.7, 1.3, 1.0, 0.6],
  fair:      [0.2, 0.8, 1.3, 1.1],
  poor:      [0.05, 0.4, 1.0, 1.5],
}

export async function analyzeCorners(
  manifest: { cornerTopLeft: string; cornerTopRight: string; cornerBottomLeft: string; cornerBottomRight: string },
  referenceImages: Array<{ imageUrl: string; psa_grade: number }>,
  cardType: CardType,
  runs = 3
): Promise<CornersResult> {
  const positions: Array<{ pos: CornerPosition; url: string }> = [
    { pos: 'top_left',     url: manifest.cornerTopLeft },
    { pos: 'top_right',    url: manifest.cornerTopRight },
    { pos: 'bottom_left',  url: manifest.cornerBottomLeft },
    { pos: 'bottom_right', url: manifest.cornerBottomRight },
  ]

  // Run each corner through multi-pass in parallel
  const cornerResults = await Promise.all(
    positions.map(async ({ pos, url }) => {
      const passResults = await runMultiPass(
        () => analyseOneCorner(pos, url, referenceImages, cardType),
        runs
      )
      return {
        position: pos,
        assessment: majorityAssessment(passResults.map((r) => r.assessment)) as CornerResult['assessment'],
        confidence: aggregateConfidence(passResults.map((r) => r.confidence)),
        multiplier: passResults.reduce((sum, r) => sum + r.multiplier, 0) / runs,
        notes: passResults[0].notes,
      } as CornerResult
    })
  )

  // PSA grades to the worst corner
  const worstCorner = cornerResults.reduce((worst, c) => {
    const wIdx = ASSESSMENT_ORDER.indexOf(worst.assessment)
    const cIdx = ASSESSMENT_ORDER.indexOf(c.assessment)
    return cIdx > wIdx ? c : worst
  })

  const worstAssessment = worstCorner.assessment
  const multipliers = ASSESSMENT_MULTIPLIERS[worstAssessment] ?? [1, 1, 1, 1]

  return {
    corners: cornerResults,
    worstCorner: worstCorner.position,
    subGrade: ASSESSMENT_SUBGRADE[worstAssessment] ?? 8,
    multipliers: multipliers as [number, number, number, number],
    notes: `Worst corner: ${CORNER_LABEL[worstCorner.position]} (${worstAssessment}). ${worstCorner.notes}`,
  }
}
