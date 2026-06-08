// components/grade/SubGradeBreakdown.tsx
import type { GradeAnalysisRow } from '@/lib/grade/types'

const SUBGRADE_LABEL: Record<number, string> = {
  10: 'Gem Mint',
  9: 'Mint',
  8: 'NM-MT',
  7: 'NM',
  6: 'EX-MT',
}

function SubGradeBar({ label, score, notes }: { label: string; score?: number; notes?: string }) {
  if (score === undefined) return null
  const pct = ((score - 6) / 4) * 100  // map 6–10 to 0–100%
  const colour =
    score >= 10 ? 'bg-emerald-500' :
    score >= 9  ? 'bg-blue-500'    :
    score >= 8  ? 'bg-amber-500'   : 'bg-red-500'

  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className="text-slate-500">{score.toFixed(1)} — {SUBGRADE_LABEL[Math.round(score)] ?? ''}</span>
      </div>
      <div className="h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
        <div className={`h-full ${colour} rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
      {notes && <p className="text-xs text-slate-500 dark:text-slate-400">{notes}</p>}
    </div>
  )
}

interface Props {
  result: GradeAnalysisRow
}

export function SubGradeBreakdown({ result }: Props) {
  const centeringNote = result.centering_front_eligible
    ? `${result.centering_front_lr ?? 50}/${100 - (result.centering_front_lr ?? 50)} L/R — PSA 10 eligible`
    : `${result.centering_front_lr ?? 50}/${100 - (result.centering_front_lr ?? 50)} L/R — exceeds 55/45 threshold`

  const cornerWorst = result.corner_worst
    ? ` Worst: ${result.corner_worst.replace('_', ' ')}`
    : ''

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-6 space-y-5">
      <h3 className="font-semibold">Sub-Grade Breakdown</h3>

      <SubGradeBar
        label="Centering"
        score={result.subgrade_centering}
        notes={centeringNote}
      />
      <SubGradeBar
        label="Corners"
        score={result.subgrade_corners}
        notes={(result.attribute_details?.find((a) => a.attribute === 'corners')?.notes ?? '') + cornerWorst || undefined}
      />
      <SubGradeBar
        label="Edges"
        score={result.subgrade_edges}
        notes={result.attribute_details?.find((a) => a.attribute === 'edges')?.notes}
      />
      <SubGradeBar
        label="Surface"
        score={result.subgrade_surface}
        notes={result.attribute_details?.find((a) => a.attribute === 'surface')?.notes}
      />

      {result.continuous_score !== undefined && (
        <div className="pt-3 border-t border-slate-200 dark:border-slate-700">
          <div className="flex justify-between items-baseline">
            <span className="font-semibold text-lg">Predicted Score</span>
            <span className="text-2xl font-bold">
              {result.continuous_score.toFixed(1)}
              <span className="text-base font-normal text-slate-500 ml-1">
                ±{result.confidence_band?.toFixed(1)}
              </span>
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
