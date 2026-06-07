// lib/ebay/rapidapi.ts
import { load } from 'cheerio'
import { isLotListing } from '@/lib/deals/lot-filter'

// Minimum price for a listing to be considered a deal candidate.
// Filters out $0.99 base cards and damaged cards that inflate ROI
// against graded-card comps.
const MIN_LISTING_PRICE = 2

// Auction listings are excluded from deal scanning — starting bid prices are
// not reliable buy signals since the card will likely sell higher.
// A separate bid-alert feature can be added later for auction tracking.
export type BuyingFormat = 'buy_it_now' | 'accepts_offers' | 'auction_with_bin' | 'auction' | 'unknown'

export interface EbayListing {
  itemId: string
  title: string
  price: number
  imageUrl: string | null
  listingUrl: string
  endTime: string | null
  buyingFormat: BuyingFormat
}

export interface SoldComp {
  price: number
  saleDate: Date
}

// ── eBay Browse API (official, free with developer.ebay.com credentials) ─────

let _ebayToken: string | null = null
let _ebayTokenExpiry = 0

export async function getEbayToken(): Promise<string> {
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
      if (!id || !title || !listingUrl || isNaN(price) || price < MIN_LISTING_PRICE) return null
      if (isLotListing(title)) return null
      return { itemId: id, title, price, imageUrl, listingUrl, endTime, buyingFormat: 'buy_it_now' }
    })
    .filter((item): item is EbayListing => {
      if (!item) return false
      if (maxPrice !== undefined && item.price > maxPrice) return false
      return true
    })
}

async function searchListingsEbay(query: string, maxPrice?: number): Promise<EbayListing[]> {
  const token = await getEbayToken()
  const env = process.env.EBAY_ENVIRONMENT === 'sandbox' ? 'api.sandbox' : 'api'

  const params = new URLSearchParams({
    q: query,
    category_ids: '212',
    limit: '50',
    sort: 'newlyListed',
    filter: 'buyingOptions:{FIXED_PRICE}',
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

// ── OpenWeb Ninja: real-time-ebay-data (direct API, no RapidAPI proxy) ────────

async function searchListingsOpenWebNinja(query: string, maxPrice?: number): Promise<EbayListing[]> {
  const apiKey = process.env.OPENWEBNINJA_API_KEY
  if (!apiKey) throw new Error('OPENWEBNINJA_API_KEY not set')

  const params = new URLSearchParams({ query, limit: '50', country: 'us' })
  if (maxPrice) params.set('max_price', String(maxPrice))

  const res = await fetch(
    `https://api.openwebninja.com/real-time-ebay-data/search?${params}`,
    {
      cache: 'no-store',
      headers: { 'x-api-key': apiKey },
    }
  )

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`OpenWebNinja real-time-ebay-data ${res.status}: ${text}`)
  }

  type RawItem = {
    item_id?: string
    id?: string
    title?: string
    price?: number | string
    current_price?: number | string
    url?: string
    link?: string
    image?: string
    thumbnail?: string
    end_time?: string
    end_date?: string
    buying_format?: string
  }

  const raw = (await res.json()) as RawItem[] | { data?: { products?: RawItem[] } | RawItem[]; results?: RawItem[]; items?: RawItem[]; products?: RawItem[] }
  let items: RawItem[]
  if (Array.isArray(raw)) {
    items = raw
  } else if (raw.data && !Array.isArray(raw.data) && Array.isArray(raw.data.products)) {
    items = raw.data.products
  } else if (Array.isArray(raw.data)) {
    items = raw.data
  } else {
    items = (raw as { results?: RawItem[]; items?: RawItem[]; products?: RawItem[] }).results
      ?? (raw as { results?: RawItem[]; items?: RawItem[]; products?: RawItem[] }).items
      ?? (raw as { results?: RawItem[]; items?: RawItem[]; products?: RawItem[] }).products
      ?? []
  }

  return items
    .map((item): EbayListing | null => {
      const id = item.item_id ?? item.id ?? ''
      const title = item.title ?? ''
      const price = parseFloat(String(item.price ?? item.current_price ?? '0'))
      const imageUrl = item.image ?? item.thumbnail ?? null
      const listingUrl = item.url ?? item.link ?? ''
      const endTime = item.end_time ?? item.end_date ?? null
      const buyingFormat = (item.buying_format ?? 'unknown') as BuyingFormat
      if (!id || !title || !listingUrl || isNaN(price) || price < MIN_LISTING_PRICE) return null
      // Exclude auctions (both pure and hybrid) — current bid ≠ final sale price.
      // A separate bid-watch feature handles auction tracking.
      if (buyingFormat === 'auction' || buyingFormat === 'auction_with_bin') return null
      if (isLotListing(title)) return null
      return { itemId: id, title, price, imageUrl, listingUrl, endTime, buyingFormat }
    })
    .filter((item): item is EbayListing => {
      if (!item) return false
      if (maxPrice !== undefined && item.price > maxPrice) return false
      return true
    })
}

// ── eBay HTML Scrape (no credentials needed, free fallback) ──────────────────

const SCRAPE_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept:
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'identity',
}

