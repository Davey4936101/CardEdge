import { getEbayToken } from './auth'

export interface EbayListing {
  itemId: string
  title: string
  price: number
  imageUrl: string | null
  listingUrl: string
  endTime: string | null
}

export async function searchListings(
  query: string,
  maxPrice?: number
): Promise<EbayListing[]> {
  const token = await getEbayToken()
  const base =
    process.env.EBAY_ENVIRONMENT === 'sandbox'
      ? 'https://api.sandbox.ebay.com'
      : 'https://api.ebay.com'

  const params = new URLSearchParams({
    q: query,
    category_ids: '212',
    sort: 'newlyListed',
    limit: '50',
  })
  if (maxPrice) {
    params.set('filter', `price:[0..${maxPrice}]`)
  }

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

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`eBay Browse API ${res.status}: ${text}`)
  }

  const data = (await res.json()) as {
    itemSummaries?: Array<{
      itemId: string
      title: string
      price: { value: string }
      image?: { imageUrl: string }
      itemWebUrl: string
      itemEndDate?: string
    }>
  }

  return (data.itemSummaries ?? []).map((item) => ({
    itemId: item.itemId,
    title: item.title,
    price: parseFloat(item.price.value),
    imageUrl: item.image?.imageUrl ?? null,
    listingUrl: item.itemWebUrl,
    endTime: item.itemEndDate ?? null,
  }))
}
