// lib/ebay/rapidapi.ts
export interface EbayListing {
  itemId: string
  title: string
  price: number
  imageUrl: string | null
  listingUrl: string
  endTime: string | null
}

export interface SoldComp {
  price: number
  saleDate: Date
}

function rapidApiHeaders(host: string) {
  const key = process.env.RAPIDAPI_KEY
  if (!key) throw new Error('RAPIDAPI_KEY env var is not set')
  return {
    'x-rapidapi-key': key,
    'x-rapidapi-host': host,
    'Content-Type': 'application/json',
  }
}

// Real-Time eBay Data (OpenWeb Ninja) — active listings
// Host: real-time-ebay-data.p.rapidapi.com
export async function searchListings(
  query: string,
  maxPrice?: number
): Promise<EbayListing[]> {
  const params = new URLSearchParams({
    keywords: query,
    category_id: '212',
    sort_by: 'newlyListed',
    limit: '50',
  })

  const res = await fetch(
    `https://real-time-ebay-data.p.rapidapi.com/search-products?${params}`,
    {
      cache: 'no-store',
      headers: rapidApiHeaders('real-time-ebay-data.p.rapidapi.com'),
    }
  )

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`RapidAPI search ${res.status}: ${text}`)
  }

  // Defensive field mapping — covers multiple possible response shapes
  type RawItem = {
    item_id?: string
    itemId?: string
    title?: string
    product_title?: string
    price?: number | string | { value?: string }
    product_price?: number | string
    image?: string | { imageUrl?: string }
    image_url?: string
    product_image?: string
    url?: string
    itemWebUrl?: string
    product_url?: string
    end_time?: string
    auction_end_date?: string
    itemEndDate?: string
  }

  const data = (await res.json()) as {
    products?: RawItem[]
    searchResults?: RawItem[]
    items?: RawItem[]
    itemSummaries?: RawItem[]
  }

  const items =
    data.products ??
    data.searchResults ??
    data.items ??
    data.itemSummaries ??
    []

  return items
    .map((item): EbayListing | null => {
      const id = item.item_id ?? item.itemId ?? ''
      const title = item.title ?? item.product_title ?? ''
      const rawPrice =
        item.product_price ??
        (typeof item.price === 'object' ? item.price?.value : item.price)
      const price = parseFloat(String(rawPrice ?? '0'))
      const imageUrl =
        typeof item.image === 'string'
          ? item.image
          : item.image?.imageUrl ??
            item.image_url ??
            item.product_image ??
            null
      const listingUrl = item.url ?? item.itemWebUrl ?? item.product_url ?? ''
      const endTime =
        item.end_time ?? item.auction_end_date ?? item.itemEndDate ?? null

      if (!id || !title || !listingUrl || isNaN(price) || price <= 0) return null

      return { itemId: id, title, price, imageUrl, listingUrl, endTime }
    })
    .filter((item): item is EbayListing => {
      if (item === null) return false
      if (maxPrice !== undefined && item.price > maxPrice) return false
      return true
    })
}

// eBay Average Selling Price (Colin Daniels) — sold comps
// Host: ebay-average-selling-price.p.rapidapi.com
export async function fetchSoldComps(keywords: string): Promise<SoldComp[]> {
  const res = await fetch(
    'https://ebay-average-selling-price.p.rapidapi.com/findCompletedItems',
    {
      method: 'POST',
      cache: 'no-store',
      headers: rapidApiHeaders('ebay-average-selling-price.p.rapidapi.com'),
      body: JSON.stringify({
        keywords,
        max_search_results: '240',
        category_id: '212',
        remove_outliers: true,
      }),
    }
  )

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`RapidAPI sold comps ${res.status}: ${text}`)
  }

  type RawProduct = {
    sold_price?: number | string
    price?: number | string
    date_sold?: string
    end_date?: string
    sold_date?: string
  }

  const data = (await res.json()) as { products?: RawProduct[] }

  return (data.products ?? [])
    .filter((p): boolean => {
      const dateSold = p.date_sold ?? p.end_date ?? p.sold_date
      return Boolean(dateSold)
    })
    .map((p): SoldComp => ({
      price: parseFloat(String(p.sold_price ?? p.price ?? '0')),
      saleDate: new Date(p.date_sold ?? p.end_date ?? p.sold_date ?? ''),
    }))
    .filter((c) => c.price > 0 && !isNaN(c.saleDate.getTime()))
}
