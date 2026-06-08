// lib/grade/centering.ts
import type { CenteringResult } from './types'
import { fetchImageBuffer } from './image-source'

const CV_SERVICE_URL = process.env.CV_SERVICE_URL ?? 'http://localhost:8001'

// PSA centering thresholds
// Front: 55/45 for PSA 10, 60/40 for PSA 9
// Back:  75/25 for PSA 10 (much more lenient)
function frontEligible(lr: number, tb: number): boolean {
  return lr <= 55 && lr >= 45 && tb <= 55 && tb >= 45
}
function backEligible(lr: number, tb: number): boolean {
  return lr <= 75 && lr >= 25 && tb <= 75 && tb >= 25
}

async function measureOne(
  imageUrl: string,
  face: 'front' | 'back'
): Promise<{ leftRight: number; topBottom: number; confidence: 'high' | 'low'; error?: string }> {
  let imageBuffer: ArrayBuffer
  try {
    imageBuffer = await fetchImageBuffer(imageUrl)
  } catch {
    return { leftRight: 50, topBottom: 50, confidence: 'low', error: 'image_fetch_failed' }
  }

  const form = new FormData()
  form.append('file', new Blob([imageBuffer], { type: 'image/jpeg' }), `${face}.jpg`)
  form.append('face', face)

  try {
    const cvRes = await fetch(`${CV_SERVICE_URL}/centering`, {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(10_000),
    })

    if (!cvRes.ok) {
      return { leftRight: 50, topBottom: 50, confidence: 'low', error: 'cv_service_error' }
    }

    const data = (await cvRes.json()) as {
      left_right?: number
      top_bottom?: number
      confidence?: 'high' | 'low'
      error?: string
    }

    if (data.error) {
      return { leftRight: 50, topBottom: 50, confidence: 'low', error: data.error }
    }

    return {
      leftRight: data.left_right ?? 50,
      topBottom: data.top_bottom ?? 50,
      confidence: data.confidence ?? 'low',
    }
  } catch (err) {
    return {
      leftRight: 50,
      topBottom: 50,
      confidence: 'low',
      error: err instanceof Error ? err.message : 'unknown',
    }
  }
}

export async function measureCentering(
  frontImageUrl: string,
  backImageUrl: string
): Promise<CenteringResult> {
  const [frontRaw, backRaw] = await Promise.all([
    measureOne(frontImageUrl, 'front'),
    measureOne(backImageUrl, 'back'),
  ])

  return {
    front: {
      leftRight: frontRaw.leftRight,
      topBottom: frontRaw.topBottom,
      psa10Eligible: frontEligible(frontRaw.leftRight, frontRaw.topBottom),
    },
    back: {
      leftRight: backRaw.leftRight,
      topBottom: backRaw.topBottom,
      psa10Eligible: backEligible(backRaw.leftRight, backRaw.topBottom),
    },
    confidence: frontRaw.confidence === 'high' && backRaw.confidence === 'high' ? 'high' : 'low',
    error: frontRaw.error ?? backRaw.error,
  }
}
