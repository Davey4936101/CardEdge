// components/grade/PopVelocityBadge.tsx
'use client'

import { useEffect, useState } from 'react'
import type { PopVelocityResult, PopPressure } from '@/lib/grade/pop-velocity'

const PRESSURE_COLOUR: Record<PopPressure, string> = {
  high:     'border-red-500/40 bg-red-900/20 text-red-300',
  moderate: 'border-amber-500/40 bg-amber-900/20 text-amber-300',
  low:      'border-slate-700 bg-slate-800/40 text-slate-400',
}

const TREND_ICON: Record<string, string> = {
  rising:  '↑',
  stable:  '→',
  falling: '↓',
}

interface Props {
  cardKey: string
}

export function PopVelocityBadge({ cardKey }: Props) {
  const [data, setData] = useState<PopVelocityResult | null | 'loading'>('loading')

  useEffect(() => {
    fetch(`/api/grade/pop-velocity/${encodeURIComponent(cardKey)}`)
      .then((r) => r.json())
      .then((d) => setData(d as PopVelocityResult | null))
      .catch(() => setData(null))
  }, [cardKey])

  if (data === 'loading') {
    return <div className="h-10 rounded-lg bg-slate-800/40 animate-pulse border border-slate-700/40" />
  }
  if (!data) return null

  const cls = PRESSURE_COLOUR[data.popPressure]
  const trendIcon = TREND_ICON[data.gemRateTrend] ?? '→'

  return (
    <div className={`rounded-lg border px-4 py-3 space-y-1 text-sm ${cls}`}>
      <div className="flex items-center justify-between">
        <span className="font-medium">Pop Velocity</span>
        <span className="text-xs font-mono tabular-nums">
          PSA 10: {data.currentPop10} · {trendIcon} gem rate
        </span>
      </div>
      <p className="text-xs opacity-80">{data.message}</p>
    </div>
  )
}
