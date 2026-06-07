'use client'

import { useCallback, useEffect, useState } from 'react'
import { RefreshCw, Trash2, ExternalLink, Clock, Plus, TrendingDown, Minus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { supabase } from '@/lib/supabase/client'
import { timeAgo } from '@/lib/utils'

interface BidWatch {
  id: string
  ebay_item_id: string
  card_title: string
  image_url: string | null
  listing_url: string
  current_bid: number | null
  bin_price: number | null
  fair_value: number | null
  end_time: string | null
  buying_format: string
  is_ended: boolean
  last_refreshed: string | null
  created_at: string
}

function timeUntil(dateStr: string): { label: string; urgent: boolean } | null {
  const ms = new Date(dateStr).getTime() - Date.now()
  if (ms <= 0) return null
  const urgent = ms < 6 * 60 * 60 * 1000
  const h = Math.floor(ms / (1000 * 60 * 60))
  const m = Math.floor((ms % (1000 * 60 * 60)) / 60_000)
  if (h < 1) return { label: `${m}m left`, urgent }
  if (h < 24) return { label: `${h}h ${m}m left`, urgent }
  const d = Math.floor(h / 24)
  return { label: `${d}d ${h % 24}h left`, urgent }
}

function BidCard({
  watch,
  onRemove,
  onRefresh,
}: {
  watch: BidWatch
  onRemove: () => void
  onRefresh: () => Promise<void>
}) {
  const [refreshing, setRefreshing] = useState(false)
  const endInfo = watch.end_time ? timeUntil(watch.end_time) : null
  const fv = watch.fair_value
  const bid = watch.current_bid
  // ROI if you win at current bid (optimistic — actual bid will be higher)
  const bidRoi = fv && bid ? ((fv - bid) / fv) * 100 : null
  const hasBin = watch.bin_price !== null
  const binRoi = fv && watch.bin_price ? ((fv - watch.bin_price) / fv) * 100 : null

  async function handleRefresh() {
    setRefreshing(true)
    await onRefresh()
    setRefreshing(false)
  }

  const roiColor =
    bidRoi === null ? 'text-slate-400'
    : bidRoi >= 20 ? 'text-emerald-400'
    : bidRoi >= 10 ? 'text-green-400'
    : bidRoi >= 0 ? 'text-amber-400'
    : 'text-red-400'

  return (
    <div className={`flex gap-3 p-4 rounded-xl border transition-all ${
      watch.is_ended
        ? 'border-slate-800/50 bg-slate-900/20 opacity-60'
        : endInfo?.urgent
        ? 'border-red-900/40 bg-red-950/10'
        : 'border-slate-800 bg-slate-900/30'
    }`}>
      {/* Image */}
      <div className="flex-shrink-0 w-[60px] h-[84px] rounded-lg overflow-hidden bg-slate-800 border border-slate-700/50">
        {watch.image_url ? (
          <img src={watch.image_url} alt={watch.card_title} className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-slate-600">
            <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path d="M3 9h18M9 21V9" />
            </svg>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 flex flex-col gap-1.5">
        <p className="text-sm font-semibold text-slate-100 line-clamp-2 leading-snug">
          {watch.card_title}
        </p>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Current bid */}
          <div>
            <p className="text-[10px] text-slate-500 mb-0.5">Current Bid</p>
            <p className="text-sm font-bold text-slate-100 tabular-nums">
              {bid !== null ? `$${bid.toFixed(2)}` : '—'}
            </p>
          </div>

          {/* BIN price if available */}
          {hasBin && (
            <div>
              <p className="text-[10px] text-slate-500 mb-0.5">Buy It Now</p>
              <p className="text-sm font-semibold text-teal-400 tabular-nums">
                ${watch.bin_price!.toFixed(2)}
              </p>
            </div>
          )}

          {/* Fair value */}
          {fv && (
            <div>
              <p className="text-[10px] text-slate-500 mb-0.5">Fair Value</p>
              <p className="text-sm font-semibold text-slate-300 tabular-nums">${fv.toFixed(2)}</p>
            </div>
          )}

          {/* ROI at current bid */}
          {bidRoi !== null && (
            <div>
              <p className="text-[10px] text-slate-500 mb-0.5">Bid ROI*</p>
              <p className={`text-sm font-bold tabular-nums ${roiColor}`}>
                {bidRoi >= 0 ? '+' : ''}{bidRoi.toFixed(0)}%
              </p>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {watch.is_ended ? (
            <span className="text-[10px] text-slate-500 bg-slate-800 px-1.5 py-0.5 rounded">Ended</span>
          ) : endInfo ? (
            <span className={`flex items-center gap-1 text-[10px] ${endInfo.urgent ? 'text-red-400' : 'text-slate-500'}`}>
              <Clock className="size-3" />{endInfo.label}
            </span>
          ) : null}
          {watch.last_refreshed && (
            <span className="text-[10px] text-slate-600">Updated {timeAgo(watch.last_refreshed)}</span>
          )}
          {hasBin && binRoi !== null && binRoi > 0 && (
            <span className="text-[10px] text-teal-400 bg-teal-500/10 border border-teal-500/20 px-1.5 py-0.5 rounded">
              BIN saves +{binRoi.toFixed(0)}% vs FV
            </span>
          )}
        </div>

        {bidRoi !== null && bid !== null && (
          <p className="text-[10px] text-slate-600 italic">
            * ROI if you win at current bid — final price will likely be higher
          </p>
        )}
      </div>

      {/* Actions */}
      <div className="flex flex-col items-end justify-between flex-shrink-0 gap-2">
        <div className="flex items-center gap-1">
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition-colors"
            title="Refresh bid"
          >
            <RefreshCw className={`size-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={onRemove}
            className="p-1.5 rounded-lg text-slate-600 hover:text-red-400 hover:bg-red-500/10 transition-colors"
            title="Remove"
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
        <a
          href={watch.listing_url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white px-2 py-1.5 rounded-lg transition-colors"
        >
          eBay <ExternalLink className="size-3" />
        </a>
      </div>
    </div>
  )
}

export function BidWatchPanel() {
  const [watches, setWatches] = useState<BidWatch[]>([])
  const [loading, setLoading] = useState(true)
  const [url, setUrl] = useState('')
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)

  const getAuthHeader = useCallback(async (): Promise<Record<string, string>> => {
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    return token ? { Authorization: `Bearer ${token}` } : {}
  }, [])

  const loadWatches = useCallback(async () => {
    const auth = await getAuthHeader()
    const res = await fetch('/api/deals/bid-watch', { headers: auth })
    const data = (await res.json()) as BidWatch[]
    setWatches(Array.isArray(data) ? data : [])
    setLoading(false)
  }, [getAuthHeader])

  useEffect(() => { void loadWatches() }, [loadWatches])

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!url.trim()) return
    setAdding(true)
    setAddError(null)
    try {
      const auth = await getAuthHeader()
      const res = await fetch('/api/deals/bid-watch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...auth },
        body: JSON.stringify({ url: url.trim() }),
      })
      const json = (await res.json()) as { error?: string }
      if (!res.ok) {
        setAddError(json.error ?? 'Failed to add')
      } else {
        setUrl('')
        await loadWatches()
      }
    } catch {
      setAddError('Network error')
    } finally {
      setAdding(false)
    }
  }

  async function handleRemove(id: string) {
    const auth = await getAuthHeader()
    await fetch(`/api/deals/bid-watch/${id}`, { method: 'DELETE', headers: auth })
    setWatches((prev) => prev.filter((w) => w.id !== id))
  }

  async function handleRefresh(id: string) {
    const auth = await getAuthHeader()
    const res = await fetch(`/api/deals/bid-watch/${id}`, { method: 'PATCH', headers: auth })
    if (res.ok) {
      const updated = (await res.json()) as BidWatch
      setWatches((prev) => prev.map((w) => (w.id === id ? updated : w)))
    }
  }

  const active = watches.filter((w) => !w.is_ended)
  const ended = watches.filter((w) => w.is_ended)

  return (
    <div className="flex flex-col gap-4">
      {/* Add form */}
      <form onSubmit={(e) => void handleAdd(e)} className="flex flex-col gap-2">
        <p className="text-xs text-slate-400 leading-relaxed">
          Track auctions you&apos;re bidding on. Paste an eBay auction URL — we&apos;ll show current bid vs. fair value and refresh automatically.
        </p>
        <div className="flex gap-2">
          <input
            className="flex-1 rounded-lg border border-slate-700/70 bg-slate-800/50 px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 transition-colors"
            placeholder="https://www.ebay.com/itm/…"
            value={url}
            onChange={(e) => { setUrl(e.target.value); setAddError(null) }}
            disabled={adding}
          />
          <Button type="submit" size="sm" disabled={adding || !url.trim()} className="gap-1.5 shrink-0">
            {adding ? <RefreshCw className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
            {adding ? 'Adding…' : 'Track'}
          </Button>
        </div>
        {addError && <p className="text-xs text-red-400">{addError}</p>}
      </form>

      <div className="flex items-center gap-2 text-[10px] text-slate-600 bg-amber-500/5 border border-amber-500/15 rounded-lg px-3 py-2">
        <TrendingDown className="size-3 text-amber-500/60 flex-shrink-0" />
        <span>Bid ROI is based on current bid, not your final purchase price. Treat it as an optimistic estimate only.</span>
      </div>

      {/* Active watches */}
      {loading ? (
        <div className="space-y-2">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="h-24 rounded-xl bg-slate-800/40 animate-pulse border border-slate-800" />
          ))}
        </div>
      ) : active.length === 0 && ended.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center border border-dashed border-slate-800 rounded-xl gap-2">
          <Minus className="size-5 text-slate-600" />
          <p className="text-sm text-slate-500">No auctions tracked yet</p>
          <p className="text-xs text-slate-600">Paste an eBay auction URL above to start tracking</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {active.map((w) => (
            <BidCard
              key={w.id}
              watch={w}
              onRemove={() => void handleRemove(w.id)}
              onRefresh={() => handleRefresh(w.id)}
            />
          ))}
          {ended.length > 0 && (
            <>
              <p className="text-xs text-slate-600 mt-1">Ended</p>
              {ended.map((w) => (
                <BidCard
                  key={w.id}
                  watch={w}
                  onRemove={() => void handleRemove(w.id)}
                  onRefresh={() => handleRefresh(w.id)}
                />
              ))}
            </>
          )}
        </div>
      )}
    </div>
  )
}
