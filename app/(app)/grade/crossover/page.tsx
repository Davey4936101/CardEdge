// app/(app)/grade/crossover/page.tsx
import { CrossoverAnalysis } from '@/components/grade/CrossoverAnalysis'

export default function CrossoverPage() {
  return (
    <div className="max-w-2xl mx-auto px-6 py-10 space-y-6">
      <div className="space-y-1">
        <h1 className="text-3xl font-bold">BGS → PSA Crossover</h1>
        <p className="text-slate-500 dark:text-slate-400 text-sm">
          Enter your BGS sub-grades to see crossover probability and the best option: keep the slab, submit for crossover, or crack and resubmit raw.
        </p>
      </div>
      <CrossoverAnalysis />
    </div>
  )
}