async function searchListingsScrapeEbay(query: string, maxPrice?: number): Promise<EbayListing[]> {
  try {
    // Step 1: land on homepage to acquire session cookie (eBay WAF requires this)
    const homeRes = await fetch('https://www.ebay.com', {
      headers: SCRAPE_HEADERS,
      signal: AbortSignal.timeout(12000),
    })
    const rawCookies = homeRes.headers.get('set-cookie') ?? ''
    const cookieStr = rawCookies
      .split(',')
      .map((c) => c.split(';')[0].trim())
      .filter(Boolean)
      .join('; ')

    // Step 2: search — BIN (Buy It Now) only, Sports Cards category, newest first
    const params = new URLSearchParams({
      _nkw: query,
      _sacat: '212',
      _sop: '10',    // sort: newly listed
      LH_BIN: '1',  // Buy It Now only
      _ipg: '50',
    })
    if (maxPrice) params.set('_udhi', String(Math.round(maxPrice)))

    const searchRes = await fetch(`https://www.ebay.com/sch/i.html?${params}`, {
      headers: { ...SCRAPE_HEADERS, Cookie: cookieStr },
      signal: AbortSignal.timeout(20000),
    })

    if (!searchRes.ok) {
      console.warn(`[eBay scrape] HTTP ${searchRes.status} — eBay may be blocking server IP`)
      return []
    }

    const html = await searchRes.text()

    // eBay serves a JS challenge page (~14KB) when it detects bots; skip it
    if (html.includes('Pardon Our Interruption') || html.length < 50_000) {
      console.warn('[eBay scrape] Received bot-challenge page — scraping unavailable from this IP')
      return []
    }

    return parseEbaySearchHtml(html, maxPrice)
  } catch (err) {
    console.warn('[eBay scrape] Failed:', err instanceof Error ? err.message : String(err))
    return []
  }
}

