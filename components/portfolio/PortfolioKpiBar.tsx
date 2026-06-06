'use client'

import { useCallback, useEffect, useState } from 'react'
import type { PortfolioSummary } from '@/lib/portfolio/types'

function usd(n: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD',
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(n)
}

function pct(n: number) {
  return `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`
}

interface Props { onAdd: () => void }

export function PortfolioKpiBar({ onAdd }: Props) {
  const [summary, setSummary] = useState<PortfolioSummary | null>(null)

  const load = useCallback(async () => {
    const res = await fetch('/api/portfolio/summary')
    setSummary((await res.json()) as PortfolioSummary)
  }, [])

  useEffect(() => { void load() }, [load])

  const pnlColor = !summary || summary.unrealizedPnl >= 0 ? 'text-green-400' : 'text-red-400'

  return (
    <div className="flex items-center justify-between gap-4 px-6 py-4 bg-slate-900 border-b border-slate-800 flex-shrink-0">
      <div className="flex items-center gap-8 flex-wrap">
        <Chip label="TOTAL VALUE" value={summary ? usd(summary.portfolioValue) : '—'} />
        <Chip label="COST BASIS" value={summary ? usd(summary.costBasis) : '—'} />
        <Chip
          label="UNREALIZED P&L"
          value={summary ? `${usd(summary.unrealizedPnl)} (${pct(summary.unrealizedPnlPct)})` : '—'}
          valueClass={pnlColor}
        />
        <Chip
          label="REALIZED P&L"
          value={summary ? usd(summary.realizedPnl) : '—'}
          valueClass={summary && summary.realizedPnl >= 0 ? 'text-green-400' : 'text-red-400'}
        />
        {summary && (
          <Chip
            label="POSITIONS"
            value={`${summary.positionCount} · ${summary.statusBreakdown.submitted} sub · ${summary.statusBreakdown.graded_owned} graded`}
          />
        )}
      </div>
      <button
        onClick={onAdd}
        className="flex-shrink-0 text-xs font-mono font-semibold text-slate-950 bg-amber-400 hover:bg-amber-300 px-3 py-1.5 rounded transition-colors"
      >
        + ADD POSITION
      </button>
    </div>
  )
}

function Chip({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div>
      <p className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">{label}</p>
      <p className={`text-sm font-mono tabular-nums font-semibold text-slate-100 ${valueClass ?? ''}`}>{value}</p>
    </div>
  )
}
