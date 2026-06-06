'use client'

import { AlertTriangle } from 'lucide-react'

interface Props {
  imageUrls: string[]
}

// Heuristic: score based on number of images (proxy for coverage)
function getReliability(count: number): 'high' | 'medium' | 'low' {
  if (count >= 4) return 'high'
  if (count >= 2) return 'medium'
  return 'low'
}

const MESSAGES = {
  high: null,
  medium: '⚠ Medium Reliability — seller photos have limited coverage. Surface estimate may be inaccurate.',
  low: '⚠ Low Reliability — only one photo available. This estimate is directional only. Consider requesting better photos before bidding.',
}

export function ReliabilityBanner({ imageUrls }: Props) {
  const score = getReliability(imageUrls.length)
  const message = MESSAGES[score]
  if (!message) return null

  return (
    <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30 px-4 py-3">
      <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
      <p className="text-sm text-amber-700 dark:text-amber-400">{message}</p>
    </div>
  )
}
