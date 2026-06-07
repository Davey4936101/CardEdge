// lib/grade/reference-images.ts
import { getEbayToken } from '@/lib/ebay/rapidapi'
import { createServerClient } from '@/lib/supabase/server'
import type { GradeKey } from './types'

const GRADES_TO_FETCH: GradeKey[] = [10, 9, 8]
const TARGET_PER_GRADE = 10

interface ReferenceImage {
  imageUrl: string
  psa_grade: GradeKey
}

async function fetchGradedImages(
  player: string,
  year: number,
  set: string,
  grade: GradeKey
): Promise<string[]> {
  const query = `${player} ${year} ${set} PSA ${grade}`

  // 1. Official eBay Browse API (requires developer.ebay.com credentials)
  const clientId = process.env.EBAY_CLIENT_ID
  const clientSecret = process.env.EBAY_CLIENT_SECRET
  const hasEbayCreds =
    clientId &&
    clientSecret &&
    clientId !== 'your-client-id' &&
    clientSecret !== 'your-client-secret'

  if (hasEbayCreds) {
    try {
      const token = await getEbayToken()
      const base =
        process.env.EBAY_ENVIRONMENT === 'sandbox'
          ? 'https://api.sandbox.ebay.com'
          : 'https://api.ebay.com'

      const params = new URLSearchParams({
        q: query,
        category_ids: '212',
        filter: 'buyingOptions:{FIXED_PRICE|AUCTION}',
        limit: '20',
      })

      const res = await fetch(`${base}/buy/browse/v1/item_summary/search?${params}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US',
          'X-EBAY-C-ENDUSERCTX': 'contextualLocation=country=US',
        },
      })

      if (res.ok) {
        const data = (await res.json()) as {
          itemSummaries?: Array<{ image?: { imageUrl: string } }>
        }
        const urls = (data.itemSummaries ?? [])
          .filter((item) => item.image?.imageUrl)
          .map((item) => item.image!.imageUrl)
          .slice(0, TARGET_PER_GRADE)
        if (urls.length > 0) return urls
      }
    } catch {
      // fall through to OpenWebNinja
    }
  }

  // 2. OpenWebNinja real-time-ebay-data (no eBay dev account needed)
  const owKey = process.env.OPENWEBNINJA_API_KEY
  if (owKey) {
    try {
      const params = new URLSearchParams({ query, limit: '20', country: 'us' })
      const res = await fetch(
        `https://api.openwebninja.com/real-time-ebay-data/search?${params}`,
        { cache: 'no-store', headers: { 'x-api-key': owKey } }
      )
      if (res.ok) {
        type RawItem = { image?: string; thumbnail?: string }
        const raw = (await res.json()) as RawItem[] | { data?: { products?: RawItem[] } | RawItem[]; results?: RawItem[]; items?: RawItem[]; products?: RawItem[] }
        let items: RawItem[]
        if (Array.isArray(raw)) items = raw
        else if (raw.data && !Array.isArray(raw.data) && Array.isArray((raw.data as { products?: RawItem[] }).products)) items = (raw.data as { products: RawItem[] }).products
        else if (Array.isArray(raw.data)) items = raw.data as RawItem[]
        else items = (raw as { results?: RawItem[]; items?: RawItem[]; products?: RawItem[] }).results ?? (raw as { results?: RawItem[]; items?: RawItem[]; products?: RawItem[] }).items ?? (raw as { results?: RawItem[]; items?: RawItem[]; products?: RawItem[] }).products ?? []

        const urls = items
          .map((i) => i.image ?? i.thumbnail ?? '')
          .filter(Boolean)
          .slice(0, TARGET_PER_GRADE)
        if (urls.length > 0) return urls
      }
    } catch {
      // fall through — no reference images available
    }
  }

  return []
}

export async function ensureReferenceImages(
  cardKey: string,
  player: string,
  year: number,
  set: string
): Promise<void> {
  const supabase = createServerClient()

  for (const grade of GRADES_TO_FETCH) {
    const { count } = await supabase
      .from('grade_reference_images')
      .select('*', { count: 'exact', head: true })
      .eq('card_key', cardKey)
      .eq('psa_grade', grade)

    if ((count ?? 0) >= 5) continue

    const urls = await fetchGradedImages(player, year, set, grade)
    if (urls.length === 0) continue

    const rows = urls.map((url) => ({
      card_key: cardKey,
      psa_grade: grade,
      image_url: url,
    }))

    await supabase
      .from('grade_reference_images')
      .upsert(rows, { onConflict: 'image_url', ignoreDuplicates: true })
  }
}

export async function getReferenceImages(
  cardKey: string
): Promise<ReferenceImage[]> {
  const supabase = createServerClient()

  const { data } = await supabase
    .from('grade_reference_images')
    .select('image_url, psa_grade')
    .eq('card_key', cardKey)
    .order('psa_grade', { ascending: false })
    .limit(TARGET_PER_GRADE * GRADES_TO_FETCH.length)

  return (data ?? []).map((row) => ({
    imageUrl: row.image_url as string,
    psa_grade: row.psa_grade as GradeKey,
  }))
}
