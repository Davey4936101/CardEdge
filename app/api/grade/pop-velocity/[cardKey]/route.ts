// app/api/grade/pop-velocity/[cardKey]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { computePopVelocity } from '@/lib/grade/pop-velocity'
import type { PopSnapshot } from '@/lib/grade/pop-velocity'

export async function GET(
  _req: NextRequest,
  { params }: { params: { cardKey: string } }
) {
  const supabase = createServerClient()

  const { data, error } = await supabase
    .from('pop_snapshots')
    .select('snapshot_date, count_10, count_9, count_8, count_7, total')
    .eq('card_key', params.cardKey)
    .order('snapshot_date', { ascending: false })
    .limit(90)

  if (error) return NextResponse.json({ error: 'Query failed' }, { status: 500 })
  if (!data || data.length === 0) return NextResponse.json(null)

  const velocity = computePopVelocity(data as PopSnapshot[])
  return NextResponse.json(velocity)
}
