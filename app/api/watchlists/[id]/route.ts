import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = createServerClient()
  const body = (await req.json()) as {
    name: string
    player: string
    set?: string
    grade?: string
    min_roi_pct?: string
    max_price?: string
  }

  const { data, error } = await supabase
    .from('watchlists')
    .update({
      name: body.name,
      filters: {
        player: body.player,
        set: body.set ?? '',
        grade: body.grade ?? 'Any',
        min_roi_pct: Number(body.min_roi_pct ?? 15),
        max_price: body.max_price ? Number(body.max_price) : null,
      },
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(
  _: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = createServerClient()
  const { error } = await supabase.from('watchlists').delete().eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return new NextResponse(null, { status: 204 })
}
