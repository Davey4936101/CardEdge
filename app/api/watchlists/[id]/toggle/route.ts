import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

export async function PATCH(
  _: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = createServerClient()

  const { data: current, error: fetchError } = await supabase
    .from('watchlists')
    .select('is_active')
    .eq('id', id)
    .single()

  if (fetchError)
    return NextResponse.json({ error: fetchError.message }, { status: 500 })

  const { data, error } = await supabase
    .from('watchlists')
    .update({ is_active: !current.is_active, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
