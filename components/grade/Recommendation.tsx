// components/grade/Recommendation.tsx
import { cn } from '@/lib/utils'
import type { GradeAnalysisRow } from '@/lib/grade/types'

const CONFIG = {
  grade: {
    label: 'GRADE IT',
    color: 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300 border-green-300 dark:border-green-800',
  },
  uncertain: {
    label: 'UNCERTAIN',
    color: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border-amber-300 dark:border-amber-800',
  },
  skip: {
    label: 'SKIP',
    color: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300 border-red-300 dark:border-red-800',
  },
}

interface Props {
  result: GradeAnalysisRow
  onTrack?: () => void
}

export function Recommendation({ result, onTrack }: Props) {
  if (!result.recommendation) return null
  const cfg = CONFIG[result.recommendation]
  const prob = result.break_even_prob ? ((result.break_even_prob) * 100).toFixed(0) : null
  const grade = result.break_even_grade

  const rationale =
    result.recommendation === 'grade'
      ? `Profitable at PSA ${grade} or above — ${prob}% probability`
      : result.recommendation === 'uncertain'
      ? `Grading may be profitable but outcome is uncertain — ${prob}% break-even probability`
      : 'Expected profit is negative at this card price and grading cost'

  return (
    <div className="space-y-2">
      <div className={cn('rounded-lg border px-6 py-4 flex items-center gap-4', cfg.color)}>
        <span className="text-lg font-bold tracking-wide">{cfg.label}</span>
        <span className="text-sm">{rationale}</span>
      </div>
      {onTrack && result.recommendation !== 'skip' && (
        <button
          onClick={onTrack}
          className="text-xs text-green-600 dark:text-green-400 hover:underline"
        >
          + Track this card in Portfolio
        </button>
      )}
    </div>
  )
}
