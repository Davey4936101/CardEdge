'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { TrendingUp } from 'lucide-react'
import type { PortfolioCard } from '@/lib/portfolio/types'
import { realizedPnl, unrealizedPnl, resolveCurrentValue } from '@/lib/portfolio/pnl'

function daysHeld(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86_400_000)
}

function usd(n: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n)
}

function KpiTile({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <p className="text-[10px] font-mono uppercase tracking-widest text-slate-500 mb-1">{label}</p>
      <p className={`text-xl font-bold font-mono tabular-nums ${color ?? 'text-slate-100'}`}>{value}</p>
      {sub && <p className="text-xs text-slate-500 mt-0.5">{sub}</p>}
    </div>
  )
}

type CardRow = {
  card: PortfolioCard
  pnlAmt: number
  pnlPct: number
  days: number
  currentValue: number | null
  isRealized: boolean
}

type SortKey = 'player' | 'pnl_amt' | 'pnl_pct' | 'days'

const STATUS_LABEL: Record<string, string> = {
  raw_owned: 'RAW', submitted: 'SUBMITTED', graded_owned: 'GRADED', sold: 'SOLD',
}
const STATUS_COLOR: Record<string, string> = {
  raw_owned: 'text-blue-400 border-blue-400/40',
  submitted: 'text-amber-400 border-amber-400/40',
  graded_owned: 'text-green-400 border-green-400/40',
  sold: 'text-slate-500 border-slate-700',
}

