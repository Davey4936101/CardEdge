'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { BookmarkPlus, RefreshCw, Zap, Gavel } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { WatchlistPanel } from './WatchlistPanel'
import { DealCard } from './DealCard'
import { DealSidebar } from './DealSidebar'
import { DealDetailSheet } from './DealDetailSheet'
import { BidWatchPanel } from './BidWatchPanel'
import {
  applyFilters,
  sortAlerts,
  DEFAULT_FILTERS,
  type Alert,
  type FilterState,
  type SortKey,
} from '@/lib/deals/deal-score'

type ActiveTab = 'deals' | 'bid-watch'

const PAGE_SIZE = 10

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'deal_score', label: 'Best Deal' },
  { key: 'ending_soon', label: 'Ending Soon' },
  { key: 'newest', label: 'Newest' },
  { key: 'price_asc', label: 'Price ↑' },
]

type ScanState = 'idle' | 'scanning' | 'done' | 'error'

export function DealFeed() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('deals')
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS)
  const [sortKey, setSortKey] = useState<SortKey>('deal_score')
  const [page, setPage] = useState(1)
  const [selectedAlert, setSelectedAlert] = useState<Alert | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [watchlistOpen, setWatchlistOpen] = useState(false)
  const [scanState, setScanState] = useState<ScanState>('idle')

  const hasAutoScanned = useRef(false)

  const getAuthHeader = useCallback(async (): Promise<Record<string, string>> => {
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    return token ? { Authorization: `Bearer ${token}` } : {}
  }, [])

  const load = useCallback(async (): Promise<Alert[]> => {
    const auth = await getAuthHeader()
    const res = await fetch('/api/alerts', { headers: auth })
    const data = (await res.json()) as Alert[]
    const list = Array.isArray(data) ? data : []
    setAlerts(list)
    setLoading(false)
    return list
  }, [getAuthHeader])

  // Trigger the on-demand scan endpoint. `full` scans all 13 queries;
  // default scans the first 4 in parallel (~5-8s).
  const triggerScan = useCallback(async (full = false) => {
    setScanState('scanning')
    try {
      const auth = await getAuthHeader()
      const res = await fetch('/api/deals/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...auth },
        body: JSON.stringify({ full }),
      })
      const json = (await res.json()) as { newDeals?: number; error?: string }
      if (res.status === 429) {
        // Rate limited — don't mark as error, just show what we have
        setScanState('done')
      } else if (!res.ok) {
        throw new Error(json.error ?? 'Scan failed')
      } else {
        setScanState('done')
      }
      await load()
    } catch {
      setScanState('error')
    }
  }, [load])

  useEffect(() => {
    void load().then((list) => {
      // Auto-trigger a quick scan on first mount if the feed is empty so users
      // don't land on a blank page and have to manually click "Scan now".
      if (list.length === 0 && !hasAutoScanned.current) {
        hasAutoScanned.current = true
        void triggerScan(false)
      }
    })
    const channel = supabase
      .channel('deals-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'alerts' }, () => {
        void load()
      })
      .subscribe()
    return () => { void supabase.removeChannel(channel) }
  }, [load, triggerScan])


  // Reset pagination when filters or sort change
  useEffect(() => { setPage(1) }, [filters, sortKey])

  async function handleRead(id: string) {
    const auth = await getAuthHeader()
    await fetch(`/api/alerts/${id}`, { method: 'PATCH', headers: auth })
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
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-slate-100">Deal Discovery</h1>
        <div className="flex items-center gap-2">
          {activeTab === 'deals' && (
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
          )}
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

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-5 border-b border-slate-800">
        <button
          onClick={() => setActiveTab('deals')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
            activeTab === 'deals'
              ? 'border-indigo-500 text-indigo-400'
              : 'border-transparent text-slate-500 hover:text-slate-300'
          }`}
        >
          <Zap className="size-3.5" />
          Buy It Now Deals
          {!loading && alerts.length > 0 && (
            <span className="ml-1 text-[10px] bg-indigo-600/30 text-indigo-400 px-1.5 py-0.5 rounded-full">
              {alerts.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('bid-watch')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
            activeTab === 'bid-watch'
              ? 'border-amber-500 text-amber-400'
              : 'border-transparent text-slate-500 hover:text-slate-300'
          }`}
        >
          <Gavel className="size-3.5" />
          Bid Watch
        </button>
      </div>

      {/* Tab: sub-header for deals */}
      {activeTab === 'deals' && (
        <div className="mb-4">
          {isScanning && (
            <p className="text-sm text-indigo-400 animate-pulse">Scanning eBay for deals…</p>
          )}
          {!loading && !isScanning && sorted.length > 0 && filtered.length === alerts.length && (
            <p className="text-sm text-slate-500">
              {sorted.length} Buy It Now deal{sorted.length !== 1 ? 's' : ''} found
            </p>
          )}
          {!loading && !isScanning && sorted.length > 0 && filtered.length !== alerts.length && (
            <p className="text-sm text-slate-500">
              {sorted.length} of {alerts.length} deals match filters
            </p>
          )}
          {!loading && !isScanning && sorted.length === 0 && scanState === 'done' && (
            <p className="text-sm text-slate-500">
              No deals above threshold — refresh to check again
            </p>
          )}
        </div>
      )}

      {/* Bid Watch tab */}
      {activeTab === 'bid-watch' && (
        <div className="max-w-2xl">
          <BidWatchPanel />
        </div>
      )}

      {/* Deals tab layout */}
      {activeTab === 'deals' && <div className="flex gap-5 items-start">
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
                    Could not reach eBay. Check that EBAY_CLIENT_ID and EBAY_CLIENT_SECRET are set and try again.
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
      </div>}

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
