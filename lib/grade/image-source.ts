// Converts a URL string (either HTTPS or data URI) to the correct Anthropic image source format.
import type Anthropic from '@anthropic-ai/sdk'

type ImageMediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'

export function toAnthropicImageSource(
  url: string
): Anthropic.ImageBlockParam['source'] {
  if (url.startsWith('data:')) {
    const commaIdx = url.indexOf(',')
    const prefix = url.slice(5, commaIdx) // e.g. "image/jpeg;base64"
    const mediaType = prefix.split(';')[0] as ImageMediaType
    const data = url.slice(commaIdx + 1)
    return { type: 'base64', media_type: mediaType, data }
  }
  return { type: 'url', url }
}

// Resolves an image URL/data URI to an ArrayBuffer, suitable for binary operations.
export async function fetchImageBuffer(url: string): Promise<ArrayBuffer> {
  if (url.startsWith('data:')) {
    const commaIdx = url.indexOf(',')
    const base64 = url.slice(commaIdx + 1)
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return bytes.buffer
  }
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to fetch image: ${res.status}`)
  return res.arrayBuffer()
}

// Returns estimated byte size for photo-quality scoring without a round-trip fetch.
export function estimateDataUriBytes(url: string): number | undefined {
  if (!url.startsWith('data:')) return undefined
  const commaIdx = url.indexOf(',')
  const base64 = url.slice(commaIdx + 1)
  return Math.floor((base64.length * 3) / 4)
}
