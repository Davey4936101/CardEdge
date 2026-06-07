'use client'

import { useEffect, useState } from 'react'
import { X, ExternalLink } from 'lucide-react'
import type { PortfolioCard } from '@/lib/portfolio/types'
import { resolveCurrentValue, unrealizedPnl } from '@/lib/portfolio/pnl'
import { computeSellSignal } from '@/lib/portfolio/sell-signal'
import { fetchWithAuth } from '@/lib/fetchWithAuth'
import { PriceSparkline } from './PriceSparkline'
import { LifecycleTimeline } from './LifecycleTimeline'
import { GradeLadder } from './GradeLadder'

interface PricePoint { price: number; date: string }
type AdvanceMode = null | 'submit' | 'grade' | 'sell'

interface Props {
  card: PortfolioCard
  onUpdate: (c: PortfolioCard) => void
  onDelete: (id: string) => void
  onClose: () => void
}

export function DetailPanel({ card, onUpdate, onDelete, onClose }: Props) {
  const [history, setHistory] = useState<PricePoint[]>([])
  const [advanceMode, setAdvanceMode] = useState<AdvanceMode>(null)
  const [overrideVal, setOverrideVal] = useState(card.current_value_override?.toString() ?? '')
  const [notesVal, setNotesVal] = useState(card.notes ?? '')

  useEffect(() => {
    setOverrideVal(card.current_value_override?.toString() ?? '')
    setNotesVal(card.notes ?? '')
    setAdvanceMode(null)
  }, [card.id, card.current_value_override, card.notes])

  useEffect(() => {
    void fetchWithAuth(`/api/portfolio/${card.id}/price-history`)
      .then((r) => r.json())
      .then((d: unknown) => setHistory(Array.isArray(d) ? (d as PricePoint[]) : []))
  }, [card.id, card.card_key])

  const pnl = unrealizedPnl(card)
  const value = resolveCurrentValue(card)

  async function patch(body: Record<string, unknown>) {
    const res = await fetchWithAuth(`/api/portfolio/${card.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    onUpdate((await res.json()) as PortfolioCard)
  }

  async function handleAdvance(mode: 'submit' | 'grade' | 'sell', payload: Record<string, unknown>) {
    if (mode === 'submit') await patch({ status: 'submitted', submitted_at: payload.date })
    if (mode === 'grade') await patch({ status: 'graded_owned', received_grade: payload.grade, received_at: payload.date })
    if (mode === 'sell') await patch({ status: 'sold', sold_price: payload.price, sold_at: payload.date })
    setAdvanceMode(null)
  }

  return (
    <div className="h-full flex flex-col bg-slate-900 border-l border-slate-800 overflow-y-auto">
      {/* Header */}
      <div className="flex items-start justify-between p-4 border-b border-slate-800">
        <div>
          <p className="text-sm font-mono font-semibold text-slate-100">{card.player}</p>
          <p className="text-xs font-mono text-slate-400">{card.set_name}{card.year ? ` · ${card.year}` : ''}</p>
          {card.grade && (
            <span className="inline-block mt-1 text-[11px] font-mono font-semibold text-amber-400 border border-amber-400/50 px-1.5 py-0.5 rounded">
              {card.grade}
            </span>
          )}
        </div>
        <button onClick={onClose} className="text-slate-500 hover:text-slate-300 mt-0.5"><X className="size-4" /></button>
      </div>

      <div className="flex-1 p-4 space-y-6 overflow-y-auto">
        {/* Sell Signal */}
        {(() => {
          const sig = computeSellSignal(card)
          return (
            <div className={`rounded-lg border px-3 py-2.5 ${
              sig.signal === 'SELL NOW' ? 'border-emerald-500/30 bg-emerald-500/10' :
              sig.signal === 'SELL SOON' ? 'border-amber-500/30 bg-amber-500/10' :
              sig.signal === 'ACCUMULATE' ? 'border-indigo-500/30 bg-indigo-500/10' :
              'border-slate-700 bg-slate-800/40'
            }`}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">Signal</span>
                <span className={`text-xs font-mono font-bold ${sig.color}`}>{sig.signal}</span>
              </div>
              <p className="text-[10px] text-slate-400 leading-relaxed">{sig.reason}</p>
            </div>
          )
        })()}
        {/* Value summary */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-[10px] font-mono text-slate-500 uppercase">COST BASIS</p>
            <p className="text-sm font-mono tabular-nums text-slate-100">${card.raw_purchase_price.toFixed(2)}</p>
          </div>
          <div>
            <p className="text-[10px] font-mono text-slate-500 uppercase">CURRENT VALUE</p>
            <p className="text-sm font-mono tabular-nums text-slate-100">
              {value !== null ? `$${value.toFixed(2)}` : '—'}
              {card.current_value_override !== null && <span className="text-amber-400 text-[10px] ml-1">📌</span>}
            </p>
          </div>
          {pnl && (
            <div className="col-span-2">
              <p className="text-[10px] font-mono text-slate-500 uppercase">UNREALIZED P&L</p>
              <p className={`text-sm font-mono tabular-nums font-semibold ${pnl.amount >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {pnl.amount >= 0 ? '+' : ''}${pnl.amount.toFixed(2)} ({pnl.amount >= 0 ? '+' : ''}{pnl.pct.toFixed(1)}%)
              </p>
            </div>
          )}
        </div>

        {/* Sparkline */}
        <div>
          <p className="text-[10px] font-mono text-slate-500 uppercase mb-2">MARKET PRICE · 90D</p>
          <PriceSparkline data={history} />
        </div>

        {/* Grade Price Ladder */}
        <div>
          <p className="text-[10px] font-mono text-slate-500 uppercase mb-2">GRADE PRICE LADDER</p>
          <GradeLadder cardId={card.id} currentGrade={card.grade} />
        </div>

        {/* Lifecycle */}
        <div>
          <p className="text-[10px] font-mono text-slate-500 uppercase mb-3">LIFECYCLE</p>
          {advanceMode === null
            ? <LifecycleTimeline card={card} onAdvance={setAdvanceMode} />
            : <AdvanceForm mode={advanceMode} onSubmit={handleAdvance} onCancel={() => setAdvanceMode(null)} />
          }
        </div>

        {/* Source */}
        {card.source !== 'manual' && (
          <div>
            <p className="text-[10px] font-mono text-slate-500 uppercase mb-1">SOURCE</p>
            <a
              href={card.source === 'alert' ? '/deals' : '/grade'}
              className="flex items-center gap-1 text-xs font-mono text-amber-400 hover:text-amber-300"
            >
              {card.source === 'alert' ? 'From Deal Alert' : 'From Pre-Grade Analysis'}
              <ExternalLink className="size-3" />
            </a>
          </div>
        )}

        {/* Value override */}
        <div>
          <p className="text-[10px] font-mono text-slate-500 uppercase mb-1">VALUE OVERRIDE</p>
          <div className="flex gap-2">
            <input
              type="number" step="0.01" value={overrideVal}
              onChange={(e) => setOverrideVal(e.target.value)}
              placeholder="Market value"
              className="flex-1 bg-slate-800 border border-slate-700 text-slate-100 text-xs font-mono px-2 py-1.5 rounded focus:outline-none focus:border-amber-400"
            />
            <button
              onClick={() => void patch({ current_value_override: overrideVal === '' ? null : parseFloat(overrideVal) })}
              className="text-[11px] font-mono text-amber-400 border border-amber-400/40 hover:border-amber-400 px-2 py-1.5 rounded"
            >
              SET
            </button>
            {card.current_value_override !== null && (
              <button
                onClick={() => { setOverrideVal(''); void patch({ current_value_override: null }) }}
                className="text-[11px] font-mono text-slate-500 hover:text-slate-300 px-2"
              >
                RESET
              </button>
            )}
          </div>
        </div>

        {/* Notes */}
        <div>
          <p className="text-[10px] font-mono text-slate-500 uppercase mb-1">NOTES</p>
          <textarea
            value={notesVal} onChange={(e) => setNotesVal(e.target.value)}
            onBlur={() => void patch({ notes: notesVal || null })}
            rows={3}
            className="w-full bg-slate-800 border border-slate-700 text-slate-100 text-xs font-mono px-2 py-1.5 rounded focus:outline-none focus:border-amber-400 resize-none"
            placeholder="Add notes…"
          />
        </div>
      </div>

      {/* Delete */}
      <div className="p-4 border-t border-slate-800 flex-shrink-0">
        <button
          onClick={() => { if (confirm('Remove this position?')) onDelete(card.id) }}
          className="w-full text-[11px] font-mono text-red-400 border border-red-400/30 hover:border-red-400 py-1.5 rounded transition-colors"
        >
          REMOVE POSITION
        </button>
      </div>
    </div>
  )
}

