import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('watchlists')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: Request) {
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
    .insert({
      name: body.name,
      filters: {
        player: body.player,
        set: body.set ?? '',
        grade: body.grade ?? 'Any',
        min_roi_pct: Number(body.min_roi_pct ?? 15),
        max_price: body.max_price ? Number(body.max_price) : null,
      },
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
