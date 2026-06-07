import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { getUserFromRequest } from '@/lib/auth'
import { fetchAuctionItem } from '@/lib/ebay/rapidapi'

// DELETE /api/deals/bid-watch/[id] — remove a watched auction
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getUserFromRequest(req)
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const supabase = createServerClient()
  const { error } = await supabase
    .from('bid_watches')
    .delete()
    .eq('id', id)
    .eq('user_id', userId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return new NextResponse(null, { status: 204 })
}

// PATCH /api/deals/bid-watch/[id] — refresh bid price from eBay
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getUserFromRequest(req)
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const supabase = createServerClient()

  const { data: watch, error: fetchErr } = await supabase
    .from('bid_watches')
    .select('ebay_item_id')
    .eq('id', id)
    .eq('user_id', userId)
    .single()

  if (fetchErr || !watch) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const item = await fetchAuctionItem(watch.ebay_item_id)
  if (!item) return NextResponse.json({ error: 'Could not refresh from eBay' }, { status: 422 })

  const { data, error } = await supabase
    .from('bid_watches')
    .update({
      current_bid: item.currentBid,
      bin_price: item.binPrice,
      end_time: item.endTime,
      is_ended: item.isEnded,
      last_refreshed: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('user_id', userId)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
