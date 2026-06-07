// app/api/grade/ebay-images/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getEbayToken } from '@/lib/ebay/rapidapi'
import { getUserFromRequest } from '@/lib/auth'

export async function GET(req: NextRequest) {
  const userId = await getUserFromRequest(req)
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = req.nextUrl.searchParams.get('url')
  if (!url) return NextResponse.json({ error: 'url is required' }, { status: 400 })

  // Extract eBay item ID from URL
  // Formats: /itm/title/123456789012 or /itm/123456789012
  const match = url.match(/\/itm\/(?:[^/]+\/)?(\d+)/)
  if (!match) return NextResponse.json({ error: 'Invalid eBay URL' }, { status: 400 })

  const itemId = match[1]
  const token = await getEbayToken()
  const base =
    process.env.EBAY_ENVIRONMENT === 'sandbox'
      ? 'https://api.sandbox.ebay.com'
      : 'https://api.ebay.com'

  const res = await fetch(`${base}/buy/browse/v1/item/v1|${itemId}|0`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US',
      'X-EBAY-C-ENDUSERCTX': 'contextualLocation=country=US',
    },
  })

  if (!res.ok) {
    return NextResponse.json({ error: 'eBay item not found' }, { status: 404 })
  }

  const data = (await res.json()) as {
    itemId: string
    title: string
    price?: { value: string }
    image?: { imageUrl: string }
    additionalImages?: Array<{ imageUrl: string }>
  }

  const images = [
    data.image?.imageUrl,
    ...(data.additionalImages ?? []).map((i) => i.imageUrl),
  ].filter(Boolean) as string[]

  return NextResponse.json({
    itemId: data.itemId,
    title: data.title,
    price: data.price?.value ? parseFloat(data.price.value) : null,
    imageUrls: images,
  })
}
