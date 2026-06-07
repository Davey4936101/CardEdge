import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { getUserFromRequest } from '@/lib/auth'
import { fetchAuctionItem, fetchSoldComps } from '@/lib/ebay/rapidapi'
import { calculateFairValue } from '@/lib/fair-value'

// GET /api/deals/bid-watch — list user's watched auctions
export async function GET(req: Request) {
  const userId = await getUserFromRequest(req)
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('bid_watches')
    .select('*')
    .eq('user_id', userId)
    .order('end_time', { ascending: true, nullsFirst: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// POST /api/deals/bid-watch — add a watched auction by eBay URL or item ID
export async function POST(req: Request) {
  const userId = await getUserFromRequest(req)
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { url } = (await req.json().catch(() => ({}))) as { url?: string }
  if (!url) return NextResponse.json({ error: 'url required' }, { status: 400 })

  // Extract numeric item ID from URL like https://www.ebay.com/itm/123456789...
  const match = url.match(/\/itm\/(\d{8,})/)
  if (!match) return NextResponse.json({ error: 'Could not extract eBay item ID from URL' }, { status: 400 })
  const itemId = match[1]

  // Fetch listing details from eBay
  const item = await fetchAuctionItem(itemId)
  if (!item) return NextResponse.json({ error: 'Could not fetch listing from eBay — check URL and try again' }, { status: 422 })
  if (item.buyingFormat !== 'auction' && item.buyingFormat !== 'auction_with_bin') {
    return NextResponse.json({ error: 'This is a Buy It Now listing — use the Deal Discovery feed to track it instead' }, { status: 422 })
  }

  // Compute fair value from sold comps
  let fairValue: number | null = null
  try {
    const comps = await fetchSoldComps(item.title)
    if (comps.length >= 3) {
      const fv = calculateFairValue(comps)
      if (fv) fairValue = Math.round(fv.fairValue * 100) / 100
    }
  } catch {
    // Non-fatal — store without fair value
  }

  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('bid_watches')
    .upsert(
      {
        user_id: userId,
        ebay_item_id: itemId,
        card_title: item.title,
        image_url: item.imageUrl,
        listing_url: item.listingUrl,
        current_bid: item.currentBid,
        bin_price: item.binPrice,
        fair_value: fairValue,
        end_time: item.endTime,
        buying_format: item.buyingFormat,
        is_ended: item.isEnded,
        last_refreshed: new Date().toISOString(),
      },
      { onConflict: 'user_id,ebay_item_id' }
    )
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