function parseEbaySearchHtml(html: string, maxPrice?: number): EbayListing[] {
  const $ = load(html)
  const results: EbayListing[] = []
  const seen = new Set<string>()

  // ── Strategy A: newer "s-card" layout (data-listingid attribute) ───────────
  $('[data-listingid]').each((_, el) => {
    const container = $(el)
    const itemId = container.attr('data-listingid') ?? ''
    if (!itemId || seen.has(itemId)) return

    const linkEl = container.find('a[href*="/itm/"]').first()
    const rawUrl = linkEl.attr('href') ?? ''
    // Strip eBay tracking params but keep the clean item URL
    const listingUrl = rawUrl ? `https://www.ebay.com/itm/${itemId}` : ''

    const title = container
      .find('[class*="title"], [class*="item-title"], h3')
      .first()
      .text()
      .replace(/^New Listing\s*/i, '')
      .trim()

    const priceText = container.find('[class*="price"]').first().text()
    const price = parsePrice(priceText)

    const imageUrl =
      container.find('img[src*="ebayimg"]').first().attr('src') ??
      container.find('img').first().attr('src') ??
      null

    if (!listingUrl || !title || price < MIN_LISTING_PRICE) return
    if (maxPrice !== undefined && price > maxPrice) return
    if (isLotListing(title)) return

    seen.add(itemId)
    results.push({ itemId, title, price, imageUrl: imageUrl ?? null, listingUrl, endTime: null, buyingFormat: 'buy_it_now' })
  })

  // ── Strategy B: classic "s-item" layout (li.s-item) ──────────────────────
  if (results.length === 0) {
    $('li.s-item, li[class*="s-item"]').each((_, el) => {
      const container = $(el)

      const linkEl = container.find('a.s-item__link, a[href*="/itm/"]').first()
      const rawUrl = linkEl.attr('href') ?? ''
      const itemIdMatch = rawUrl.match(/\/itm\/(\d+)/)
      const itemId = itemIdMatch?.[1] ?? ''
      if (!itemId || seen.has(itemId)) return

      const listingUrl = `https://www.ebay.com/itm/${itemId}`

      const title = container
        .find('.s-item__title')
        .first()
        .text()
        .replace(/^New Listing\s*/i, '')
        .trim()

      const priceText = container.find('.s-item__price').first().text()
      const price = parsePrice(priceText)

      const imageUrl =
        container.find('img[src*="ebayimg"]').first().attr('src') ?? null

      if (!title || price < MIN_LISTING_PRICE) return
      if (maxPrice !== undefined && price > maxPrice) return
      if (isLotListing(title)) return

      seen.add(itemId)
      results.push({ itemId, title, price, imageUrl, listingUrl, endTime: null, buyingFormat: 'buy_it_now' })
    })
  }

  // ── Strategy C: extract from raw href + nearby text when DOM parsing fails ─
  if (results.length === 0) {
    const itemMatches = [...html.matchAll(/\/itm\/(\d{10,})/g)]
    const uniqueIds = [...new Set(itemMatches.map((m) => m[1]))]

    for (const itemId of uniqueIds.slice(0, 50)) {
      if (seen.has(itemId)) continue
      const idx = html.indexOf(`/itm/${itemId}`)
      const block = html.slice(Math.max(0, idx - 800), idx + 1200)

      // Extract price from block
      const priceMatch = block.match(/\$\s*([\d,]+\.?\d{0,2})/)
      if (!priceMatch) continue
      const price = parseFloat(priceMatch[1].replace(/,/g, ''))
      if (price < MIN_LISTING_PRICE) continue
      if (maxPrice !== undefined && price > maxPrice) continue

      // Extract title: look for a title-like string near the item ID
      const titleMatch = block.match(/"(?:title|s-item__title|item-title)"[^>]*>([^<]{10,150})/)
      const title = titleMatch?.[1].replace(/^New Listing\s*/i, '').trim() ?? ''
      if (!title || isLotListing(title)) continue

      // Extract image
      const imgMatch = block.match(/src="(https:\/\/[a-z0-9]+\.ebayimg\.com\/[^"]+)"/)
      const imageUrl = imgMatch?.[1] ?? null

      seen.add(itemId)
      results.push({
        itemId,
        title,
        price,
        imageUrl,
        listingUrl: `https://www.ebay.com/itm/${itemId}`,
        endTime: null,
        buyingFormat: 'buy_it_now',
      })
    }
  }

  return results
}

function parsePrice(text: string): number {
  // Handle ranges like "$50.00 to $150.00" — take the lower bound
  const match = text.match(/([\d,]+\.?\d{0,2})/)
  if (!match) return 0
  return parseFloat(match[1].replace(/,/g, ''))
}

