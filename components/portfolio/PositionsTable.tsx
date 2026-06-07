'use client'

import { useState } from 'react'
import type { PortfolioCard } from '@/lib/portfolio/types'
import { resolveCurrentValue, unrealizedPnl } from '@/lib/portfolio/pnl'
import { computeSellSignal } from '@/lib/portfolio/sell-signal'

const STATUS_LABEL: Record<string, string> = {
  raw_owned: 'RAW', submitted: 'SUBMITTED', graded_owned: 'GRADED', sold: 'SOLD',
}
const STATUS_COLOR: Record<string, string> = {
  raw_owned:    'text-blue-400 border-blue-400/40',
  submitted:    'text-amber-400 border-amber-400/40',
  graded_owned: 'text-green-400 border-green-400/40',
  sold:         'text-slate-500 border-slate-700',
}

type SortKey = 'player' | 'status' | 'raw_purchase_price' | 'value' | 'pnl' | 'age'

function daysHeld(d: string) {
  return Math.floor((Date.now() - new Date(d).getTime()) / 86_400_000)
}

interface Props {
  cards: PortfolioCard[]
  selectedId: string | null
  onSelect: (id: string) => void
  onAdd?: () => void
}

export function PositionsTable({ cards, selectedId, onSelect, onAdd }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('status')
  const [sortAsc, setSortAsc] = useState(true)

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortAsc((a) => !a)
    else { setSortKey(key); setSortAsc(true) }
  }

  const sorted = [...cards].sort((a, b) => {
    let av: number | string = 0, bv: number | string = 0
    if (sortKey === 'player') { av = a.player; bv = b.player }
    else if (sortKey === 'status') { av = a.status; bv = b.status }
    else if (sortKey === 'raw_purchase_price') { av = a.raw_purchase_price; bv = b.raw_purchase_price }
    else if (sortKey === 'value') { av = resolveCurrentValue(a) ?? -Infinity; bv = resolveCurrentValue(b) ?? -Infinity }
    else if (sortKey === 'pnl') { av = unrealizedPnl(a)?.pct ?? -Infinity; bv = unrealizedPnl(b)?.pct ?? -Infinity }
    else if (sortKey === 'age') { av = daysHeld(a.raw_purchase_date); bv = daysHeld(b.raw_purchase_date) }
    const cmp = typeof av === 'string' ? av.localeCompare(bv as string) : (av as number) - (bv as number)
    return sortAsc ? cmp : -cmp
  })

  if (cards.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center gap-3">
        <svg className="size-10 text-slate-700" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <path d="M3 9h18M9 21V9" />
        </svg>
        <div>
          <p className="text-sm font-semibold text-slate-400">No positions yet</p>
          <p className="text-xs text-slate-600 mt-1 max-w-[240px] mx-auto leading-relaxed">
            Add your first card to start tracking ROI and grading opportunities.
          </p>
        </div>
        {onAdd && (
          <button
            onClick={onAdd}
            className="text-xs font-semibold text-slate-950 bg-amber-400 hover:bg-amber-300 px-4 py-2 rounded transition-colors font-mono"
          >
            + ADD CARD
          </button>
        )}
      </div>
    )
  }

  function Th({ k, label }: { k: SortKey; label: string }) {
    const active = sortKey === k
    return (
      <th
        onClick={() => handleSort(k)}
        className={`text-left text-[10px] font-mono uppercase tracking-wider px-3 py-2 cursor-pointer select-none whitespace-nowrap ${active ? 'text-amber-400' : 'text-slate-500 hover:text-slate-300'}`}
      >
        {label}{active ? (sortAsc ? ' ↑' : ' ↓') : ''}
      </th>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead className="border-b border-slate-800 bg-slate-900/80 sticky top-0">
          <tr>
            <Th k="player" label="CARD" />
            <th className="text-left text-[10px] font-mono uppercase tracking-wider px-3 py-2 text-slate-500">GRADE</th>
            <Th k="status" label="STATUS" />
            <Th k="raw_purchase_price" label="COST" />
            <Th k="value" label="VALUE" />
            <Th k="pnl" label="P&L" />
            <th className="text-left text-[10px] font-mono uppercase tracking-wider px-3 py-2 text-slate-500 whitespace-nowrap">SIGNAL</th>
            <Th k="age" label="AGE" />
          </tr>
        </thead>
        <tbody>
          {sorted.map((card) => {
            const value = resolveCurrentValue(card)
            const pnl = unrealizedPnl(card)
            const selected = card.id === selectedId
            return (
              <tr
                key={card.id}
                onClick={() => onSelect(card.id)}
                className={`border-b border-slate-800/50 cursor-pointer transition-colors ${selected ? 'bg-amber-400/5' : 'hover:bg-slate-800/40'}`}
              >
                <td className="px-3 py-2.5">
                  <p className="text-xs font-mono text-slate-100">{card.player}</p>
                  <p className="text-[10px] font-mono text-slate-500">{card.set_name}{card.year ? ` ${card.year}` : ''}</p>
                </td>
                <td className="px-3 py-2.5">
                  <span className={`text-[11px] font-mono font-semibold border px-1 py-0.5 rounded ${card.grade ? 'text-amber-400 border-amber-400/40' : 'text-slate-500 border-slate-700'}`}>
                    {card.grade ?? 'RAW'}
                  </span>
                </td>
                <td className="px-3 py-2.5">
                  <span className={`text-[10px] font-mono border px-1.5 py-0.5 rounded ${STATUS_COLOR[card.status]}`}>
                    {STATUS_LABEL[card.status]}
                  </span>
                </td>
                <td className="px-3 py-2.5 font-mono tabular-nums text-xs text-slate-300">${card.raw_purchase_price.toFixed(2)}</td>
                <td className="px-3 py-2.5 font-mono tabular-nums text-xs text-slate-300">
                  {value !== null ? `$${value.toFixed(2)}` : <span className="text-slate-600">—</span>}
                  {card.current_value_override !== null && <span className="text-amber-400 text-[9px] ml-0.5">●</span>}
                </td>
                <td className="px-3 py-2.5 font-mono tabular-nums text-xs">
                  {pnl ? (
                    <span className={pnl.amount >= 0 ? 'text-green-400' : 'text-red-400'}>
                      {pnl.amount >= 0 ? '+' : ''}{pnl.pct.toFixed(1)}%
                    </span>
                  ) : <span className="text-slate-600">—</span>}
                </td>
                <td className="px-3 py-2.5">
                  {card.status !== 'sold' ? (() => {
                    const sig = computeSellSignal(card)
                    const badgeColor = sig.signal === 'SELL NOW' ? 'text-emerald-400 border-emerald-400/40 bg-emerald-400/10' :
                      sig.signal === 'SELL SOON' ? 'text-amber-400 border-amber-400/40 bg-amber-400/10' :
                      sig.signal === 'ACCUMULATE' ? 'text-indigo-400 border-indigo-400/40' :
                      'text-slate-500 border-slate-700'
                    return <span className={`text-[9px] font-mono font-bold border px-1.5 py-0.5 rounded whitespace-nowrap ${badgeColor}`}>{sig.signal}</span>
                  })() : <span className="text-slate-600 text-[10px] font-mono">—</span>}
                </td>
                <td className="px-3 py-2.5 font-mono text-xs text-slate-500">{daysHeld(card.raw_purchase_date)}d</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
