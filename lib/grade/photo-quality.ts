// lib/grade/photo-quality.ts
import type { PhotoQualityResult, Reliability } from './types'
import { estimateDataUriBytes } from './image-source'

interface ImageMetadata {
  url: string
  width?: number
  height?: number
  // In production, decode image dimensions from the buffer.
  // For now, score based on URL patterns and content-length.
  contentLengthBytes?: number
}

function scoreResolution(width?: number, height?: number, bytes?: number): Reliability {
  // Use pixel dimensions if available, fall back to file size heuristic
  if (width && height) {
    const px = width * height
    if (px > 1600 * 1200) return 'high'
    if (px > 800 * 600) return 'medium'
    return 'low'
  }
  if (bytes) {
    if (bytes > 300_000) return 'high'
    if (bytes > 80_000) return 'medium'
    return 'low'
  }
  return 'medium' // unknown → assume medium
}

export async function scorePhotoQuality(imageUrl: string): Promise<PhotoQualityResult> {
  let contentLengthBytes: number | undefined

  const dataUriBytes = estimateDataUriBytes(imageUrl)
  if (dataUriBytes !== undefined) {
    contentLengthBytes = dataUriBytes
  } else {
    try {
      const head = await fetch(imageUrl, { method: 'HEAD' })
      const cl = head.headers.get('content-length')
      if (cl) contentLengthBytes = parseInt(cl, 10)
    } catch {
      // ignore — URL may not support HEAD
    }
  }

  const resolution = scoreResolution(undefined, undefined, contentLengthBytes)

  // Blur and glare detection require pixel analysis (done in CV service).
  // For the HTTP-only scorer, default to non-severe.
  const score: Reliability =
    resolution === 'high' ? 'high' : resolution === 'medium' ? 'medium' : 'low'

  return {
    imageUrl,
    resolution,
    blurSevere: false,
    glare: false,
    score,
  }
}