function AdvanceForm({ mode, onSubmit, onCancel }: {
  mode: 'submit' | 'grade' | 'sell'
  onSubmit: (mode: 'submit' | 'grade' | 'sell', payload: Record<string, unknown>) => void
  onCancel: () => void
}) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [grade, setGrade] = useState('')
  const [price, setPrice] = useState('')
  const inputCls = 'w-full bg-slate-900 border border-slate-700 text-slate-100 text-xs font-mono px-2 py-1.5 rounded focus:outline-none focus:border-amber-400'

  return (
    <div className="space-y-3 p-3 bg-slate-800 rounded border border-slate-700">
      <p className="text-[11px] font-mono text-amber-400 uppercase">
        {mode === 'submit' ? 'Mark as Submitted' : mode === 'grade' ? 'Enter Received Grade' : 'Record Sale'}
      </p>
      {mode === 'grade' && (
        <div>
          <label className="text-[10px] font-mono text-slate-500">PSA GRADE</label>
          <input type="number" min={1} max={10} value={grade} onChange={(e) => setGrade(e.target.value)} className={`mt-1 ${inputCls}`} placeholder="e.g. 9" />
        </div>
      )}
      {mode === 'sell' && (
        <div>
          <label className="text-[10px] font-mono text-slate-500">SALE PRICE ($)</label>
          <input type="number" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} className={`mt-1 ${inputCls}`} placeholder="e.g. 250.00" />
        </div>
      )}
      <div>
        <label className="text-[10px] font-mono text-slate-500">DATE</label>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={`mt-1 ${inputCls}`} />
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => {
            const p: Record<string, unknown> = { date }
            if (mode === 'grade') p.grade = parseInt(grade, 10)
            if (mode === 'sell') p.price = parseFloat(price)
            onSubmit(mode, p)
          }}
          className="flex-1 text-[11px] font-mono font-semibold text-slate-950 bg-amber-400 hover:bg-amber-300 py-1.5 rounded"
        >
          CONFIRM
        </button>
        <button onClick={onCancel} className="text-[11px] font-mono text-slate-400 hover:text-slate-200 px-3">
          CANCEL
        </button>
      </div>
    </div>
  )
}
