// app/api/grade/analyses/[id]/outcome/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { getUserFromRequest } from '@/lib/auth'

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUserFromRequest(req)
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await req.json()) as { actualGrade?: unknown }
  const actualGrade = body.actualGrade
  if (typeof actualGrade !== 'number' || actualGrade < 1 || actualGrade > 10) {
    return NextResponse.json({ error: 'actualGrade must be a number between 1 and 10' }, { status: 400 })
  }

  const { id } = await params
  const supabase = createServerClient()

  const { error } = await supabase
    .from('grade_analyses')
    .update({
      actual_psa_grade: actualGrade,
      outcome_logged_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('user_id', userId)

  if (error) return NextResponse.json({ error: 'Update failed' }, { status: 500 })

  return NextResponse.json({ success: true })
}
