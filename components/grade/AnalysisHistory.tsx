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
  actual_psa_grade: number | null
  continuous_score: number | null
}

const PSA_GRADES = [10, 9.5, 9, 8.5, 8, 7.5, 7, 6.5, 6, 5, 4, 3, 2, 1]

const REC_STYLE = {
  grade: 'text-green-600 dark:text-green-400',
  uncertain: 'text-amber-600 dark:text-amber-400',
  skip: 'text-red-500',
}

export function AnalysisHistory() {
  const [rows, setRows] = useState<HistoryRow[]>([])
  const [logging, setLogging] = useState<string | null>(null)
  const [gradeInput, setGradeInput] = useState<number>(9)
  const [saving, setSaving] = useState(false)

  async function logOutcome(id: string) {
    setSaving(true)
    try {
      const res = await fetch(`/api/grade/analyses/${id}/outcome`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actualGrade: gradeInput }),
      })
      if (res.ok) {
        setRows((prev) =>
          prev.map((r) => r.id === id ? { ...r, actual_psa_grade: gradeInput } : r)
        )
        setLogging(null)
      }
    } finally {
      setSaving(false)
    }
  }

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
            className="rounded-lg border border-slate-200 dark:border-slate-800 px-4 py-3 space-y-2"
          >
            <div className="flex items-center justify-between">
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
            {/* Outcome section */}
            {row.actual_psa_grade !== null ? (
              <p className="text-xs text-slate-500">
                Actual: <span className="font-semibold text-slate-300">PSA {row.actual_psa_grade}</span>
                {row.continuous_score !== null && (
                  <span className={`ml-2 ${Math.abs(row.actual_psa_grade - row.continuous_score) <= 0.5 ? 'text-emerald-500' : 'text-amber-500'}`}>
                    ({row.actual_psa_grade >= row.continuous_score ? '+' : ''}{(row.actual_psa_grade - row.continuous_score).toFixed(1)})
                  </span>
                )}
              </p>
            ) : logging === row.id ? (
              <div className="flex items-center gap-2">
                <select
                  value={gradeInput}
                  onChange={(e) => setGradeInput(Number(e.target.value))}
                  className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-200 focus:outline-none"
                >
                  {PSA_GRADES.map((g) => (
                    <option key={g} value={g}>PSA {g}</option>
                  ))}
                </select>
                <button
                  onClick={() => void logOutcome(row.id)}
                  disabled={saving}
                  className="text-xs bg-indigo-600 hover:bg-indigo-500 text-white px-2.5 py-1 rounded transition-colors disabled:opacity-50"
                >
                  {saving ? '…' : 'Save'}
                </button>
                <button
                  onClick={() => setLogging(null)}
                  className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => { setLogging(row.id); setGradeInput(9) }}
                className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
              >
                + Log actual PSA grade
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
