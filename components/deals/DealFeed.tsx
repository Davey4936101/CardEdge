'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { BookmarkPlus, RefreshCw, Zap } from 'lucide-react'
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

type ScanState = 'idle' | 'scanning' | 'done' | 'error'

export function DealFeed() {
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS)
  const [sortKey, setSortKey] = useState<SortKey>('deal_score')
  const [page, setPage] = useState(1)
  const [selectedAlert, setSelectedAlert] = useState<Alert | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [watchlistOpen, setWatchlistOpen] = useState(false)
  const [scanState, setScanState] = useState<ScanState>('idle')
  const [lastScanCount, setLastScanCount] = useState<number | null>(null)
  const autoScanFired = useRef(false)

  const load = useCallback(async () => {
    const res = await fetch('/api/alerts')
    const data = (await res.json()) as Alert[]
    setAlerts(Array.isArray(data) ? data : [])
    setLoading(false)
  }, [])

  // Trigger the on-demand scan endpoint. `full` scans all 13 queries;
  // default scans the first 4 in parallel (~5-8s).
  const triggerScan = useCallback(async (full = false) => {
    setScanState('scanning')
    try {
      const res = await fetch('/api/deals/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ full }),
      })
      if (!res.ok) throw new Error('Scan failed')
      const { newDeals } = (await res.json()) as { newDeals: number }
      setLastScanCount(newDeals)
      setScanState('done')
      // Reload alerts to reflect newly inserted rows
      await load()
    } catch {
      setScanState('error')
    }
  }, [load])

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

  // Auto-scan once on first load if the feed is empty
  useEffect(() => {
    if (!loading && alerts.length === 0 && !autoScanFired.current) {
      autoScanFired.current = true
      void triggerScan(false)
    }
  }, [loading, alerts.length, triggerScan])

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
  const isScanning = scanState === 'scanning'

  return (
    <>
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Deal Discovery</h1>
          {!loading && !isScanning && (
            <p className="text-sm text-slate-500 mt-0.5">
              {sorted.length > 0
                ? `${sorted.length} deal${sorted.length !== 1 ? 's' : ''} found`
                : scanState === 'done'
                ? lastScanCount === 0
                  ? 'No deals above threshold right now — try again later'
                  : `Scan complete · ${alerts.length} deal${alerts.length !== 1 ? 's' : ''} found`
                : 'Loading…'}
              {sorted.length > 0 && filtered.length !== alerts.length && ` (${alerts.length} total)`}
            </p>
          )}
          {isScanning && (
            <p className="text-sm text-indigo-400 mt-0.5 animate-pulse">
              Scanning eBay for deals…
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void triggerScan(true)}
            disabled={isScanning}
            className="gap-1.5"
          >
            <RefreshCw className={`size-3.5 ${isScanning ? 'animate-spin' : ''}`} />
            {isScanning ? 'Scanning…' : 'Refresh'}
          </Button>
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
          {loading || isScanning ? (
            <div className="space-y-3">
              {isScanning && (
                <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-indigo-900/40 bg-indigo-950/20 mb-4">
                  <Zap className="size-4 text-indigo-400 animate-pulse flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-indigo-300">
                      Scanning eBay for top deals…
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Checking active listings against 90-day sold comps. This takes ~10 seconds.
                    </p>
                  </div>
                </div>
              )}
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-[132px] rounded-xl bg-slate-800/40 animate-pulse border border-slate-800" />
              ))}
            </div>
          ) : sorted.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center border border-dashed border-slate-800 rounded-xl gap-3">
              {scanState === 'error' ? (
                <>
                  <p className="text-sm font-medium text-slate-500">Scan failed</p>
                  <p className="text-xs text-slate-600">
                    Could not reach eBay. Check that RAPIDAPI_KEY is set and try again.
                  </p>
                  <Button size="sm" variant="outline" onClick={() => void triggerScan(false)}>
                    Retry
                  </Button>
                </>
              ) : alerts.length === 0 ? (
                <>
                  <p className="text-sm font-medium text-slate-500">No deals found yet</p>
                  <p className="text-xs text-slate-600">
                    The scanner checks eBay every 30 minutes. You can also scan now.
                  </p>
                  <Button size="sm" variant="outline" onClick={() => void triggerScan(false)} className="gap-1.5">
                    <RefreshCw className="size-3.5" /> Scan now
                  </Button>
                </>
              ) : (
                <>
                  <p className="text-sm font-medium text-slate-500">No deals match your filters</p>
                  <p className="text-xs text-slate-600">Try relaxing the filters in the sidebar.</p>
                </>
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
