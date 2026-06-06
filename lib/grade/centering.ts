// lib/grade/centering.ts
import type { CenteringResult } from './types'
import { fetchImageBuffer } from './image-source'

const CV_SERVICE_URL = process.env.CV_SERVICE_URL ?? 'http://localhost:8001'

export async function measureCentering(imageUrl: string): Promise<CenteringResult> {
  try {
    let imageBuffer: ArrayBuffer
    try {
      imageBuffer = await fetchImageBuffer(imageUrl)
    } catch {
      return { leftRight: 50, topBottom: 50, psa10Eligible: false, confidence: 'low', error: 'image_fetch_failed' }
    }

    // Send to CV microservice
    const form = new FormData()
    form.append('file', new Blob([imageBuffer], { type: 'image/jpeg' }), 'card.jpg')

    const cvRes = await fetch(`${CV_SERVICE_URL}/centering`, {
      method: 'POST',
      body: form,
    })

    if (!cvRes.ok) {
      return { leftRight: 50, topBottom: 50, psa10Eligible: false, confidence: 'low', error: 'cv_service_error' }
    }

    const data = (await cvRes.json()) as {
      left_right?: number
      top_bottom?: number
      psa10_eligible?: boolean
      confidence?: 'high' | 'low'
      error?: string
    }

    if (data.error) {
      return { leftRight: 50, topBottom: 50, psa10Eligible: false, confidence: 'low', error: data.error }
    }

    return {
      leftRight: data.left_right ?? 50,
      topBottom: data.top_bottom ?? 50,
      psa10Eligible: data.psa10_eligible ?? false,
      confidence: data.confidence ?? 'low',
    }
  } catch (err) {
    return {
      leftRight: 50,
      topBottom: 50,
      psa10Eligible: false,
      confidence: 'low',
      error: err instanceof Error ? err.message : 'unknown',
    }
  }
}
