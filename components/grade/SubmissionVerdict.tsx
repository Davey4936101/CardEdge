// components/grade/SubmissionVerdict.tsx
import type { GradeAnalysisRow } from '@/lib/grade/types'

const TIER_LABEL: Record<string, string> = {
  regular: 'Regular ($25 · ~45 days)',
  express: 'Express ($150 · ~5 days)',
  superExpress: 'Super Express ($500 · ~2 days)',
}

function fmt(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
}
function fmtPct(n: number) {
  return `${Math.round(n * 100)}%`
}

interface Props {
  result: GradeAnalysisRow
  onTrack?: () => void
}

export function SubmissionVerdict({ result, onTrack }: Props) {
  const rec = result.recommendation
  const epRegular = result.ep_regular ?? 0
  const evRegular = result.ev_regular ?? 0
  const breakEvenGrade = result.break_even_grade
  const breakEvenProb  = result.break_even_prob ?? 0

  const verdictColour =
    rec === 'grade'     ? 'bg-emerald-50 border-emerald-300 dark:bg-emerald-900/20 dark:border-emerald-700' :
    rec === 'uncertain' ? 'bg-amber-50 border-amber-300 dark:bg-amber-900/20 dark:border-amber-700'         :
                          'bg-red-50 border-red-300 dark:bg-red-900/20 dark:border-red-700'
  const verdictText =
    rec === 'grade'     ? '✓ Submit' :
    rec === 'uncertain' ? '~ Borderline' : '✕ Skip'
  const verdictDesc =
    rec === 'grade'
      ? `Expected profit of ${fmt(epRegular)} at Regular tier. Break-even at PSA ${breakEvenGrade} or better (${fmtPct(breakEvenProb)} probability).`
      : rec === 'uncertain'
      ? `Marginal expected profit. Break-even at PSA ${breakEvenGrade} (${fmtPct(breakEvenProb)} probability). Consider only if you have high confidence in condition.`
      : `Expected value (${fmt(evRegular)}) does not exceed total cost after grading fees. Skip submission.`

  return (
    <div className="space-y-4">
      {/* Main verdict */}
      <div className={`rounded-xl border p-5 space-y-2 ${verdictColour}`}>
        <div className="flex items-center justify-between">
          <span className="text-xl font-bold">{verdictText}</span>
          {onTrack && rec !== 'skip' && (
            <button
              onClick={onTrack}
              className="text-sm text-indigo-500 hover:underline"
            >
              Add to portfolio
            </button>
          )}
        </div>
        <p className="text-sm text-slate-600 dark:text-slate-300">{verdictDesc}</p>
      </div>

      {/* EV table by tier */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 divide-y divide-slate-200 dark:divide-slate-700">
        {[
          { label: TIER_LABEL.regular,      ev: result.ev_regular,      ep: result.ep_regular      },
          { label: TIER_LABEL.express,      ev: result.ev_express,      ep: result.ep_express      },
          { label: TIER_LABEL.superExpress, ev: result.ev_super_express, ep: result.ep_super_express },
        ].map(({ label, ev, ep }) => (
          <div key={label} className="flex justify-between px-4 py-3 text-sm">
            <span className="text-slate-600 dark:text-slate-400">{label}</span>
            <span className={`font-medium ${(ep ?? 0) > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}`}>
              {fmt(ep ?? 0)} expected profit
            </span>
          </div>
        ))}
      </div>

      {/* PSA Population */}
      {result.pop_total !== undefined && result.pop_total > 0 && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 space-y-2">
          <p className="text-sm font-medium">PSA Population</p>
          <div className="grid grid-cols-4 gap-2 text-center">
            {([10, 9, 8, 7] as const).map((grade) => {
              const count = grade === 10 ? result.pop_count_10 :
                            grade === 9  ? result.pop_count_9  :
                            grade === 8  ? result.pop_count_8  : result.pop_count_7
              return (
                <div key={grade} className="space-y-0.5">
                  <div className="text-lg font-bold">{count ?? '—'}</div>
                  <div className="text-xs text-slate-500">PSA {grade}</div>
                </div>
              )
            })}
          </div>
          {result.pop_gem_rate !== undefined && (
            <p className="text-xs text-slate-500 text-center">
              Gem rate: {fmtPct(result.pop_gem_rate)} of {result.pop_total.toLocaleString()} submitted
            </p>
          )}
        </div>
      )}
    </div>
  )
}
