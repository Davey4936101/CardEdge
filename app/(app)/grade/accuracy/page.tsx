// app/(app)/grade/accuracy/page.tsx
import { AccuracyLog } from '@/components/grade/AccuracyLog'

export default function AccuracyPage() {
  return (
    <div className="max-w-3xl mx-auto px-6 py-10 space-y-6">
      <div className="space-y-1">
        <h1 className="text-3xl font-bold">Accuracy Log</h1>
        <p className="text-slate-500 dark:text-slate-400 text-sm">
          Track your prediction accuracy over time and identify systematic blind spots.
        </p>
      </div>
      <AccuracyLog />
    </div>
  )
}
