// Diagnostic: tests each eBay data source individually with the real credentials
// Run with: node scripts/test-ebay-api.mjs

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY ?? ''
const OPENWEBNINJA_KEY = process.env.OPENWEBNINJA_API_KEY ?? ''
const TEST_QUERY = 'Patrick Mahomes rookie card PSA'

// ── Test 1: Sold Comps API (ebay-average-selling-price) ──────────────────────
async function testSoldComps() {
  console.log('\n=== SOLD COMPS (ebay-average-selling-price) ===')
  if (!RAPIDAPI_KEY) { console.log('⚠️  RAPIDAPI_KEY not set'); return }
  const res = await fetch('https://ebay-average-selling-price.p.rapidapi.com/findCompletedItems', {
    method: 'POST',
    headers: {
      'x-rapidapi-key': RAPIDAPI_KEY,
      'x-rapidapi-host': 'ebay-average-selling-price.p.rapidapi.com',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ keywords: TEST_QUERY, max_search_results: 240, category_id: '212', remove_outliers: true }),
  })
  const data = await res.json()
  const products = data.products ?? []
  console.log(`✅ Status ${res.status} — ${products.length} sold comps returned`)
  if (products.length > 0) {
    const p = products[0]
    console.log('  Sample:', { title: p.title?.slice(0, 50), sale_price: p.sale_price, date_sold: p.date_sold })
  }
}

// ── Test 2: OpenWeb Ninja real-time-ebay-data (live listings) ───────────────
async function testRealTimeEbay() {
  console.log('\n=== LIVE LISTINGS (OpenWeb Ninja real-time-ebay-data) ===')
  if (!OPENWEBNINJA_KEY) {
    console.log('⚠️  OPENWEBNINJA_API_KEY not set — run: OPENWEBNINJA_API_KEY=<key> node scripts/test-ebay-api.mjs')
    return
  }
  const params = new URLSearchParams({ query: TEST_QUERY, limit: '3', country: 'us' })
  const res = await fetch(`https://api.openwebninja.com/real-time-ebay-data/search?${params}`, {
    headers: { 'x-api-key': OPENWEBNINJA_KEY },
  })
  const text = await res.text()
  if (!res.ok) {
    console.log(`❌ ${res.status}:`, text.slice(0, 200))
  } else {
    const data = JSON.parse(text)
    const items = Array.isArray(data) ? data
      : Array.isArray(data.data?.products) ? data.data.products
      : Array.isArray(data.data) ? data.data
      : data.results ?? data.items ?? data.products ?? []
    console.log(`✅ Status ${res.status} — ${items.length} live listings`)
    if (items.length > 0) console.log('  Sample:', JSON.stringify(items[0]).slice(0, 200))
  }
}

// ── Test 3: eBay Browse API (official) ──────────────────────────────────────
async function testEbayBrowse() {
  console.log('\n=== LIVE LISTINGS (eBay Browse API — official) ===')
  const clientId = process.env.EBAY_CLIENT_ID ?? ''
  const clientSecret = process.env.EBAY_CLIENT_SECRET ?? ''
  if (!clientId || clientId === 'your-client-id') {
    console.log('⚠️  EBAY_CLIENT_ID not set — run: EBAY_CLIENT_ID=<id> EBAY_CLIENT_SECRET=<secret> node scripts/test-ebay-api.mjs')
    return
  }
  const tokenRes = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials&scope=https%3A%2F%2Fapi.ebay.com%2Foauth%2Fapi_scope',
  })
  if (!tokenRes.ok) { console.log(`❌ OAuth ${tokenRes.status}:`, await tokenRes.text()); return }
  const { access_token } = await tokenRes.json()
  const params = new URLSearchParams({ q: TEST_QUERY, category_ids: '212', limit: '3', sort: 'newlyListed', filter: 'buyingOptions:{FIXED_PRICE}' })
  const r = await fetch(`https://api.ebay.com/buy/browse/v1/item_summary/search?${params}`, {
    headers: { Authorization: `Bearer ${access_token}`, 'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US' },
  })
  const data = await r.json()
  const items = data.itemSummaries ?? []
  console.log(`✅ Status ${r.status} — ${items.length} live listings`)
  if (items.length > 0) console.log('  Sample:', items[0].title?.slice(0,60), '$' + items[0].price?.value)
}

// ── Test 3b: eBay Finding API (official, sold comps) ────────────────────────
async function testEbayFinding() {
  console.log('\n=== SOLD COMPS (eBay Finding API — official) ===')
  const clientId = process.env.EBAY_CLIENT_ID ?? ''
  if (!clientId || clientId === 'your-client-id') {
    console.log('⚠️  EBAY_CLIENT_ID not set — skipping')
    return
  }
  const params = new URLSearchParams({
    'OPERATION-NAME': 'findCompletedItems',
    'SERVICE-VERSION': '1.0.0',
    'SECURITY-APPNAME': clientId,
    'RESPONSE-DATA-FORMAT': 'JSON',
    'REST-PAYLOAD': '',
    keywords: TEST_QUERY,
    categoryId: '212',
    'itemFilter(0).name': 'SoldItemsOnly',
    'itemFilter(0).value': 'true',
    'paginationInput.entriesPerPage': '5',
  })
  const r = await fetch(`https://svcs.ebay.com/services/search/FindingService/v1?${params}`)
  const data = await r.json()
  const items = data.findCompletedItemsResponse?.[0]?.searchResult?.[0]?.item ?? []
  console.log(`✅ Status ${r.status} — ${items.length} sold comps`)
  if (items.length > 0) {
    const item = items[0]
    console.log('  Sample:', item.title?.[0]?.slice(0,50), '$' + item.sellingStatus?.[0]?.currentPrice?.[0]?.__value__)
  }
}

// ── Test 4: eBay HTML scrape ─────────────────────────────────────────────────
async function testEbayScrape() {
  console.log('\n=== LIVE LISTINGS (eBay HTML scrape — free fallback) ===')
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'identity',
  }
  const homeRes = await fetch('https://www.ebay.com', { headers })
  const cookieStr = (homeRes.headers.get('set-cookie') ?? '').split(',').map(c => c.split(';')[0].trim()).filter(Boolean).join('; ')
  const params = new URLSearchParams({ _nkw: TEST_QUERY, _sacat: '212', _sop: '10', LH_BIN: '1', _ipg: '10' })
  const r = await fetch(`https://www.ebay.com/sch/i.html?${params}`, { headers: { ...headers, Cookie: cookieStr } })
  const html = await r.text()
  const isCaptcha = html.includes('Pardon Our Interruption') || html.length < 50_000
  if (isCaptcha) {
    console.log(`❌ eBay bot-challenge page (${html.length} bytes) — scraping blocked from this IP`)
    console.log('   This may work from your deployment server (varies by IP reputation)')
  } else {
    const itemCount = [...new Set([...html.matchAll(/\/itm\/(\d{10,})/g)].map(m => m[1]))].length
    console.log(`✅ Full eBay page (${html.length} bytes) — ${itemCount} item IDs found`)
  }
}

console.log('CardEdge eBay API Diagnostic')
console.log('============================')
console.log('Tip: set env vars before running, e.g.:')
console.log('  EBAY_CLIENT_ID=xxx EBAY_CLIENT_SECRET=yyy RAPIDAPI_KEY=zzz node scripts/test-ebay-api.mjs')
await testSoldComps()
await testRealTimeEbay()
await testEbayBrowse()
await testEbayFinding()
await testEbayScrape()
console.log('\nDone.')
