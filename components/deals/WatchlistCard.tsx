'use client'

import { useState } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { WatchlistForm } from './WatchlistForm'

interface WatchlistFilters {
  player: string
  set: string
  grade: string
  min_roi_pct: number
  max_price: number | null
}

interface Watchlist {
  id: string
  name: string
  filters: WatchlistFilters
  is_active: boolean
}

interface WatchlistCardProps {
  watchlist: Watchlist
  onUpdate: () => void
}

export function WatchlistCard({ watchlist, onUpdate }: WatchlistCardProps) {
  const [editing, setEditing] = useState(false)
  const [toggling, setToggling] = useState(false)

  const f = watchlist.filters
  const summary = [
    f.player,
    f.set,
    f.grade !== 'Any' ? f.grade : '',
    `≥${f.min_roi_pct}% ROI`,
    f.max_price ? `≤$${f.max_price}` : '',
  ]
    .filter(Boolean)
    .join(' · ')

  async function handleToggle() {
    setToggling(true)
    await fetch(`/api/watchlists/${watchlist.id}/toggle`, { method: 'PATCH' })
    onUpdate()
    setToggling(false)
  }

  async function handleDelete() {
    if (!confirm(`Delete "${watchlist.name}"?`)) return
    await fetch(`/api/watchlists/${watchlist.id}`, { method: 'DELETE' })
    onUpdate()
  }

  if (editing) {
    return (
      <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-4">
        <WatchlistForm
          initial={{ id: watchlist.id, name: watchlist.name, ...f }}
          onSave={() => { setEditing(false); onUpdate() }}
          onCancel={() => setEditing(false)}
        />
      </div>
    )
  }

  return (
    <div className="flex items-start gap-3 border border-slate-200 dark:border-slate-700 rounded-lg p-4">
      <button
        onClick={handleToggle}
        disabled={toggling}
        aria-label={watchlist.is_active ? 'Deactivate' : 'Activate'}
        className={`mt-0.5 w-9 h-5 rounded-full transition-colors flex-shrink-0 ${
          watchlist.is_active ? 'bg-indigo-500' : 'bg-slate-300 dark:bg-slate-600'
        }`}
      >
        <span className={`block w-4 h-4 rounded-full bg-white shadow transition-transform mx-0.5 ${
          watchlist.is_active ? 'translate-x-4' : 'translate-x-0'
        }`} />
      </button>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{watchlist.name}</p>
        <p className="text-xs text-slate-400 truncate">{summary}</p>
      </div>
      <div className="flex gap-1">
        <Button variant="ghost" size="icon-sm" onClick={() => setEditing(true)} aria-label="Edit watchlist">
          <Pencil />
        </Button>
        <Button variant="ghost" size="icon-sm" onClick={handleDelete} aria-label="Delete watchlist">
          <Trash2 />
        </Button>
      </div>
    </div>
  )
}
