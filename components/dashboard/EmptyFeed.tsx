import { Inbox } from 'lucide-react'

interface EmptyFeedProps {
  title: string
  message: string
}

export function EmptyFeed({ title, message }: EmptyFeedProps) {
  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-8 flex flex-col items-center justify-center text-center min-h-[200px]">
      <Inbox className="h-8 w-8 text-slate-300 dark:text-slate-600 mb-3" />
      <p className="font-medium text-sm text-slate-900 dark:text-slate-100">{title}</p>
      <p className="text-xs text-slate-400 mt-1 max-w-xs">{message}</p>
    </div>
  )
}
