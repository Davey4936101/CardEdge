'use client'

import { useCallback, useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import type { PortfolioSummary } from '@/lib/portfolio/types'
import type { PortfolioCard } from '@/lib/portfolio/types'
import { resolveCurrentValue, unrealizedPnl, realizedPnl } from '@/lib/portfolio/pnl'
import { fetchWithAuth } from '@/lib/fetchWithAuth'

function usd(n: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD',
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(n)
}

function pct(n: number) {
  return `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`
}

function exportCsv(cards: PortfolioCard[]) {
  const headers = ['Player', 'Set', 'Year', 'Grade', 'Status', 'Cost Basis', 'Current Value', 'P&L $', 'P&L %', 'Days Held', 'Purchased', 'Notes']
  const rows = cards.map(c => {
    const val = resolveCurrentValue(c)
    const pnl = unrealizedPnl(c) ?? realizedPnl(c)
    const days = Math.floor((Date.now() - new Date(c.raw_purchase_date).getTime()) / 86_400_000)
    return [
      c.player, c.set_name, c.year ?? '', c.grade ?? 'RAW', c.status,
      c.raw_purchase_price.toFixed(2), val?.toFixed(2) ?? '',
      pnl?.amount.toFixed(2) ?? '', pnl?.pct.toFixed(1) ?? '', days,
      c.raw_purchase_date, c.notes ?? '',
    ]
  })
  const csv = [headers, ...rows]
    .map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
    .join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `cardedge-portfolio-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

interface Props {
  onAdd: () => void
  onRefresh?: () => void
  cards?: PortfolioCard[]
}

export function PortfolioKpiBar({ onAdd, onRefresh, cards }: Props) {
  const [summary, setSummary] = useState<PortfolioSummary | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshMsg, setRefreshMsg] = useState<string | null>(null)

  const load = useCallback(async () => {
    const res = await fetchWithAuth('/api/portfolio/summary')
    if (res.ok) setSummary((await res.json()) as PortfolioSummary)
  }, [])

  useEffect(() => { void load() }, [load])

  const pnlColor = !summary || summary.unrealizedPnl >= 0 ? 'text-green-400' : 'text-red-400'

  async function handleRefresh() {
    setRefreshing(true)
    try {
      const res = await fetch('/api/portfolio/refresh-prices', { method: 'POST' })
      if (res.ok) {
        const { updated } = (await res.json()) as { updated: number }
        setRefreshMsg(`Refreshed ${updated} card${updated !== 1 ? 's' : ''}`)
        setTimeout(() => setRefreshMsg(null), 3000)
        onRefresh?.()
        void load()
      }
    } finally {
      setRefreshing(false)
    }
  }

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
      <div className="flex-shrink-0 flex items-center gap-2">
        {refreshMsg && (
          <span className="text-[10px] font-mono text-emerald-400">{refreshMsg}</span>
        )}
        <button
          onClick={() => void handleRefresh()}
          disabled={refreshing}
          title="Refresh prices from eBay"
          className="flex items-center gap-1.5 text-[10px] font-mono text-slate-400 hover:text-slate-200 border border-slate-700 hover:border-slate-500 px-2.5 py-1.5 rounded transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`size-3 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh Prices
        </button>
        {cards && cards.length > 0 && (
          <button
            onClick={() => exportCsv(cards)}
            className="text-[10px] font-mono text-slate-400 hover:text-slate-200 border border-slate-700 hover:border-slate-500 px-2.5 py-1.5 rounded transition-colors"
          >
            Export CSV
          </button>
        )}
        <button
          onClick={onAdd}
          className="text-xs font-mono font-semibold text-slate-950 bg-amber-400 hover:bg-amber-300 px-3 py-1.5 rounded transition-colors"
        >
          + ADD POSITION
        </button>
      </div>
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
