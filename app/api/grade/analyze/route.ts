// app/api/grade/analyze/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { inngest } from '@/inngest/client'

export async function POST(req: NextRequest) {
  const body = (await req.json()) as {
    imageUrls: string[]
    rawPrice: number
    mode: 'ebay' | 'personal'
    ebayItemId?: string
    ebayListingTitle?: string
  }

  if (!body.imageUrls?.length || !body.rawPrice || !body.mode) {
    return NextResponse.json({ error: 'imageUrls, rawPrice, and mode are required' }, { status: 400 })
  }

  const supabase = createServerClient()

  const { data, error } = await supabase
    .from('grade_analyses')
    .insert({
      card_key: 'pending',
      mode: body.mode,
      status: 'pending',
      ebay_item_id: body.ebayItemId,
      image_urls: body.imageUrls,
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
      imageUrls: body.imageUrls,
      rawPrice: body.rawPrice,
      mode: body.mode,
      ebayListingTitle: body.ebayListingTitle,
    },
  })

  return NextResponse.json({ analysisId: data.id })
}
