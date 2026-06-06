'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { supabase } from '@/lib/supabase/client'
import { timeAgo } from '@/lib/utils'
import { AlertCard, type Alert } from './AlertCard'
import type { DealsStatus } from '@/app/api/deals/status/route'

type SortKey = 'roi' | 'newest' | 'price'
type FilterKey = 'all' | 'unread'

function sortAlerts(alerts: Alert[], key: SortKey): Alert[] {
  return [...alerts].sort((a, b) => {
    if (key === 'roi') return b.roi_pct - a.roi_pct
    if (key === 'price') return a.listed_price - b.listed_price
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  })
}

interface AlertFeedProps {
  onManageWatchlists: () => void
}

export function AlertFeed({ onManageWatchlists }: AlertFeedProps) {
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [status, setStatus] = useState<DealsStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [sortKey, setSortKey] = useState<SortKey>('roi')
  const [filterKey, setFilterKey] = useState<FilterKey>('all')

  const load = useCallback(async () => {
    const [alertsRes, statusRes] = await Promise.all([
      fetch('/api/alerts'),
      fetch('/api/deals/status'),
    ])
    const alertsData = (await alertsRes.json()) as Alert[]
    setAlerts(Array.isArray(alertsData) ? alertsData : [])
    if (statusRes.ok) setStatus((await statusRes.json()) as DealsStatus)
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
    const channel = supabase
      .channel('alerts-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'alerts' }, () => { void load() })
      .subscribe()
    return () => { void supabase.removeChannel(channel) }
  }, [load])

  async function handleRead(id: string) {
    await fetch(`/api/alerts/${id}`, { method: 'PATCH' })
    setAlerts((prev) => prev.map((a) => (a.id === id ? { ...a, is_read: true } : a)))
  }

  async function handleMarkAllRead() {
    await fetch('/api/alerts/mark-all-read', { method: 'POST' })
    setAlerts((prev) => prev.map((a) => ({ ...a, is_read: true })))
  }

  const unreadCount = alerts.filter((a) => !a.is_read).length
  const visible = sortAlerts(
    filterKey === 'unread' ? alerts.filter((a) => !a.is_read) : alerts,
    sortKey
  )

  if (loading) return <p className="text-sm text-slate-400 py-8">Loading…</p>

  if (!status?.hasWatchlists) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-lg gap-3 mt-4">
        <p className="text-sm font-medium text-slate-500">No watchlists set up yet</p>
        <p className="text-xs text-slate-400">Cards matching your criteria will appear here once you create a watchlist.</p>
        <button onClick={onManageWatchlists} className="text-sm text-indigo-500 hover:text-indigo-400 transition-colors">
          Set up your first watchlist →
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-0 mt-2">
      {status && (
        <p className="text-xs text-slate-400 mb-4">
          {status.lastScannedAt
            ? `Last scanned ${timeAgo(status.lastScannedAt)} · ${status.alertsToday} alert${status.alertsToday !== 1 ? 's' : ''} today`
            : 'Not yet scanned.'}
        </p>
      )}

      <div className="flex items-center gap-4 mb-4 flex-wrap">
        <div className="flex items-center gap-1 text-xs">
          <span className="text-slate-500 mr-1">Sort:</span>
          {(['roi', 'newest', 'price'] as SortKey[]).map((key) => (
            <button
              key={key}
              onClick={() => setSortKey(key)}
              className={`px-2 py-1 rounded transition-colors ${sortKey === key ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
            >
              {key === 'roi' ? 'ROI %' : key === 'newest' ? 'Newest' : 'Price'}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 text-xs">
          <span className="text-slate-500 mr-1">Filter:</span>
          {(['all', 'unread'] as FilterKey[]).map((key) => (
            <button
              key={key}
              onClick={() => setFilterKey(key)}
              className={`px-2 py-1 rounded transition-colors ${filterKey === key ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
            >
              {key === 'all' ? 'All' : 'Unread'}
            </button>
          ))}
        </div>
        {unreadCount > 0 && (
          <Button variant="ghost" size="sm" className="ml-auto text-xs text-slate-400 hover:text-slate-200" onClick={() => void handleMarkAllRead()}>
            Mark all read
          </Button>
        )}
      </div>

      {visible.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-lg">
          <p className="text-sm font-medium text-slate-500">No alerts yet</p>
          <p className="text-xs text-slate-400 mt-1">The scanner runs every 5 minutes. Check back shortly.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((a) => (
            <AlertCard key={a.id} alert={a} onRead={(id) => void handleRead(id)} />
          ))}
        </div>
      )}
    </div>
  )
}
