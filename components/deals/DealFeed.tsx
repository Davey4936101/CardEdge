'use client'

import { useCallback, useEffect, useState } from 'react'
import { BookmarkPlus } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { WatchlistPanel } from './WatchlistPanel'
import { DealCard } from './DealCard'
import { DealSidebar } from './DealSidebar'
import { DealDetailSheet } from './DealDetailSheet'
import {
  applyFilters,
  sortAlerts,
  DEFAULT_FILTERS,
  type Alert,
  type FilterState,
  type SortKey,
} from '@/lib/deals/deal-score'

const PAGE_SIZE = 10

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'deal_score', label: 'Best Deal' },
  { key: 'ending_soon', label: 'Ending Soon' },
  { key: 'newest', label: 'Newest' },
  { key: 'price_asc', label: 'Price ↑' },
]

export function DealFeed() {
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS)
  const [sortKey, setSortKey] = useState<SortKey>('deal_score')
  const [page, setPage] = useState(1)
  const [selectedAlert, setSelectedAlert] = useState<Alert | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [watchlistOpen, setWatchlistOpen] = useState(false)

  const load = useCallback(async () => {
    const res = await fetch('/api/alerts')
    const data = (await res.json()) as Alert[]
    setAlerts(Array.isArray(data) ? data : [])
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
    const channel = supabase
      .channel('deals-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'alerts' }, () => {
        void load()
      })
      .subscribe()
    return () => { void supabase.removeChannel(channel) }
  }, [load])

  // Reset pagination when filters or sort change
  useEffect(() => { setPage(1) }, [filters, sortKey])

  async function handleRead(id: string) {
    await fetch(`/api/alerts/${id}`, { method: 'PATCH' })
    setAlerts((prev) => prev.map((a) => (a.id === id ? { ...a, is_read: true } : a)))
  }

  function handleSelect(alert: Alert) {
    setSelectedAlert(alert)
    setDetailOpen(true)
  }

  const filtered = applyFilters(alerts, filters)
  const sorted = sortAlerts(filtered, sortKey)
  const visible = sorted.slice(0, page * PAGE_SIZE)
  const hasMore = visible.length < sorted.length

  return (
    <>
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Deal Discovery</h1>
          {!loading && (
            <p className="text-sm text-slate-500 mt-0.5">
              {sorted.length} deal{sorted.length !== 1 ? 's' : ''} found
              {filtered.length !== alerts.length && ` (${alerts.length} total)`}
            </p>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setWatchlistOpen(true)}
          className="gap-1.5"
        >
          <BookmarkPlus className="size-4" />
          Watchlists
        </Button>
      </div>

      {/* Layout */}
      <div className="flex gap-5 items-start">
        <DealSidebar filters={filters} onChange={setFilters} />

        <div className="flex-1 min-w-0">
          {/* Sort pills */}
          <div className="flex items-center gap-1.5 mb-4 flex-wrap">
            <span className="text-xs text-slate-500 mr-1">Sort:</span>
            {SORT_OPTIONS.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setSortKey(key)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  sortKey === key
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-800/60 text-slate-400 hover:text-slate-200 border border-slate-700/60'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Feed */}
          {loading ? (
            <div className="space-y-3">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-[132px] rounded-xl bg-slate-800/40 animate-pulse border border-slate-800" />
              ))}
            </div>
          ) : sorted.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center border border-dashed border-slate-800 rounded-xl gap-3">
              <p className="text-sm font-medium text-slate-500">No deals match your filters</p>
              <p className="text-xs text-slate-600">
                {alerts.length === 0
                  ? 'Deals appear here as watchlists scan eBay every 5 minutes.'
                  : 'Try relaxing the filters above.'}
              </p>
              {alerts.length === 0 && (
                <button
                  onClick={() => setWatchlistOpen(true)}
                  className="text-sm text-indigo-500 hover:text-indigo-400 transition-colors"
                >
                  Set up a watchlist →
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="space-y-2.5">
                {visible.map((alert) => (
                  <DealCard
                    key={alert.id}
                    alert={alert}
                    onSelect={handleSelect}
                    onRead={handleRead}
                  />
                ))}
              </div>

              {hasMore && (
                <div className="mt-4 text-center">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => p + 1)}
                    className="w-full"
                  >
                    Load more ({sorted.length - visible.length} remaining)
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Deal detail sheet */}
      <DealDetailSheet
        alert={selectedAlert}
        open={detailOpen}
        onOpenChange={setDetailOpen}
      />

      {/* Watchlist sheet */}
      <Sheet open={watchlistOpen} onOpenChange={setWatchlistOpen}>
        <SheetContent side="right" className="w-[400px] overflow-y-auto p-0">
          <SheetHeader className="px-6 py-4 border-b border-slate-200 dark:border-slate-800">
            <SheetTitle>Watchlists</SheetTitle>
          </SheetHeader>
          <div className="px-6 py-4">
            <WatchlistPanel />
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
