'use client'

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

interface HistoryRow {
  id: string
  card_key: string
  mode: string
  recommendation: string | null
  reliability_score: string | null
  raw_price: number | null
  ep_regular: number | null
  created_at: string
}

const REC_STYLE = {
  grade: 'text-green-600 dark:text-green-400',
  uncertain: 'text-amber-600 dark:text-amber-400',
  skip: 'text-red-500',
}

export function AnalysisHistory() {
  const [rows, setRows] = useState<HistoryRow[]>([])

  useEffect(() => {
    fetch('/api/grade/history')
      .then((r) => r.json())
      .then((data) => setRows(data as HistoryRow[]))
      .catch(() => {})
  }, [])

  if (!rows.length) return null

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">Recent Analyses</h3>
      <div className="space-y-2">
        {rows.map((row) => (
          <div
            key={row.id}
            className="flex items-center justify-between rounded-lg border border-slate-200 dark:border-slate-800 px-4 py-3"
          >
            <div>
              <p className="text-sm font-medium capitalize">
                {row.card_key.replace(/-/g, ' ')}
              </p>
              <p className="text-xs text-slate-400">
                {new Date(row.created_at).toLocaleDateString()} · {row.mode === 'ebay' ? 'eBay' : 'My Card'}
                {row.raw_price ? ` · $${row.raw_price}` : ''}
              </p>
            </div>
            <div className="text-right">
              {row.recommendation && (
                <p className={cn('text-xs font-semibold uppercase', REC_STYLE[row.recommendation as keyof typeof REC_STYLE])}>
                  {row.recommendation === 'grade' ? 'Grade It' : row.recommendation === 'uncertain' ? 'Uncertain' : 'Skip'}
                </p>
              )}
              {row.ep_regular !== null && (
                <p className={cn('text-xs font-mono', (row.ep_regular ?? 0) > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500')}>
                  {(row.ep_regular ?? 0) > 0 ? '+' : ''}${row.ep_regular?.toFixed(0)}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
