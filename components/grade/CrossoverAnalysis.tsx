// components/grade/CrossoverAnalysis.tsx
'use client'

import { useState } from 'react'

interface SubGrades {
  centering: number
  corners: number
  edges: number
  surface: number
}

interface CrossoverResult {
  crossoverProbability: number
  evKeepBgs: number
  evCrossover: number
  evCrackRaw: number
  recommendation: 'keep' | 'crossover' | 'crack'
  comps: { psa10: number; psa9: number }
}

const REC_LABEL: Record<CrossoverResult['recommendation'], string> = {
  keep:       '→ Keep the BGS slab',
  crossover:  '→ Submit for PSA crossover',
  crack:      '→ Crack and resubmit raw to PSA',
}

const REC_COLOUR: Record<CrossoverResult['recommendation'], string> = {
  keep:      'bg-slate-800/60 border-slate-700',
  crossover: 'bg-emerald-900/30 border-emerald-700',
  crack:     'bg-amber-900/20 border-amber-700',
}

function fmt(n: number) {
  if (n === 0) return '—'
  const sign = n >= 0 ? '+' : ''
  return `${sign}$${Math.abs(Math.round(n))}`
}

function SubInput({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (v: number) => void
}) {
  return (
    <div className="space-y-1">
      <label className="block text-xs font-medium text-slate-400">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
      >
        {[10, 9.5, 9, 8.5, 8, 7.5, 7].map((v) => (
          <option key={v} value={v}>{v}</option>
        ))}
      </select>
    </div>
  )
}

interface Props {
  initialCardTitle?: string
}

export function CrossoverAnalysis({ initialCardTitle }: Props) {
  const [cardTitle, setCardTitle] = useState(initialCardTitle ?? '')
  const [subs, setSubs] = useState<SubGrades>({ centering: 9.5, corners: 9.5, edges: 9.5, surface: 9.5 })
  const [bgsSaleValue, setBgsSaleValue] = useState('')
  const [result, setResult] = useState<CrossoverResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function setSub(key: keyof SubGrades, value: number) {
    setSubs((prev) => ({ ...prev, [key]: value }))
  }

  async function analyze() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/grade/crossover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cardTitle: cardTitle || undefined,
          centeringSub: subs.centering,
          cornersSub:   subs.corners,
          edgesSub:     subs.edges,
          surfaceSub:   subs.surface,
          bgsSaleValue: bgsSaleValue ? Number(bgsSaleValue) : undefined,
        }),
      })
      const data = (await res.json()) as CrossoverResult & { error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Analysis failed')
      setResult(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analysis failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Input form */}
      <div className="rounded-xl border border-slate-700 p-6 space-y-5">
        <h2 className="font-semibold text-slate-100">BGS Sub-Grades</h2>

        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1">Card (optional — for market comps)</label>
          <input
            type="text"
            value={cardTitle}
            onChange={(e) => setCardTitle(e.target.value)}
            placeholder="e.g. 2018 Panini Prizm Patrick Mahomes #168"
            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <SubInput label="Centering" value={subs.centering} onChange={(v) => setSub('centering', v)} />
          <SubInput label="Corners"   value={subs.corners}   onChange={(v) => setSub('corners',   v)} />
          <SubInput label="Edges"     value={subs.edges}     onChange={(v) => setSub('edges',     v)} />
          <SubInput label="Surface"   value={subs.surface}   onChange={(v) => setSub('surface',   v)} />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1">Current BGS sale value (optional)</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">$</span>
            <input
              type="number"
              value={bgsSaleValue}
              onChange={(e) => setBgsSaleValue(e.target.value)}
              placeholder="e.g. 250"
              className="w-full pl-7 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
        </div>

        <button
          onClick={() => void analyze()}
          disabled={loading}
          className="w-full py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-900 text-white text-sm font-semibold transition-colors"
        >
          {loading ? 'Analyzing…' : 'Analyze Crossover'}
        </button>

        {error && <p className="text-sm text-red-400">{error}</p>}
      </div>

      {/* Results */}
      {result && (
        <div className="space-y-4">
          {/* Crossover probability */}
          <div className="flex items-center justify-between rounded-xl border border-slate-700 p-4">
            <span className="text-sm font-medium text-slate-300">PSA 10 Crossover Probability</span>
            <span className="text-2xl font-bold text-slate-100">
              {Math.round(result.crossoverProbability * 100)}%
            </span>
          </div>

          {/* 3-way EV table */}
          <div className="rounded-xl border border-slate-700 divide-y divide-slate-700">
            {[
              { label: 'Keep BGS slab',           ev: result.evKeepBgs,   key: 'keep'      as const },
              { label: 'PSA crossover (Express)', ev: result.evCrossover, key: 'crossover' as const },
              { label: 'Crack + resubmit raw',    ev: result.evCrackRaw,  key: 'crack'     as const },
            ].map(({ label, ev, key }) => (
              <div
                key={key}
                className={`flex justify-between items-center px-4 py-3 text-sm ${result.recommendation === key ? 'bg-indigo-900/20' : ''}`}
              >
                <span className="text-slate-300">{label}</span>
                <span className={`font-bold tabular-nums ${ev > 0 ? 'text-emerald-400' : ev < 0 ? 'text-red-400' : 'text-slate-400'}`}>
                  {fmt(ev)}
                </span>
              </div>
            ))}
          </div>

          {/* Recommendation */}
          <div className={`rounded-xl border p-4 ${REC_COLOUR[result.recommendation]}`}>
            <p className="font-semibold text-slate-100">{REC_LABEL[result.recommendation]}</p>
            {result.comps.psa10 > 0 && (
              <p className="text-xs text-slate-400 mt-1">
                Market comps: PSA 10 ${result.comps.psa10.toFixed(0)} · PSA 9 ${result.comps.psa9.toFixed(0)}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
