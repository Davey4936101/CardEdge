import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

export interface DealsStatus {
  lastScannedAt: string | null
  alertsToday: number
  hasWatchlists: boolean
}

export async function GET() {
  const supabase = createServerClient()

  const todayUtc = new Date()
  todayUtc.setUTCHours(0, 0, 0, 0)

  const [watchlistsResult, alertsResult] = await Promise.all([
    supabase.from('watchlists').select('last_scanned_at').eq('is_active', true),
    supabase
      .from('alerts')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', todayUtc.toISOString()),
  ])

  if (watchlistsResult.error) {
    return NextResponse.json({ error: watchlistsResult.error.message }, { status: 500 })
  }

  const watchlists = watchlistsResult.data ?? []
  const hasWatchlists = watchlists.length > 0

  const lastScannedAt = watchlists.reduce<string | null>((latest, w) => {
    const t = w.last_scanned_at as string | null
    if (!t) return latest
    if (!latest) return t
    return new Date(t) > new Date(latest) ? t : latest
  }, null)

  const alertsToday = alertsResult.count ?? 0

  return NextResponse.json({ lastScannedAt, alertsToday, hasWatchlists } satisfies DealsStatus)
}
