// lib/grade/reference-images.ts
import { getEbayToken } from '@/lib/ebay/auth'
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
  const token = await getEbayToken()
  const base =
    process.env.EBAY_ENVIRONMENT === 'sandbox'
      ? 'https://api.sandbox.ebay.com'
      : 'https://api.ebay.com'

  const params = new URLSearchParams({
    q: `${player} ${year} ${set} PSA ${grade}`,
    category_ids: '212',
    filter: 'buyingOptions:{FIXED_PRICE|AUCTION}',
    limit: '20',
  })

  const res = await fetch(
    `${base}/buy/browse/v1/item_summary/search?${params}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US',
        'X-EBAY-C-ENDUSERCTX': 'contextualLocation=country=US',
      },
    }
  )

  if (!res.ok) return []

  const data = (await res.json()) as {
    itemSummaries?: Array<{ image?: { imageUrl: string }; title: string }>
  }

  return (data.itemSummaries ?? [])
    .filter((item) => item.image?.imageUrl)
    .map((item) => item.image!.imageUrl)
    .slice(0, TARGET_PER_GRADE)
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
