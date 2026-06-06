// components/grade/GradeDistribution.tsx
import type { GradeDistribution, GradedComps } from '@/lib/grade/types'

const GRADE_COLORS = [
  'bg-green-500',
  'bg-lime-400',
  'bg-amber-400',
  'bg-red-400',
]

interface Props {
  distribution: GradeDistribution | Record<string, number>
  comps: GradedComps
}

export function GradeDistributionChart({ distribution, comps }: Props) {
  const GRADES = [10, 9, 8, 7] as const

  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Grade Distribution</h3>
      </div>
      <div className="px-5 py-4 space-y-3">
        {GRADES.map((grade, i) => {
          const prob = ((distribution as Record<number, number | undefined>)[grade] ?? 0) * 100
          const comp = (comps as Record<number, number | undefined>)[grade]
          return (
            <div key={grade} className="flex items-center gap-3">
              <span className="w-14 text-sm font-semibold text-right">PSA {grade}</span>
              <div className="flex-1 bg-slate-100 dark:bg-slate-800 rounded-full h-4 overflow-hidden">
                <div
                  className={`h-full rounded-full ${GRADE_COLORS[i]}`}
                  style={{ width: `${Math.max(prob, 1)}%` }}
                />
              </div>
              <span className="w-10 text-sm font-mono text-right">{prob.toFixed(0)}%</span>
              <span className="w-20 text-sm text-slate-400 text-right">
                {comp !== undefined ? `$${comp.toLocaleString()}` : '—'}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
