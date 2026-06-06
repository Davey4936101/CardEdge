import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { buildPortfolioCardKey } from '@/lib/portfolio/card-key'
import type { AddCardPayload } from '@/lib/portfolio/types'

export async function GET() {
  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('portfolio_cards')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: Request) {
  const supabase = createServerClient()
  const body = (await req.json()) as AddCardPayload

  const grade = body.grade && !['raw', 'RAW', 'Any'].includes(body.grade) ? body.grade : null
  const cardKey = buildPortfolioCardKey(body.player, body.set_name, body.year, grade)
  const isGraded = grade !== null
  const gradeNum = isGraded ? parseInt(grade.replace(/[^0-9]/g, ''), 10) : null

  const { data, error } = await supabase
    .from('portfolio_cards')
    .insert({
      card_key: cardKey,
      player: body.player,
      set_name: body.set_name,
      year: body.year,
      grade,
      status: isGraded ? 'graded_owned' : 'raw_owned',
      source: body.source,
      alert_id: body.alert_id,
      analysis_id: body.analysis_id,
      raw_purchase_price: body.raw_purchase_price,
      raw_purchase_date: body.raw_purchase_date,
      received_grade: gradeNum,
      received_at: isGraded ? body.raw_purchase_date : null,
      submitted_at: isGraded ? body.raw_purchase_date : null,
      notes: body.notes,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
