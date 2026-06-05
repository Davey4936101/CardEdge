import { Construction } from 'lucide-react'

interface PillarEmptyStateProps {
  description: string
}

export function PillarEmptyState({ description }: PillarEmptyStateProps) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 dark:border-slate-700 p-16 flex flex-col items-center justify-center text-center">
      <Construction className="h-10 w-10 text-slate-300 dark:text-slate-600 mb-4" />
      <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">Coming Soon</h3>
      <p className="text-sm text-slate-400 max-w-sm leading-relaxed">{description}</p>
    </div>
  )
}
