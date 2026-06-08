// app/api/grade/crossover/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { getUserFromRequest } from '@/lib/auth'
import { computeCrossoverProbability, computeCrossoverEv } from '@/lib/grade/crossover'
import { fetchGradedComps } from '@/lib/grade/graded-comps'
import { identifyCardFromTitle } from '@/lib/grade/card-identify'

export async function POST(req: NextRequest) {
  const userId = await getUserFromRequest(req)
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as {
    cardTitle?: string
    centeringSub?: number
    cornersSub?: number
    edgesSub?: number
    surfaceSub?: number
    bgsSaleValue?: number
  }

  const { cardTitle, centeringSub, cornersSub, edgesSub, surfaceSub, bgsSaleValue } = body

  if (
    typeof centeringSub !== 'number' || typeof cornersSub !== 'number' ||
    typeof edgesSub !== 'number'     || typeof surfaceSub !== 'number'
  ) {
    return NextResponse.json({ error: 'All four sub-grades are required' }, { status: 400 })
  }

  const subs = [centeringSub, cornersSub, edgesSub, surfaceSub]
  if (subs.some((s) => s < 1 || s > 10)) {
    return NextResponse.json({ error: 'Sub-grades must be between 1 and 10' }, { status: 400 })
  }

  const crossoverProbability = computeCrossoverProbability(centeringSub, cornersSub, edgesSub, surfaceSub)

  const identity = cardTitle ? await identifyCardFromTitle(cardTitle) : null
  let comps: Awaited<ReturnType<typeof fetchGradedComps>> = {}

  if (identity) {
    comps = await fetchGradedComps(identity.player, identity.year, identity.set, identity.cardNumber)
  }

  const psa10Value = comps[10] ?? 0
  const psa9Value  = comps[9]  ?? 0
  const rawValue   = bgsSaleValue ?? psa9Value * 0.9

  const ev = computeCrossoverEv({
    centeringSub,
    cornersSub,
    edgesSub,
    surfaceSub,
    crossoverProbability,
    bgsSaleValue: rawValue,
    psa10SaleValue: psa10Value,
    psa9SaleValue: psa9Value,
    rawValue,
  })

  const supabase = createServerClient()
  const { data: stored } = await supabase
    .from('bgs_crossover_analyses')
    .insert({
      user_id: userId,
      card_key: identity?.cardKey ?? 'unknown',
      input_method: 'manual',
      centering_sub: centeringSub,
      corners_sub: cornersSub,
      edges_sub: edgesSub,
      surface_sub: surfaceSub,
      crossover_probability: crossoverProbability,
      ev_keep_bgs:   ev.evKeepBgs,
      ev_crossover:  ev.evCrossover,
      ev_crack_raw:  ev.evCrackRaw,
      recommendation: ev.recommendation,
    })
    .select('id')
    .single()

  return NextResponse.json({
    id: stored?.id,
    crossoverProbability,
    evKeepBgs:   ev.evKeepBgs,
    evCrossover: ev.evCrossover,
    evCrackRaw:  ev.evCrackRaw,
    recommendation: ev.recommendation,
    comps: { psa10: psa10Value, psa9: psa9Value },
    cardKey: identity?.cardKey,
  })
}