export default function PerformancePage() {
  const [cards, setCards] = useState<PortfolioCard[] | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>('pnl_pct')
  const [sortAsc, setSortAsc] = useState(false)

  useEffect(() => {
    void fetch('/api/portfolio')
      .then((r) => (r.ok ? r.json() : []))
      .then((d: PortfolioCard[]) => setCards(Array.isArray(d) ? d : []))
  }, [])

  if (cards === null) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="h-8 bg-slate-800 rounded animate-pulse w-48 mb-2" />
        <div className="h-4 bg-slate-800 rounded animate-pulse w-72 mb-8" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-24 rounded-xl bg-slate-800 animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  if (cards.length === 0) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-slate-100">Performance</h1>
          <p className="text-sm text-slate-400 mt-1">P&L, IRR, and return breakdowns across your portfolio.</p>
        </div>
        <div className="flex flex-col items-center justify-center py-24 border border-dashed border-slate-800 rounded-xl text-center gap-3">
          <TrendingUp className="size-10 text-slate-700" />
          <p className="text-sm font-medium text-slate-400">No portfolio positions yet</p>
          <p className="text-xs text-slate-600">Add cards to your portfolio to see performance analytics.</p>
          <Link
            href="/portfolio"
            className="text-xs font-semibold text-indigo-400 hover:text-indigo-300 border border-indigo-800 hover:border-indigo-600 px-4 py-2 rounded-lg transition-colors mt-1"
          >
            Go to Portfolio →
          </Link>
        </div>
      </div>
    )
  }

  const rows: CardRow[] = cards.map((card) => {
    const r = realizedPnl(card)
    const u = unrealizedPnl(card)
    const pnl = r ?? u
    return {
      card,
      pnlAmt: pnl?.amount ?? 0,
      pnlPct: pnl?.pct ?? 0,
      days: daysHeld(card.sold_at ?? card.raw_purchase_date),
      currentValue: resolveCurrentValue(card),
      isRealized: card.status === 'sold',
    }
  })

  const unrealizedRows = rows.filter((r) => !r.isRealized)
  const realizedRows = rows.filter((r) => r.isRealized)

  const totalRealized = realizedRows.reduce((s, r) => s + r.pnlAmt, 0)
  const totalUnrealized = unrealizedRows.reduce((s, r) => s + r.pnlAmt, 0)

  const soldRows = realizedRows.filter((r) => r.days > 0)
  const avgDays = soldRows.length > 0
    ? soldRows.reduce((s, r) => s + r.days, 0) / soldRows.length
    : 0

  const totalCostBasis = cards.reduce((s, c) => s + c.raw_purchase_price, 0)
  const totalReturnPct = totalCostBasis > 0
    ? ((totalRealized + totalUnrealized) / totalCostBasis) * 100
    : 0
  const irr = avgDays > 0
    ? (Math.pow(1 + totalReturnPct / 100, 365 / avgDays) - 1) * 100
    : null
  const winnersCount = rows.filter((r) => r.pnlAmt > 0).length

  function sortRows(arr: CardRow[]) {
    return [...arr].sort((a, b) => {
      let cmp = 0
      if (sortKey === 'player') cmp = a.card.player.localeCompare(b.card.player)
      else if (sortKey === 'pnl_amt') cmp = a.pnlAmt - b.pnlAmt
      else if (sortKey === 'pnl_pct') cmp = a.pnlPct - b.pnlPct
      else if (sortKey === 'days') cmp = a.days - b.days
      return sortAsc ? cmp : -cmp
    })
  }

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortAsc((a) => !a)
    else { setSortKey(key); setSortAsc(false) }
  }

  const playerMap = new Map<string, CardRow[]>()
  for (const row of rows) {
    const key = row.card.player || 'Unknown'
    if (!playerMap.has(key)) playerMap.set(key, [])
    playerMap.get(key)!.push(row)
  }
  const playerGroups = Array.from(playerMap.entries())
    .map(([player, r]) => ({ player, rows: r, totalPnl: r.reduce((s, x) => s + x.pnlAmt, 0) }))
    .sort((a, b) => b.totalPnl - a.totalPnl)

  function Th({ k, label }: { k: SortKey; label: string }) {
    const active = sortKey === k
    return (
      <th
        onClick={() => handleSort(k)}
        className={`text-left text-[10px] font-mono uppercase tracking-wider px-3 py-2.5 cursor-pointer select-none whitespace-nowrap ${
          active ? 'text-indigo-400' : 'text-slate-500 hover:text-slate-300'
        }`}
      >
        {label}{active ? (sortAsc ? ' ↑' : ' ↓') : ''}
      </th>
    )
  }

  function PnlAmtCell({ amt }: { amt: number }) {
    return (
      <span className={`font-mono tabular-nums text-xs ${amt >= 0 ? 'text-green-400' : 'text-red-400'}`}>
        {amt >= 0 ? '+' : ''}{usd(amt)}
      </span>
    )
  }

  function PnlPctCell({ p }: { p: number }) {
    return (
      <span className={`font-mono tabular-nums text-xs ${p >= 0 ? 'text-green-400' : 'text-red-400'}`}>
        {p >= 0 ? '+' : ''}{p.toFixed(1)}%
      </span>
    )
  }

  function RowEl({ row }: { row: CardRow }) {
    const { card, pnlAmt, pnlPct, days, currentValue } = row
    return (
      <tr className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
        <td className="px-3 py-2.5">
          <p className="text-xs font-mono text-slate-100">{card.player}</p>
          <p className="text-[10px] font-mono text-slate-500">
            {card.set_name}{card.year ? ` ${card.year}` : ''}
          </p>
        </td>
        <td className="px-3 py-2.5">
          <span className={`text-[10px] font-mono border px-1 py-0.5 rounded ${
            card.grade ? 'text-amber-400 border-amber-400/40' : 'text-slate-500 border-slate-700'
          }`}>
            {card.grade ?? 'RAW'}
          </span>
        </td>
        <td className="px-3 py-2.5">
          <span className={`text-[10px] font-mono border px-1.5 py-0.5 rounded ${STATUS_COLOR[card.status]}`}>
            {STATUS_LABEL[card.status]}
          </span>
        </td>
        <td className="px-3 py-2.5 font-mono tabular-nums text-xs text-slate-300">
          {usd(card.raw_purchase_price)}
        </td>
        <td className="px-3 py-2.5 font-mono tabular-nums text-xs text-slate-300">
          {currentValue !== null ? usd(currentValue) : <span className="text-slate-600">—</span>}
        </td>
        <td className="px-3 py-2.5"><PnlAmtCell amt={pnlAmt} /></td>
        <td className="px-3 py-2.5"><PnlPctCell p={pnlPct} /></td>
        <td className="px-3 py-2.5 font-mono tabular-nums text-xs text-slate-500">{days}d</td>
      </tr>
    )
  }

  function PositionTable({ title, tableRows }: { title: string; tableRows: CardRow[] }) {
    return (
      <section className="mb-8">
        <h2 className="text-sm font-semibold text-slate-100 mb-3">{title}</h2>
        <div className="rounded-xl border border-slate-800 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-slate-800 bg-slate-900/80">
                <tr>
                  <Th k="player" label="Card" />
                  <th className="text-left text-[10px] font-mono uppercase tracking-wider px-3 py-2.5 text-slate-500">Grade</th>
                  <th className="text-left text-[10px] font-mono uppercase tracking-wider px-3 py-2.5 text-slate-500">Status</th>
                  <th className="text-left text-[10px] font-mono uppercase tracking-wider px-3 py-2.5 text-slate-500">Cost</th>
                  <th className="text-left text-[10px] font-mono uppercase tracking-wider px-3 py-2.5 text-slate-500">Value</th>
                  <Th k="pnl_amt" label="P&L $" />
                  <Th k="pnl_pct" label="P&L %" />
                  <Th k="days" label="Days" />
                </tr>
              </thead>
              <tbody>
                {sortRows(tableRows).map((row) => (
                  <RowEl key={row.card.id} row={row} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-100">Performance</h1>
        <p className="text-sm text-slate-400 mt-1">P&L, IRR, and return breakdowns across your portfolio.</p>
      </div>

      {/* KPI bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <KpiTile
          label="Realized P&L"
          value={usd(totalRealized)}
          color={totalRealized >= 0 ? 'text-green-400' : 'text-red-400'}
          sub={`${realizedRows.length} sold card${realizedRows.length !== 1 ? 's' : ''}`}
        />
        <KpiTile
          label="Unrealized P&L"
          value={usd(totalUnrealized)}
          color={totalUnrealized >= 0 ? 'text-green-400' : 'text-red-400'}
          sub={`${unrealizedRows.length} active position${unrealizedRows.length !== 1 ? 's' : ''}`}
        />
        <KpiTile
          label="Portfolio IRR"
          value={irr !== null ? `${irr >= 0 ? '+' : ''}${irr.toFixed(1)}%` : '—'}
          color={irr !== null ? (irr >= 0 ? 'text-green-400' : 'text-red-400') : 'text-slate-500'}
          sub={avgDays > 0 ? `${avgDays.toFixed(0)}d avg hold` : 'Sell cards to calculate'}
        />
        <KpiTile
          label="Win Rate"
          value={`${winnersCount} / ${rows.length}`}
          sub={rows.length > 0 ? `${((winnersCount / rows.length) * 100).toFixed(0)}% profitable` : 'No cards yet'}
        />
      </div>

      {/* Tables */}
      {unrealizedRows.length > 0 && (
        <PositionTable title="Unrealized Positions" tableRows={unrealizedRows} />
      )}
      {realizedRows.length > 0 && (
        <PositionTable title="Realized (Sold)" tableRows={realizedRows} />
      )}

      {/* Player breakdown */}
      <section>
        <h2 className="text-sm font-semibold text-slate-100 mb-3">By Player</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {playerGroups.map(({ player, rows: pRows, totalPnl }) => (
            <div key={player} className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
              <div className="flex items-start justify-between gap-2 mb-1.5">
                <p className="text-sm font-semibold text-slate-100">{player}</p>
                <span className={`font-mono tabular-nums text-sm font-bold ${totalPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {totalPnl >= 0 ? '+' : ''}{usd(totalPnl)}
                </span>
              </div>
              <p className="text-xs text-slate-500">
                {pRows.length} card{pRows.length !== 1 ? 's' : ''} · {pRows.filter((r) => r.isRealized).length} sold
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
