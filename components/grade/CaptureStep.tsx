'use client'

import { Check } from 'lucide-react'

interface Props {
  stepNumber: number
  label: string
  description: string
  guideText: string
  done: boolean
  onCapture: (file: File) => void
}

export function CaptureStep({ stepNumber, label, description, guideText, done, onCapture }: Props) {
  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) onCapture(file)
  }

  return (
    <div className={`rounded-lg border p-4 space-y-3 ${done ? 'border-green-300 dark:border-green-800 bg-green-50 dark:bg-green-950/20' : 'border-slate-200 dark:border-slate-800'}`}>
      <div className="flex items-center gap-3">
        <span className={`h-7 w-7 rounded-full flex items-center justify-center text-sm font-bold ${done ? 'bg-green-500 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'}`}>
          {done ? <Check className="h-4 w-4" /> : stepNumber}
        </span>
        <div>
          <p className="font-medium text-sm">{label}</p>
          <p className="text-xs text-slate-500">{description}</p>
        </div>
      </div>
      <p className="text-xs text-slate-400 bg-slate-100 dark:bg-slate-800 rounded px-3 py-2">{guideText}</p>
      {!done && (
        <label className="inline-flex items-center gap-2 cursor-pointer rounded-md bg-indigo-500 hover:bg-indigo-600 text-white text-sm px-4 py-2">
          Take Photo
          <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={handleChange} />
        </label>
      )}
    </div>
  )
}
