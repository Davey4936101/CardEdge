// lib/grade/multi-pass.ts

// Run an async factory function N times in parallel and return all results.
// The factory receives the run index (0-based) in case it needs it.
export async function runMultiPass<T>(
  factory: (runIndex: number) => Promise<T>,
  runs: number
): Promise<T[]> {
  return Promise.all(Array.from({ length: runs }, (_, i) => factory(i)))
}

// Average four-element multiplier arrays across multiple runs.
export function averageMultipliers(
  allMultipliers: [number, number, number, number][]
): [number, number, number, number] {
  if (allMultipliers.length === 0) return [1, 1, 1, 1]
  const sum: [number, number, number, number] = [0, 0, 0, 0]
  for (const m of allMultipliers) {
    sum[0] += m[0]; sum[1] += m[1]; sum[2] += m[2]; sum[3] += m[3]
  }
  const n = allMultipliers.length
  return [sum[0] / n, sum[1] / n, sum[2] / n, sum[3] / n]
}

// Median of a numeric array.
export function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid]
}

// Convert array of string assessments to the most common one.
export function majorityAssessment(
  assessments: string[]
): string {
  const counts: Record<string, number> = {}
  for (const a of assessments) counts[a] = (counts[a] ?? 0) + 1
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'fair'
}

// If all runs agree, confidence is high. If they disagree, degrade.
export function aggregateConfidence(
  confidences: string[]
): 'high' | 'medium' | 'low' {
  const unique = new Set(confidences)
  if (unique.size === 1) return confidences[0] as 'high' | 'medium' | 'low'
  if (unique.has('low')) return 'low'
  return 'medium'
}
