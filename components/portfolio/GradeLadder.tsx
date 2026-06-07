'use client'

import { useEffect, useState } from 'react'
import type { GradeLadder, GradeLadderTier } from '@/lib/grade/grade-ladder'
import { fetchWithAuth } from '@/lib/fetchWithAuth'

interface Props {
  cardId: string
  currentGrade: string | null
}

const TIERS: { key: keyof GradeLadder; label: string }[] = [
  { key: 'raw', label: 'Raw' },
  { key: 'psa7', label: 'PSA 7' },
  { key: 'psa8', label: 'PSA 8' },
  { key: 'psa9', label: 'PSA 9' },
  { key: 'psa10', label: 'PSA 10' },
]

function gradeLabel(grade: string | null): string {
  if (!grade) return ''
  const n = parseInt(grade, 10)
  if (isNaN(n)) return grade.toLowerCase()
  return `psa${n}`
}

export function GradeLadder({ cardId, currentGrade }: Props) {
  const [ladder, setLadder] = useState<GradeLadder | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fetched, setFetched] = useState(false)

  function load() {
    if (loading || fetched) return
    setLoading(true)
    fetchWithAuth(`/api/portfolio/${cardId}/grade-ladder`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.statusText)))
      .then((d: GradeLadder) => { setLadder(d); setFetched(true) })
      .catch((e: unknown) => setError(String(e)))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [cardId]) // eslint-disable-line react-hooks/exhaustive-deps

  const activeKey = gradeLabel(currentGrade)

  if (loading) {
    return (
      <div className="space-y-1.5">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-7 rounded bg-slate-800 animate-pulse" />
        ))}
      </div>
    )
  }

  if (error) {
    return <p className="text-[10px] font-mono text-red-400">Failed to load price ladder.</p>
  }

  if (!ladder) return null

  const tiers = TIERS.map(({ key, label }) => ({
    label,
    key,
    tier: ladder[key] as GradeLadderTier,
  }))

  const hasAnyData = tiers.some((t) => t.tier.price !== null)

  if (!hasAnyData) {
    return (
      <p className="text-[10px] font-mono text-slate-500">
        Insufficient sold comps to build price ladder.
      </p>
    )
  }

  return (
    <div className="space-y-1">
      {tiers.map(({ label, key, tier }) => {
        const isActive = key === activeKey || (key === 'raw' && !activeKey)
        return (
          <div
            key={key}
            className={`flex items-center gap-2 rounded px-2 py-1.5 text-[11px] font-mono transition-colors ${
              isActive ? 'bg-amber-500/10 border border-amber-400/30' : 'bg-slate-800/40 border border-transparent'
            }`}
          >
            <span className={`w-12 flex-shrink-0 ${isActive ? 'text-amber-400 font-semibold' : 'text-slate-400'}`}>
              {label}
            </span>
            <span className="flex-1 text-slate-100 tabular-nums">
              {tier.price !== null ? `$${tier.price.toFixed(0)}` : '—'}
            </span>
            {tier.premium !== null && (
              <span className="text-indigo-400 tabular-nums">{tier.premium}×</span>
            )}
            {tier.compCount > 0 && (
              <span className="text-slate-600 text-[9px]">{tier.compCount} sales</span>
            )}
          </div>
        )
      })}
    </div>
  )
}
