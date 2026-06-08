// app/api/grade/accuracy/route.ts
import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { getUserFromRequest } from '@/lib/auth'
import { analyzeAccuracyEntry, computeAccuracyStats } from '@/lib/grade/accuracy'
import type { AccuracySubgrades } from '@/lib/grade/accuracy'

export async function GET(req: Request) {
  const userId = await getUserFromRequest(req)
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerClient()

  const { data, error } = await supabase
    .from('grade_analyses')
    .select('id, card_key, continuous_score, actual_psa_grade, outcome_logged_at, subgrade_centering, subgrade_corners, subgrade_edges, subgrade_surface')
    .eq('user_id', userId)
    .not('actual_psa_grade', 'is', null)
    .not('continuous_score', 'is', null)
    .order('outcome_logged_at', { ascending: false })
    .limit(100)

  if (error) return NextResponse.json({ error: 'Fetch failed' }, { status: 500 })

  const entries = (data ?? []).map((row) => {
    const subgrades: AccuracySubgrades = {
      centering: row.subgrade_centering as number | undefined,
      corners:   row.subgrade_corners  as number | undefined,
      edges:     row.subgrade_edges    as number | undefined,
      surface:   row.subgrade_surface  as number | undefined,
    }
    return analyzeAccuracyEntry(
      row.id as string,
      row.card_key as string,
      Number(row.continuous_score),
      Number(row.actual_psa_grade),
      subgrades
    )
  })

  const stats = computeAccuracyStats(entries)

  return NextResponse.json({ entries, stats })
}