// ── Public entry point ────────────────────────────────────────────────────────

export async function searchListings(
  query: string,
  maxPrice?: number
): Promise<EbayListing[]> {
  const clientId = process.env.EBAY_CLIENT_ID
  const clientSecret = process.env.EBAY_CLIENT_SECRET
  const hasEbayCreds =
    clientId &&
    clientSecret &&
    clientId !== 'your-client-id' &&
    clientSecret !== 'your-client-secret'

  // 1. Official eBay Browse API (best — free at developer.ebay.com)
  if (hasEbayCreds) {
    try {
      const listings = await searchListingsEbay(query, maxPrice)
      if (listings.length > 0) return listings
    } catch (err) {
      console.warn('[eBay Browse API] Failed:', err instanceof Error ? err.message : String(err))
    }
  }

  // 2. OpenWeb Ninja real-time-ebay-data (direct API, add OPENWEBNINJA_API_KEY to .env.local)
  if (process.env.OPENWEBNINJA_API_KEY) {
    try {
      const listings = await searchListingsOpenWebNinja(query, maxPrice)
      if (listings.length > 0) return listings
    } catch (err) {
      console.warn('[OpenWebNinja] Failed:', err instanceof Error ? err.message : String(err))
    }
  }

  // 3. Direct eBay HTML scrape (free, no credentials, may be blocked on some IPs)
  const listings = await searchListingsScrapeEbay(query, maxPrice)
  if (listings.length > 0) return listings

  console.warn(
    '[searchListings] All methods returned 0 results for query:', query,
    '— To fix: add real EBAY_CLIENT_ID + EBAY_CLIENT_SECRET from developer.ebay.com (free registration)'
  )
  return []
}

// ── Sold comps ────────────────────────────────────────────────────────────────

function parseEbayDate(raw: string): Date {
  const d = new Date(raw)
  return isNaN(d.getTime()) ? new Date() : d
}

// IQR-based outlier removal — matches the `remove_outliers: true` behaviour
// that RapidAPI applied on our behalf.
function removeOutliers(comps: SoldComp[]): SoldComp[] {
  if (comps.length < 4) return comps
  const sorted = [...comps].sort((a, b) => a.price - b.price)
  const q1 = sorted[Math.floor(sorted.length * 0.25)].price
  const q3 = sorted[Math.floor(sorted.length * 0.75)].price
  const iqr = q3 - q1
  const lo = q1 - 1.5 * iqr
  const hi = q3 + 1.5 * iqr
  return comps.filter((c) => c.price >= lo && c.price <= hi)
}

// eBay Finding API — findCompletedItems (free with any developer account)
// Uses only EBAY_CLIENT_ID (App ID); no OAuth token needed.
async function fetchSoldCompsEbay(keywords: string): Promise<SoldComp[]> {
  const appId = process.env.EBAY_CLIENT_ID
  if (!appId || appId === 'your-client-id') throw new Error('EBAY_CLIENT_ID not set')

  const params = new URLSearchParams({
    'OPERATION-NAME': 'findCompletedItems',
    'SERVICE-VERSION': '1.0.0',
    'SECURITY-APPNAME': appId,
    'RESPONSE-DATA-FORMAT': 'JSON',
    'REST-PAYLOAD': '',
    keywords,
    categoryId: '212',
    'itemFilter(0).name': 'SoldItemsOnly',
    'itemFilter(0).value': 'true',
    'sortOrder': 'EndTimeSoonest',
    'paginationInput.entriesPerPage': '100',
  })

  const res = await fetch(
    `https://svcs.ebay.com/services/search/FindingService/v1?${params}`,
    { cache: 'no-store', signal: AbortSignal.timeout(10_000) }
  )

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`eBay Finding API ${res.status}: ${text}`)
  }

  type FindingItem = {
    listingInfo?: [{ endTime?: [string] }]
    sellingStatus?: [{ currentPrice?: [{ __value__?: string }]; sellingState?: [string] }]
  }

  const data = (await res.json()) as {
    findCompletedItemsResponse?: [{
      ack?: [string]
      searchResult?: [{ item?: FindingItem[] }]
    }]
  }

  const response = data.findCompletedItemsResponse?.[0]
  if (response?.ack?.[0] !== 'Success') {
    const errMsg = (response as Record<string, unknown>)?.errorMessage
    throw new Error(`eBay Finding API non-success ack: ${JSON.stringify(errMsg ?? response)}`)
  }

  const items = response.searchResult?.[0]?.item ?? []

  const comps = items
    .map((item): SoldComp | null => {
      const state = item.sellingStatus?.[0]?.sellingState?.[0] ?? ''
      if (!state.toLowerCase().includes('sales')) return null  // skip unsold
      const priceStr = item.sellingStatus?.[0]?.currentPrice?.[0]?.__value__ ?? ''
      const price = parseFloat(priceStr)
      const dateStr = item.listingInfo?.[0]?.endTime?.[0] ?? ''
      const saleDate = parseEbayDate(dateStr)
      if (price <= 0 || isNaN(price)) return null
      return { price, saleDate }
    })
    .filter((c): c is SoldComp => c !== null)

  return removeOutliers(comps)
}

