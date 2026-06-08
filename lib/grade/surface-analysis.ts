// lib/grade/surface-analysis.ts
import Anthropic from '@anthropic-ai/sdk'
import type { SurfaceResult, CardType } from './types'
import { toAnthropicImageSource } from './image-source'
import { runMultiPass, averageMultipliers, majorityAssessment, aggregateConfidence } from './multi-pass'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

function buildFrontSurfacePrompt(cardType: CardType): string {
  const prizmNote = cardType === 'foil_chrome'
    ? `CRITICAL DEFECT TO CHECK: The "Prizm Dimple" — a small factory indentation at or near the card center — is the most common cause of PSA 9 on otherwise gem-mint Prizm/Chrome cards. Look specifically for a tiny circular or oval indentation in the card surface. If found, note its location and size.

Also examine for foil scratches — bright linear marks or dull patches in the foil visible at this raking angle. These are the hardest defects to detect and only visible with raking light.`
    : ''

  return `You are an expert PSA grader evaluating the FRONT SURFACE of a raw sports card. This is a RAKING LIGHT photo (flashlight held at 45°) — the optimal angle to detect scratches and surface defects.

${prizmNote}

Image order:
- First images: CONFIRMED PSA 10 front surface reference photos of this card
- Next images: CONFIRMED PSA 9 front surface reference photos
- Final image: The RAW CARD's front surface under raking light

PSA SURFACE STANDARDS (front):
- Excellent (→PSA 10): Sharp focus, full original gloss. No scratches, stains, print lines, or surface defects of any kind.
- Good (→PSA 9): One slight printing defect OR very minor scratch that does not impair overall appeal. No staining.
- Fair (→PSA 8): Minor printing imperfections visible. Slight surface wear. No significant staining.
- Poor (→PSA 7 or below): Clear scratches, print lines, staining, or heavy surface wear visible.

Return ONLY valid JSON:
{
  "assessment": "excellent|good|fair|poor",
  "confidence": "high|medium|low",
  "multipliers": [1.0, 1.0, 1.0, 1.0],
  "defects_found": ["list any specific defects, e.g. 'possible Prizm Dimple at center', 'foil scratch upper-right'"],
  "notes": "one sentence describing surface condition"
}`
}

function buildBackSurfacePrompt(): string {
  return `You are an expert PSA grader evaluating the BACK SURFACE of a raw sports card.

Image order:
- First images: CONFIRMED PSA 10 back surface references
- Next images: CONFIRMED PSA 9 back surface references
- Final image: The RAW CARD's back surface

PSA BACK SURFACE STANDARDS:
- Excellent (→PSA 10): Clean, no staining, no wax stains, original gloss intact
- Good (→PSA 9): Very slight imperfection that does not impair overall appeal
- Fair (→PSA 8): Very slight wax stain permissible. Minor print defect acceptable.
- Poor (→PSA 7 or below): Visible staining, heavy print defects, significant wear

Return ONLY valid JSON:
{
  "assessment": "excellent|good|fair|poor",
  "confidence": "high|medium|low",
  "multipliers": [1.0, 1.0, 1.0, 1.0],
  "notes": "one sentence describing back surface condition"
}`
}

async function analyseOnce(
  imageUrl: string,
  referenceImages: Array<{ imageUrl: string; psa_grade: number }>,
  prompt: string
) {
  const refs10 = referenceImages.filter((r) => r.psa_grade === 10).slice(0, 3)
  const refs9  = referenceImages.filter((r) => r.psa_grade === 9).slice(0, 2)
  const allUrls = [...refs10.map((r) => r.imageUrl), ...refs9.map((r) => r.imageUrl), imageUrl]

  const imageBlocks = allUrls.map((url) => ({
    type: 'image' as const,
    source: toAnthropicImageSource(url),
  }))

  const response = await client.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 512,
    messages: [{ role: 'user', content: [...imageBlocks, { type: 'text', text: prompt }] }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : '{}'
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  try {
    return JSON.parse(jsonMatch?.[0] ?? '{}') as {
      assessment?: string
      confidence?: string
      multipliers?: [number, number, number, number]
      defects_found?: string[]
      notes?: string
    }
  } catch {
    return {}
  }
}

const ASSESSMENT_SUBGRADE: Record<string, number> = {
  excellent: 10, good: 9, fair: 8, poor: 6,
}
const FRONT_MULTIPLIERS: Record<string, [number, number, number, number]> = {
  excellent: [1.2, 1.0, 0.8, 0.5],
  good:      [0.6, 1.3, 1.0, 0.6],
  fair:      [0.2, 0.8, 1.3, 1.0],
  poor:      [0.05, 0.3, 1.0, 1.5],
}
const BACK_MULTIPLIERS: Record<string, [number, number, number, number]> = {
  excellent: [1.1, 1.0, 0.9, 0.8],
  good:      [0.8, 1.1, 1.0, 0.8],
  fair:      [0.5, 0.9, 1.1, 1.0],
  poor:      [0.1, 0.5, 1.0, 1.3],
}

export async function analyzeSurface(
  manifest: { rakingLight: string; back: string },
  referenceImages: Array<{ imageUrl: string; psa_grade: number }>,
  cardType: CardType,
  runs = 3
): Promise<SurfaceResult> {
  const frontPrompt = buildFrontSurfacePrompt(cardType)
  const backPrompt = buildBackSurfacePrompt()

  const [frontRuns, backRuns] = await Promise.all([
    runMultiPass(() => analyseOnce(manifest.rakingLight, referenceImages, frontPrompt), runs),
    runMultiPass(() => analyseOnce(manifest.back, referenceImages, backPrompt), runs),
  ])

  const frontAssessment = majorityAssessment(frontRuns.map((r) => r.assessment ?? 'fair'))
  const backAssessment  = majorityAssessment(backRuns.map((r) => r.assessment ?? 'fair'))

  // Combined multipliers: front is weighted 2×, back 1×
  const frontMults = FRONT_MULTIPLIERS[frontAssessment] ?? [1, 1, 1, 1]
  const backMults  = BACK_MULTIPLIERS[backAssessment] ?? [1, 1, 1, 1]
  const combined: [number, number, number, number] = [
    (frontMults[0] * 2 + backMults[0]) / 3,
    (frontMults[1] * 2 + backMults[1]) / 3,
    (frontMults[2] * 2 + backMults[2]) / 3,
    (frontMults[3] * 2 + backMults[3]) / 3,
  ]

  return {
    front: {
      subGrade: ASSESSMENT_SUBGRADE[frontAssessment] ?? 8,
      assessment: frontAssessment as SurfaceResult['front']['assessment'],
      confidence: aggregateConfidence(frontRuns.map((r) => r.confidence ?? 'low')) as 'high' | 'medium' | 'low',
      defectsFound: frontRuns[0].defects_found ?? [],
      notes: frontRuns[0].notes ?? '',
    },
    back: {
      subGrade: ASSESSMENT_SUBGRADE[backAssessment] ?? 8,
      assessment: backAssessment as SurfaceResult['back']['assessment'],
      confidence: aggregateConfidence(backRuns.map((r) => r.confidence ?? 'low')) as 'high' | 'medium' | 'low',
      notes: backRuns[0].notes ?? '',
    },
    multipliers: combined,
  }
}
