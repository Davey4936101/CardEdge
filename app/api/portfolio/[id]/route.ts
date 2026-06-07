import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { getUserFromRequest } from '@/lib/auth'
import { buildPortfolioCardKey } from '@/lib/portfolio/card-key'
import { canTransition } from '@/lib/portfolio/status-machine'
import type { PortfolioStatus } from '@/lib/portfolio/types'

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUserFromRequest(req)
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const supabase = createServerClient()
  const body = (await req.json()) as Record<string, unknown>

  const { data: current, error: fetchErr } = await supabase
    .from('portfolio_cards')
    .select('status, player, set_name, year')
    .eq('id', id)
    .eq('user_id', userId)
    .single()

  if (fetchErr || !current) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }

  if (body.status) {
    const next = body.status as PortfolioStatus
    if (!canTransition(current.status as PortfolioStatus, next)) {
      return NextResponse.json(
        { error: `Cannot transition from ${current.status} to ${next}` },
        { status: 422 }
      )
    }
    updates.status = next
    if (next === 'submitted') {
      updates.submitted_at = body.submitted_at ?? new Date().toISOString().slice(0, 10)
    }
    if (next === 'graded_owned') {
      const gradeNum = body.received_grade as number
      const gradeLabel = `PSA ${gradeNum}`
      updates.received_grade = gradeNum
      updates.received_at = body.received_at ?? new Date().toISOString().slice(0, 10)
      updates.grade = gradeLabel
      updates.card_key = buildPortfolioCardKey(
        current.player as string,
        current.set_name as string,
        current.year as string | null,
        gradeLabel
      )
    }
    if (next === 'sold') {
      updates.sold_price = body.sold_price
      updates.sold_at = body.sold_at ?? new Date().toISOString().slice(0, 10)
    }
  }

  if ('current_value_override' in body) updates.current_value_override = body.current_value_override
  if ('notes' in body) updates.notes = body.notes

  const { data, error } = await supabase
    .from('portfolio_cards')
    .update(updates)
    .eq('id', id)
    .eq('user_id', userId)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUserFromRequest(req)
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const supabase = createServerClient()
  const { error } = await supabase
    .from('portfolio_cards')
    .delete()
    .eq('id', id)
    .eq('user_id', userId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return new NextResponse(null, { status: 204 })
}
