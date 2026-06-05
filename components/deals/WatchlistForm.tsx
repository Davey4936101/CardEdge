'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'

const GRADES = ['Any', 'Raw', 'PSA 9', 'PSA 10', 'BGS 9.5', 'BGS 10', 'SGC 10']

interface WatchlistFormInitial {
  id?: string
  name: string
  player: string
  set: string
  grade: string
  min_roi_pct: number
  max_price: number | null
}

interface WatchlistFormProps {
  initial?: WatchlistFormInitial
  onSave: () => void
  onCancel: () => void
}

export function WatchlistForm({ initial, onSave, onCancel }: WatchlistFormProps) {
  const [name, setName] = useState(initial?.name ?? '')
  const [player, setPlayer] = useState(initial?.player ?? '')
  const [set, setSet] = useState(initial?.set ?? '')
  const [grade, setGrade] = useState(initial?.grade ?? 'Any')
  const [minRoi, setMinRoi] = useState(String(initial?.min_roi_pct ?? 15))
  const [maxPrice, setMaxPrice] = useState(
    initial?.max_price != null ? String(initial.max_price) : ''
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setError('Name is required'); return }
    if (!player.trim()) { setError('Player is required'); return }
    setSaving(true)
    setError('')

    const url = initial?.id ? `/api/watchlists/${initial.id}` : '/api/watchlists'
    const method = initial?.id ? 'PATCH' : 'POST'
    const body = { name, player, set, grade, min_roi_pct: minRoi, max_price: maxPrice }

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const data = (await res.json()) as { error?: string }
      setError(data.error ?? 'Save failed')
      setSaving(false)
      return
    }

    onSave()
  }

  const inputCls =
    'w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500'
  const labelCls = 'block text-xs font-medium text-slate-500 mb-1'

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className={labelCls}>Watchlist Name *</label>
        <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Mahomes Prizms" />
      </div>
      <div>
        <label className={labelCls}>Player *</label>
        <input className={inputCls} value={player} onChange={(e) => setPlayer(e.target.value)} placeholder="e.g. Patrick Mahomes" />
      </div>
      <div>
        <label className={labelCls}>Set</label>
        <input className={inputCls} value={set} onChange={(e) => setSet(e.target.value)} placeholder="e.g. Prizm" />
      </div>
      <div>
        <label className={labelCls}>Grade</label>
        <select className={inputCls} value={grade} onChange={(e) => setGrade(e.target.value)}>
          {GRADES.map((g) => <option key={g}>{g}</option>)}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Min ROI %</label>
          <input className={inputCls} type="number" min="0" value={minRoi} onChange={(e) => setMinRoi(e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>Max Price ($)</label>
          <input className={inputCls} type="number" min="0" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} placeholder="No limit" />
        </div>
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
      <div className="flex gap-2 justify-end">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
        <Button type="submit" size="sm" disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
      </div>
    </form>
  )
}
