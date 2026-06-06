// components/grade/AnalysisLoader.tsx
'use client'

import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import type { GradeAnalysisRow } from '@/lib/grade/types'

const STEPS = [
  'Scoring photo quality…',
  'Identifying card…',
  'Measuring centering…',
  'Retrieving reference images…',
  'Analyzing corners, edges, surface…',
  'Computing grade distribution…',
  'Fetching graded comps…',
  'Calculating expected value…',
  'Finalizing analysis…',
]

interface Props {
  analysisId: string
  onComplete: (result: GradeAnalysisRow) => void
}

export function AnalysisLoader({ analysisId, onComplete }: Props) {
  const [stepIndex, setStepIndex] = useState(0)

  useEffect(() => {
    // Advance displayed step every 4 seconds for visual progress
    const stepInterval = setInterval(() => {
      setStepIndex((i) => Math.min(i + 1, STEPS.length - 1))
    }, 4000)

    // Poll for completion every 3 seconds
    const pollInterval = setInterval(async () => {
      const res = await fetch(`/api/grade/analyses/${analysisId}`)
      if (!res.ok) return
      const row = (await res.json()) as GradeAnalysisRow
      if (row.status === 'complete' || row.status === 'error') {
        clearInterval(pollInterval)
        clearInterval(stepInterval)
        onComplete(row)
      }
    }, 3000)

    return () => {
      clearInterval(stepInterval)
      clearInterval(pollInterval)
    }
  }, [analysisId, onComplete])

  return (
    <div className="flex flex-col items-center justify-center py-20 space-y-6">
      <Loader2 className="h-10 w-10 animate-spin text-indigo-500" />
      <div className="text-center space-y-1">
        <p className="font-medium">{STEPS[stepIndex]}</p>
        <p className="text-sm text-slate-400">This takes 20–40 seconds</p>
      </div>
      <div className="flex gap-1">
        {STEPS.map((_, i) => (
          <div
            key={i}
            className={`h-1.5 w-6 rounded-full transition-colors ${i <= stepIndex ? 'bg-indigo-500' : 'bg-slate-200 dark:bg-slate-700'}`}
          />
        ))}
      </div>
    </div>
  )
}
