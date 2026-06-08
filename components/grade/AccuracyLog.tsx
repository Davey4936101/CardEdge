'use client'

import { useEffect, useState } from 'react'
import type { AccuracyEntry, AccuracyStats } from '@/lib/grade/accuracy'

interface AccuracyData {
  entries: AccuracyEntry[]
  stats: AccuracyStats
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-700 p-4 text-center">
      <p className="text-xs text-slate-500 mb-1">{label}</p>
      <p className="text-xl font-bold text-slate-100">{value}</p>
    </div>
  )
}

export function AccuracyLog() {
  const [data, setData] = useState<AccuracyData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/grade/accuracy')
      .then((r) => r.json())
      .then((d) => { setData(d as AccuracyData); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="space-y-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-16 rounded-xl bg-slate-800/40 animate-pulse border border-slate-800" />
        ))}
      </div>
    )
  }

  if (!data || data.entries.length === 0) {
    return (
      <div className="text-center py-16 border border-dashed border-slate-800 rounded-xl">
        <p className="text-sm text-slate-500">No outcomes logged yet.</p>
        <p className="text-xs text-slate-600 mt-1">
          After receiving cards back from PSA, log the actual grade from the Pre-Grade history.
        </p>
      </div>
    )
  }

  const { entries, stats } = data

  const blindSpotEntries = Object.entries(stats.blindSpots) as [string, number][]
  const worstBlindSpot = blindSpotEntries.sort((a, b) => b[1] - a[1])[0]

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Predictions" value={String(stats.totalPredictions)} />
        <Stat label="Within ½ Grade" value={`${Math.round(stats.withinHalfGradePct * 100)}%`} />
        <Stat label="Within 1 Grade" value={`${Math.round(stats.withinOneGradePct * 100)}%`} />
        <Stat label="Mean Δ" value={`${stats.meanDiscrepancy > 0 ? '+' : ''}${stats.meanDiscrepancy.toFixed(1)}`} />
      </div>

      {worstBlindSpot && worstBlindSpot[1] > 0 && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-900/10 px-4 py-3">
          <p className="text-sm text-amber-300 font-medium">
            Systematic blind spot: <span className="capitalize">{worstBlindSpot[0]}</span>
          </p>
          <p className="text-xs text-amber-400/70 mt-0.5">
            {worstBlindSpot[1]}× this attribute was the lowest sub-grade when you overestimated. Evaluate {worstBlindSpot[0]} more carefully.
          </p>
        </div>
      )}

      <div className="rounded-xl border border-slate-700 divide-y divide-slate-700">
        {entries.map((e) => (
          <div key={e.analysisId} className="px-4 py-4 space-y-1">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-slate-200 capitalize">
                {e.cardKey.replace(/-/g, ' ')}
              </p>
              <span className={`text-xs font-mono font-bold ${
                e.isWithinHalfGrade ? 'text-emerald-400' :
                e.isWithinOneGrade  ? 'text-amber-400' : 'text-red-400'
              }`}>
                {e.predictedScore.toFixed(1)} → PSA {e.actualGrade}
              </span>
            </div>
            <p className="text-xs text-slate-500">{e.summary}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
