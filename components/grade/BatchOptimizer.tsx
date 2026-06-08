'use client'

import { useEffect, useState } from 'react'
import type { BatchResult } from '@/lib/grade/batch-optimizer'

interface HistoryRow {
  id: string
  card_key: string
  raw_price: number | null
  ep_regular: number | null
  created_at: string
}

function fmt(n: number) {
  const sign = n >= 0 ? '+' : ''
  return `${sign}$${Math.abs(Math.round(n))}`
}

export function BatchOptimizer() {
  const [history, setHistory]     = useState<HistoryRow[]>([])
  const [selected, setSelected]   = useState<Set<string>>(new Set())
  const [result, setResult]       = useState<BatchResult | null>(null)
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState<string | null>(null)
  const [histLoading, setHistLoading] = useState(true)

  useEffect(() => {
    fetch('/api/grade/history')
      .then((r) => r.json())
      .then((d) => { setHistory(d as HistoryRow[]); setHistLoading(false) })
      .catch(() => setHistLoading(false))
  }, [])

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  async function optimize() {
    if (selected.size === 0) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/grade/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ analysisIds: Array.from(selected) }),
      })
      const data = (await res.json()) as BatchResult & { error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Optimization failed')
      setResult(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Optimization failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-700 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-slate-100">Select Cards to Batch</h2>
          <span className="text-xs text-slate-500">{selected.size} selected</span>
        </div>

        {histLoading ? (
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-12 rounded-lg bg-slate-800/40 animate-pulse border border-slate-800" />
            ))}
          </div>
        ) : history.length === 0 ? (
          <p className="text-sm text-slate-500">No completed analyses yet. Run a grade analysis first.</p>
        ) : (
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {history.map((row) => (
              <label
                key={row.id}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg border cursor-pointer transition-colors ${
                  selected.has(row.id)
                    ? 'border-indigo-500/60 bg-indigo-900/20'
                    : 'border-slate-700 hover:border-slate-600'
                }`}
              >
                <input
                  type="checkbox"
                  checked={selected.has(row.id)}
                  onChange={() => toggle(row.id)}
                  className="accent-indigo-500"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-200 truncate capitalize">
                    {row.card_key.replace(/-/g, ' ')}
                  </p>
                  <p className="text-xs text-slate-500">
                    ${row.raw_price?.toFixed(0) ?? '—'} raw · {new Date(row.created_at).toLocaleDateString()}
                  </p>
                </div>
                {row.ep_regular !== null && (
                  <span className={`text-xs font-mono ${(row.ep_regular ?? 0) > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {fmt(row.ep_regular)}
                  </span>
                )}
              </label>
            ))}
          </div>
        )}

        <button
          onClick={() => void optimize()}
          disabled={loading || selected.size === 0}
          className="w-full py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-900 text-white text-sm font-semibold transition-colors"
        >
          {loading ? 'Optimizing…' : `Build Batch (${selected.size} cards)`}
        </button>
        {error && <p className="text-sm text-red-400">{error}</p>}
      </div>

      {result && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: 'Recommended',    value: `${result.recommended.length} cards` },
              { label: 'Expected Return', value: `$${Math.round(result.totalExpectedReturn)}` },
              { label: 'Batch ROI',      value: `${Math.round(result.batchRoi * 100)}%` },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-xl border border-slate-700 p-4 text-center">
                <p className="text-xs text-slate-500 mb-1">{label}</p>
                <p className="text-xl font-bold text-slate-100">{value}</p>
              </div>
            ))}
          </div>

          <div className="rounded-xl border border-slate-700 divide-y divide-slate-700">
            <div className="px-4 py-2 text-xs font-semibold text-slate-500 uppercase flex justify-between">
              <span>Card</span>
              <span>Expected Profit</span>
            </div>
            {result.ranked.map((card, i) => (
              <div
                key={card.id}
                className={`flex items-center justify-between px-4 py-3 text-sm ${
                  result.recommended.some((r) => r.id === card.id) ? '' : 'opacity-40'
                }`}
              >
                <div>
                  <span className="text-slate-400 font-mono mr-2">{i + 1}.</span>
                  <span className="text-slate-200 capitalize">{card.cardKey.replace(/-/g, ' ')}</span>
                  {!card.aboveBreakEven && (
                    <span className="ml-2 text-[10px] text-red-400 border border-red-500/30 px-1 py-0.5 rounded">
                      below break-even
                    </span>
                  )}
                </div>
                <span className={`font-mono font-bold tabular-nums ${card.aboveBreakEven ? 'text-emerald-400' : 'text-red-400'}`}>
                  {fmt(card.expectedProfit)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