export async function fetchSoldComps(keywords: string): Promise<SoldComp[]> {
  return fetchSoldCompsEbay(keywords)
}

// ── Single auction item lookup (for Bid Watch feature) ────────────────────────

export interface AuctionItemDetails {
  itemId: string
  title: string
  currentBid: number | null
  binPrice: number | null
  imageUrl: string | null
  listingUrl: string
  endTime: string | null
  buyingFormat: BuyingFormat
  isEnded: boolean
}

async function fetchAuctionItemBrowseApi(itemId: string): Promise<AuctionItemDetails | null> {
  const token = await getEbayToken()
  const env = process.env.EBAY_ENVIRONMENT === 'sandbox' ? 'api.sandbox' : 'api'

  const encodedId = encodeURIComponent(`v1|${itemId}|0`)
  const res = await fetch(
    `https://${env}.ebay.com/buy/browse/v1/item/${encodedId}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US',
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
    }
  )

  if (!res.ok) return null

  type BrowseItemDetail = {
    itemId?: string
    title?: string
    price?: { value?: string }
    currentBidPrice?: { value?: string }
    buyItNowPrice?: { value?: string }
    image?: { imageUrl?: string }
    itemWebUrl?: string
    itemEndDate?: string
    buyingOptions?: string[]
    itemAffiliateWebUrl?: string
  }

  const data = (await res.json()) as BrowseItemDetail
  const buyingOptions = data.buyingOptions ?? []
  const hasAuction = buyingOptions.includes('AUCTION')
  const hasBin = buyingOptions.includes('FIXED_PRICE')

  const currentBid = data.currentBidPrice?.value
    ? parseFloat(data.currentBidPrice.value)
    : data.price?.value && hasAuction
    ? parseFloat(data.price.value)
    : null

  const binPrice = data.buyItNowPrice?.value
    ? parseFloat(data.buyItNowPrice.value)
    : hasBin && !hasAuction && data.price?.value
    ? parseFloat(data.price.value)
    : null

  let buyingFormat: BuyingFormat = 'unknown'
  if (hasAuction && hasBin) buyingFormat = 'auction_with_bin'
  else if (hasAuction) buyingFormat = 'auction'
  else if (hasBin) buyingFormat = 'buy_it_now'

  const endTime = data.itemEndDate ?? null
  const isEnded = endTime ? new Date(endTime).getTime() < Date.now() : false

  return {
    itemId,
    title: data.title ?? '',
    currentBid: currentBid && !isNaN(currentBid) ? currentBid : null,
    binPrice: binPrice && !isNaN(binPrice) ? binPrice : null,
    imageUrl: data.image?.imageUrl ?? null,
    listingUrl: data.itemWebUrl ?? `https://www.ebay.com/itm/${itemId}`,
    endTime,
    buyingFormat,
    isEnded,
  }
}

