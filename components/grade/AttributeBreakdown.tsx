// components/grade/AttributeBreakdown.tsx
import type { GradeAnalysisRow } from '@/lib/grade/types'

const CONFIDENCE_COLOR = {
  high: 'text-green-600 dark:text-green-400',
  medium: 'text-amber-600 dark:text-amber-400',
  low: 'text-red-600 dark:text-red-400',
}

interface Props {
  result: GradeAnalysisRow
}

export function AttributeBreakdown({ result }: Props) {
  const attrs = result.attribute_details as Array<{
    attribute: string
    assessment: string
    confidence: string
    notes: string
  }>

  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Photo Analysis</h3>
      </div>
      <div className="divide-y divide-slate-100 dark:divide-slate-800">
        <div className="px-5 py-3 grid grid-cols-3 gap-4">
          <div>
            <p className="text-xs text-slate-400 mb-1">Centering</p>
            <p className="font-mono font-semibold">
              {result.centering_lr ?? '—'}/{100 - (result.centering_lr ?? 50)} L-R
            </p>
            <p className="font-mono text-sm text-slate-500">
              {result.centering_tb ?? '—'}/{100 - (result.centering_tb ?? 50)} T-B
            </p>
            <span className={`text-xs font-medium ${result.centering_eligible ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
              {result.centering_eligible ? 'PSA 10 eligible ✓' : 'Not PSA 10 eligible'}
            </span>
          </div>
        </div>
        {attrs.map((attr) => (
          <div key={attr.attribute} className="px-5 py-3">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs text-slate-400 mb-0.5 capitalize">{attr.attribute}</p>
                <p className="font-medium capitalize">{attr.assessment}</p>
              </div>
              <span className={`text-xs font-medium capitalize ${CONFIDENCE_COLOR[attr.confidence as keyof typeof CONFIDENCE_COLOR] ?? ''}`}>
                {attr.confidence} confidence
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">{attr.notes}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
