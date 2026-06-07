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

// ── eBay Browse API (official, free) ────────────────────────────────────────

let _ebayToken: string | null = null
let _ebayTokenExpiry = 0

async function getEbayToken(): Promise<string> {
  if (_ebayToken && Date.now() < _ebayTokenExpiry) return _ebayToken

  const clientId = process.env.EBAY_CLIENT_ID
  const clientSecret = process.env.EBAY_CLIENT_SECRET
  if (!clientId || !clientSecret) throw new Error('EBAY_CLIENT_ID / EBAY_CLIENT_SECRET not set')

  const env = process.env.EBAY_ENVIRONMENT === 'sandbox' ? 'sandbox' : 'api'
  const res = await fetch(`https://${env}.ebay.com/identity/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials&scope=https%3A%2F%2Fapi.ebay.com%2Foauth%2Fapi_scope',
    cache: 'no-store',
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`eBay OAuth ${res.status}: ${text}`)
  }

  const { access_token, expires_in } = (await res.json()) as {
    access_token: string
    expires_in: number
  }

  _ebayToken = access_token
  _ebayTokenExpiry = Date.now() + (expires_in - 60) * 1000
  return access_token
}

type BrowseItem = {
  itemId?: string
  title?: string
  price?: { value?: string }
  image?: { imageUrl?: string }
  itemWebUrl?: string
  itemEndDate?: string
}

function parseBrowseItems(items: BrowseItem[], maxPrice?: number): EbayListing[] {
  return items
    .map((item): EbayListing | null => {
      const id = item.itemId ?? ''
      const title = item.title ?? ''
      const price = parseFloat(item.price?.value ?? '0')
      const imageUrl = item.image?.imageUrl ?? null
      const listingUrl = item.itemWebUrl ?? ''
      const endTime = item.itemEndDate ?? null
      if (!id || !title || !listingUrl || isNaN(price) || price <= 0) return null
      return { itemId: id, title, price, imageUrl, listingUrl, endTime }
    })
    .filter((item): item is EbayListing => {
      if (!item) return false
      if (maxPrice !== undefined && item.price > maxPrice) return false
      return true
    })
}

// Active eBay listings — tries eBay Browse API first, falls back to RapidAPI
export async function searchListings(
  query: string,
  maxPrice?: number
): Promise<EbayListing[]> {
  const clientId = process.env.EBAY_CLIENT_ID
  const clientSecret = process.env.EBAY_CLIENT_SECRET
  const hasEbayCredentials =
    clientId && clientSecret &&
    clientId !== 'your-client-id' &&
    clientSecret !== 'your-client-secret'

  if (hasEbayCredentials) {
    return searchListingsEbay(query, maxPrice)
  }
  return searchListingsRapidApi(query, maxPrice)
}

async function searchListingsEbay(query: string, maxPrice?: number): Promise<EbayListing[]> {
  const token = await getEbayToken()
  const env = process.env.EBAY_ENVIRONMENT === 'sandbox' ? 'api.sandbox' : 'api'

  const params = new URLSearchParams({
    q: query,
    category_ids: '212',
    limit: '50',
    sort: 'newlyListed',
  })
  if (maxPrice) params.set('price', `[..${maxPrice}]`)

  const res = await fetch(
    `https://${env}.ebay.com/buy/browse/v1/item_summary/search?${params}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US',
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
    }
  )

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`eBay Browse API ${res.status}: ${text}`)
  }

  const data = (await res.json()) as { itemSummaries?: BrowseItem[] }
  return parseBrowseItems(data.itemSummaries ?? [], maxPrice)
}

async function searchListingsRapidApi(query: string, maxPrice?: number): Promise<EbayListing[]> {
  const rapidKey = process.env.RAPIDAPI_KEY
  if (!rapidKey || rapidKey === 'your_rapidapi_key_here') {
    throw new Error('No eBay credentials configured. Set EBAY_CLIENT_ID/EBAY_CLIENT_SECRET or subscribe to real-time-ebay-data on RapidAPI.')
  }

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
      headers: {
        'x-rapidapi-key': rapidKey,
        'x-rapidapi-host': 'real-time-ebay-data.p.rapidapi.com',
        'Content-Type': 'application/json',
      },
    }
  )

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`RapidAPI search ${res.status}: ${text}`)
  }

  type RawItem = {
    item_id?: string; itemId?: string
    title?: string; product_title?: string
    price?: number | string | { value?: string }
    product_price?: number | string
    image?: string | { imageUrl?: string }
    image_url?: string; product_image?: string
    url?: string; itemWebUrl?: string; product_url?: string
    end_time?: string; auction_end_date?: string; itemEndDate?: string
  }

  const data = (await res.json()) as {
    products?: RawItem[]; searchResults?: RawItem[]
    items?: RawItem[]; itemSummaries?: RawItem[]
  }
  const raw = data.products ?? data.searchResults ?? data.items ?? data.itemSummaries ?? []

  return raw
    .map((item): EbayListing | null => {
      const id = item.item_id ?? item.itemId ?? ''
      const title = item.title ?? item.product_title ?? ''
      const rawPrice = item.product_price ?? (typeof item.price === 'object' ? item.price?.value : item.price)
      const price = parseFloat(String(rawPrice ?? '0'))
      const imageUrl = typeof item.image === 'string'
        ? item.image
        : item.image?.imageUrl ?? item.image_url ?? item.product_image ?? null
      const listingUrl = item.url ?? item.itemWebUrl ?? item.product_url ?? ''
      const endTime = item.end_time ?? item.auction_end_date ?? item.itemEndDate ?? null
      if (!id || !title || !listingUrl || isNaN(price) || price <= 0) return null
      return { itemId: id, title, price, imageUrl, listingUrl, endTime }
    })
    .filter((item): item is EbayListing => {
      if (!item) return false
      if (maxPrice !== undefined && item.price > maxPrice) return false
      return true
    })
}

// ── RapidAPI: eBay Average Selling Price (sold comps) ────────────────────────

function rapidApiHeaders(host: string) {
  const key = process.env.RAPIDAPI_KEY
  if (!key) throw new Error('RAPIDAPI_KEY env var is not set')
  return {
    'x-rapidapi-key': key,
    'x-rapidapi-host': host,
    'Content-Type': 'application/json',
  }
}

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
    sale_price?: number | string  // primary field name returned by this API
    sold_price?: number | string  // legacy fallback
    price?: number | string
    date_sold?: string
    end_date?: string
    sold_date?: string
  }

  const data = (await res.json()) as { products?: RawProduct[] }

  return (data.products ?? [])
    .map((p): SoldComp | null => {
      const rawPrice = p.sale_price ?? p.sold_price ?? p.price
      const price = parseFloat(String(rawPrice ?? '0'))
      const rawDate = p.date_sold ?? p.end_date ?? p.sold_date ?? ''
      const saleDate = new Date(rawDate)
      if (price <= 0 || isNaN(saleDate.getTime())) return null
      return { price, saleDate }
    })
    .filter((c): c is SoldComp => c !== null)
}