async function fetchAuctionItemScrape(itemId: string): Promise<AuctionItemDetails | null> {
  try {
    const res = await fetch(`https://www.ebay.com/itm/${itemId}`, {
      headers: SCRAPE_HEADERS,
      signal: AbortSignal.timeout(15000),
    })

    if (!res.ok) return null
    const html = await res.text()

    if (html.includes('Pardon Our Interruption') || html.length < 10_000) return null

    const $ = load(html)

    // Try JSON+LD first — eBay embeds product schema on item pages
    let title = ''
    let ldPrice: number | null = null
    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        const data = JSON.parse($(el).html() ?? '') as { '@type'?: string; name?: string; offers?: { price?: string | number } }
        if (data.name) title = title || String(data.name)
        if (data.offers?.price) ldPrice = parseFloat(String(data.offers.price))
      } catch { /* skip malformed blocks */ }
    })

    // Fallback title from heading
    if (!title)
      title = $('h1.x-item-title__mainTitle, h1[itemprop="name"], #itemTitle')
        .first()
        .text()
        .replace(/^New Listing\s*/i, '')
        .trim()

    if (!title) return null

    // Price extraction
    const priceRaw = $('.x-price-primary, #prcIsum, #mm-saleDscPrc, .display-price').first().text()
    const domPrice = priceRaw ? parsePrice(priceRaw) : null
    const resolvedPrice = ldPrice ?? domPrice

    // BIN price
    const binRaw = $('#binPrice, .bin-price').first().text()
    const binPrice = binRaw ? parsePrice(binRaw) || null : null

    // End time
    const endTime =
      $('time[itemprop="availabilityEnds"]').first().attr('datetime') ??
      $('[class*="timer"] time').first().attr('datetime') ??
      null

    // Image
    const imageUrl =
      $('img#icImg').first().attr('src') ??
      $('img[data-zoom-src]').first().attr('data-zoom-src') ??
      $('[class*="image-carousel"] img').first().attr('src') ??
      null

    // Determine format from page signals
    const isAuction = html.includes('Current bid') || html.includes('Place bid') || $('#bidCount, .vi-bidder-info').length > 0
    const hasBinSignal = !!binPrice || html.includes('Buy It Now')

    let buyingFormat: BuyingFormat = 'unknown'
    if (isAuction && hasBinSignal) buyingFormat = 'auction_with_bin'
    else if (isAuction) buyingFormat = 'auction'
    else if (hasBinSignal || resolvedPrice) buyingFormat = 'buy_it_now'

    const isEnded = endTime ? new Date(endTime).getTime() < Date.now() : false

    return {
      itemId,
      title,
      currentBid: isAuction && resolvedPrice ? resolvedPrice : null,
      binPrice: binPrice ?? (!isAuction && resolvedPrice ? resolvedPrice : null),
      imageUrl: imageUrl ?? null,
      listingUrl: `https://www.ebay.com/itm/${itemId}`,
      endTime,
      buyingFormat,
      isEnded,
    }
  } catch {
    return null
  }
}

export async function fetchAuctionItem(itemId: string): Promise<AuctionItemDetails | null> {
  const clientId = process.env.EBAY_CLIENT_ID
  const clientSecret = process.env.EBAY_CLIENT_SECRET
  const hasEbayCreds =
    clientId &&
    clientSecret &&
    clientId !== 'your-client-id' &&
    clientSecret !== 'your-client-secret'

  if (hasEbayCreds) {
    try {
      const result = await fetchAuctionItemBrowseApi(itemId)
      if (result) return result
    } catch {
      // fall through to scraping
    }
  }

  return fetchAuctionItemScrape(itemId)
}
