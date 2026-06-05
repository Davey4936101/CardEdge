'use client'

import { useCallback, useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { WatchlistCard } from './WatchlistCard'
import { WatchlistForm } from './WatchlistForm'

interface Watchlist {
  id: string
  name: string
  filters: {
    player: string
    set: string
    grade: string
    min_roi_pct: number
    max_price: number | null
  }
  is_active: boolean
}

export function WatchlistPanel() {
  const [watchlists, setWatchlists] = useState<Watchlist[]>([])
  const [creating, setCreating] = useState(false)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const res = await fetch('/api/watchlists')
    const data = (await res.json()) as Watchlist[]
    setWatchlists(Array.isArray(data) ? data : [])
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Watchlists</h2>
        <Button size="sm" onClick={() => setCreating(true)} disabled={creating}>
          <Plus /> New
        </Button>
      </div>

      {creating && (
        <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-4">
          <WatchlistForm
            onSave={() => { setCreating(false); void load() }}
            onCancel={() => setCreating(false)}
          />
        </div>
      )}

      {loading ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : watchlists.length === 0 && !creating ? (
        <p className="text-sm text-slate-400">No watchlists yet. Create one to start scanning.</p>
      ) : (
        <div className="space-y-3">
          {watchlists.map((w) => (
            <WatchlistCard key={w.id} watchlist={w} onUpdate={() => void load()} />
          ))}
        </div>
      )}
    </div>
  )
}
