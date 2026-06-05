import { Button } from '@/components/ui/button'

interface PillarHeaderProps {
  title: string
  description: string
  actionLabel: string
}

export function PillarHeader({ title, description, actionLabel }: PillarHeaderProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{title}</h1>
        <p className="text-sm text-slate-400 mt-1 max-w-xl leading-relaxed">{description}</p>
      </div>
      <Button disabled className="shrink-0">{actionLabel}</Button>
    </div>
  )
}
