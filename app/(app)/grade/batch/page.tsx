import { BatchOptimizer } from '@/components/grade/BatchOptimizer'

export default function BatchPage() {
  return (
    <div className="max-w-3xl mx-auto px-6 py-10 space-y-6">
      <div className="space-y-1">
        <h1 className="text-3xl font-bold">Batch Optimizer</h1>
        <p className="text-slate-500 dark:text-slate-400 text-sm">
          Select cards from your analysis history to rank by expected ROI and build the optimal PSA submission batch.
        </p>
      </div>
      <BatchOptimizer />
    </div>
  )
}
