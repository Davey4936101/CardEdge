// app/api/grade/history/route.ts
import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { getUserFromRequest } from '@/lib/auth'

export async function GET(req: Request) {
  const userId = await getUserFromRequest(req)
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerClient()

  const { data, error } = await supabase
    .from('grade_analyses')
    .select('id, card_key, mode, status, recommendation, reliability_score, raw_price, ep_regular, continuous_score, actual_psa_grade, created_at')
    .eq('status', 'complete')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) {
    return NextResponse.json({ error: 'Failed to fetch history' }, { status: 500 })
  }

  return NextResponse.json(data)
}
