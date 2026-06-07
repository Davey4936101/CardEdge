import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { getUserFromRequest } from '@/lib/auth'
import { getCurrentWindows, getAllWindows } from '@/lib/intel/seasonal-windows'
import type { Sport } from '@/lib/intel/espn'

const VALID_SPORTS: Sport[] = ['nfl', 'nba', 'mlb']

function detectSport(setName: string): Sport | null {
  const lower = setName.toLowerCase()
  if (lower.includes('prizm') || lower.includes('optic') || lower.includes('nfl') || lower.includes('football') || lower.includes('prestige')) return 'nfl'
  if (lower.includes('nba') || lower.includes('basketball') || lower.includes('hoops') || lower.includes('select')) return 'nba'
  if (lower.includes('mlb') || lower.includes('baseball') || lower.includes('topps') || lower.includes('bowman')) return 'mlb'
  return null
}

export async function GET(req: Request) {
  const userId = await getUserFromRequest(req)
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerClient()

  // Determine which sports the user has in their portfolio
  const { data: cards } = await supabase
    .from('portfolio_cards')
    .select('set_name')
    .eq('user_id', userId)
    .in('status', ['raw_owned', 'submitted', 'graded_owned'])

  const detectedSports = new Set<Sport>()
  for (const card of cards ?? []) {
    const sport = detectSport(card.set_name as string)
    if (sport) detectedSports.add(sport)
  }

  // If no sports detected, return all
  const sports = detectedSports.size > 0 ? [...detectedSports] : VALID_SPORTS

  const currentWindows = getCurrentWindows(sports)
  const allWindows = Object.fromEntries(
    VALID_SPORTS.map((s) => [s, getAllWindows(s)])
  )

  return NextResponse.json({ current: currentWindows, all: allWindows })
}
