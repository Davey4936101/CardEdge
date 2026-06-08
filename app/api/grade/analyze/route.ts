// app/api/grade/analyze/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { getUserFromRequest } from '@/lib/auth'
import { inngest } from '@/inngest/client'
import type { CardImageManifest } from '@/lib/grade/types'

export async function POST(req: NextRequest) {
  const userId = await getUserFromRequest(req)
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await req.json()) as {
    manifest?: CardImageManifest        // personal mode — structured 10-photo set
    imageUrls?: string[]               // eBay mode — unstructured
    rawPrice: number
    mode: 'ebay' | 'personal'
    ebayItemId?: string
    ebayListingTitle?: string
  }

  const hasImages = (body.manifest && Object.keys(body.manifest).length > 0) || body.imageUrls?.length
  if (!hasImages || !body.rawPrice || !body.mode) {
    return NextResponse.json({ error: 'images (manifest or imageUrls), rawPrice, and mode are required' }, { status: 400 })
  }

  const supabase = createServerClient()

  const allImageUrls = body.manifest
    ? Object.values(body.manifest)
    : (body.imageUrls ?? [])

  const { data, error } = await supabase
    .from('grade_analyses')
    .insert({
      card_key: 'pending',
      mode: body.mode,
      status: 'pending',
      user_id: userId,
      ebay_item_id: body.ebayItemId,
      image_urls: allImageUrls,
      image_manifest: body.manifest ?? null,
      raw_price: body.rawPrice,
    })
    .select('id')
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'Failed to create analysis record' }, { status: 500 })
  }

  await inngest.send({
    name: 'grade/analyze.requested',
    data: {
      analysisId: data.id,
      manifest: body.manifest,
      imageUrls: body.imageUrls,
      rawPrice: body.rawPrice,
      mode: body.mode,
      ebayListingTitle: body.ebayListingTitle,
    },
  })

  return NextResponse.json({ analysisId: data.id })
}
