import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { getUserFromRequest } from '@/lib/auth'
import { buildBatch } from '@/lib/grade/batch-optimizer'
import type { BatchCard } from '@/lib/grade/batch-optimizer'
import type { GradeDistribution, GradedComps } from '@/lib/grade/types'

export async function POST(req: NextRequest) {
  const userId = await getUserFromRequest(req)
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as { analysisIds?: unknown; batchSize?: unknown; batchName?: unknown }
  const { analysisIds, batchSize, batchName } = body

  if (!Array.isArray(analysisIds) || analysisIds.length === 0) {
    return NextResponse.json({ error: 'analysisIds must be a non-empty array' }, { status: 400 })
  }

  const supabase = createServerClient()

  const { data, error } = await supabase
    .from('grade_analyses')
    .select('id, card_key, raw_price, grade_distribution, graded_comps, continuous_score')
    .in('id', analysisIds as string[])
    .eq('user_id', userId)
    .eq('status', 'complete')

  if (error) return NextResponse.json({ error: 'Fetch failed' }, { status: 500 })
  if (!data || data.length === 0) {
    return NextResponse.json({ error: 'No valid analyses found' }, { status: 404 })
  }

  const cards: BatchCard[] = data.map((row) => ({
    id:              row.id as string,
    cardKey:         row.card_key as string,
    rawPrice:        Number(row.raw_price ?? 0),
    distribution:    row.grade_distribution as GradeDistribution,
    comps:           row.graded_comps as GradedComps,
    continuousScore: row.continuous_score as number | undefined,
  }))

  const batchSizeNum = typeof batchSize === 'number' ? batchSize : 25
  const result = buildBatch(cards, batchSizeNum)

  await supabase.from('submission_batches').insert({
    user_id:               userId,
    batch_name:            typeof batchName === 'string' ? batchName : null,
    card_analysis_ids:     result.recommended.map((c) => c.id),
    total_expected_return: result.totalExpectedReturn,
    total_cost:            result.totalCost,
    batch_roi:             result.batchRoi,
  })

  return NextResponse.json(result)
}
