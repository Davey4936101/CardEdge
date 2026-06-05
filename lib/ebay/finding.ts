export interface SoldComp {
  price: number
  saleDate: Date
}

export async function fetchSoldComps(keywords: string): Promise<SoldComp[]> {
  const base =
    process.env.EBAY_ENVIRONMENT === 'sandbox'
      ? 'https://svcs.sandbox.ebay.com'
      : 'https://svcs.ebay.com'

  const ninetyDaysAgo = new Date()
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)

  const params = new URLSearchParams()
  params.set('OPERATION-NAME', 'findCompletedItems')
  params.set('SERVICE-VERSION', '1.0.0')
  params.set('SECURITY-APPNAME', process.env.EBAY_CLIENT_ID!)
  params.set('RESPONSE-DATA-FORMAT', 'JSON')
  params.set('REST-PAYLOAD', 'true')
  params.set('keywords', keywords)
  params.set('categoryId', '212')
  params.set('itemFilter(0).name', 'SoldItemsOnly')
  params.set('itemFilter(0).value', 'true')
  params.set('itemFilter(1).name', 'TimeFrom')
  params.set('itemFilter(1).value', ninetyDaysAgo.toISOString())
  params.set('paginationInput.entriesPerPage', '100')

  const res = await fetch(
    `${base}/services/search/FindingService/v1?${params}`
  )

  if (!res.ok) {
    throw new Error(`eBay Finding API ${res.status}`)
  }

  type FindingItem = {
    sellingStatus: Array<{
      currentPrice: Array<{ __value__: string }>
      endTime: string[]
    }>
  }

  const data = (await res.json()) as {
    findCompletedItemsResponse?: Array<{
      searchResult?: Array<{ item?: FindingItem[] }>
    }>
  }

  const items =
    data.findCompletedItemsResponse?.[0]?.searchResult?.[0]?.item ?? []

  return items
    .filter(
      (item) => item.sellingStatus?.[0]?.currentPrice?.[0]?.__value__
    )
    .map((item) => ({
      price: parseFloat(item.sellingStatus[0].currentPrice[0].__value__),
      saleDate: new Date(item.sellingStatus[0].endTime[0]),
    }))
}
