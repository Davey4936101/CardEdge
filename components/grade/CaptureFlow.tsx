'use client'

import { useState } from 'react'
import { CaptureStep } from './CaptureStep'
import { Button } from '@/components/ui/button'

const STEPS = [
  {
    label: 'Front — flat lighting',
    description: 'Card face-up, even overhead light, no shadows.',
    guideText: 'Place the card on a dark background. Hold camera directly above, parallel to the card. Avoid harsh shadows or glare.',
  },
  {
    label: 'Back — flat lighting',
    description: 'Card face-down, same even lighting.',
    guideText: 'Flip the card over. Same setup as the front shot.',
  },
  {
    label: 'Corner crops (all 4)',
    description: 'Tight close-up of each corner.',
    guideText: 'Get close enough that each corner fills most of the frame. Take all four: top-left, top-right, bottom-left, bottom-right. You can submit as one photo if all four corners are visible.',
  },
  {
    label: 'Raking light — surface check',
    description: 'Front of card with flashlight at 45°.',
    guideText: 'Hold your phone flashlight at a 45° angle to the card surface. This reveals scratches and haze invisible under flat light. Critical for accurate surface assessment.',
  },
]

interface Props {
  onComplete: (imageUrls: string[]) => void
}

export function CaptureFlow({ onComplete }: Props) {
  const [files, setFiles] = useState<(File | null)[]>(Array(STEPS.length).fill(null))

  function handleCapture(index: number, file: File) {
    setFiles((prev) => {
      const next = [...prev]
      next[index] = file
      return next
    })
  }

  const completedCount = files.filter(Boolean).length
  const allDone = completedCount === STEPS.length

  async function handleSubmit() {
    const urls: string[] = []
    for (const file of files) {
      if (!file) continue
      // Convert File to object URL for display; the API route will handle upload
      urls.push(URL.createObjectURL(file))
    }
    onComplete(urls)
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">
        Complete all {STEPS.length} photo steps for the most accurate grading prediction.
      </p>
      <div className="space-y-3">
        {STEPS.map((step, i) => (
          <CaptureStep
            key={step.label}
            stepNumber={i + 1}
            label={step.label}
            description={step.description}
            guideText={step.guideText}
            done={!!files[i]}
            onCapture={(file) => handleCapture(i, file)}
          />
        ))}
      </div>
      {completedCount > 0 && (
        <Button onClick={handleSubmit} disabled={!allDone}>
          {allDone ? 'Continue to Confirmation' : `${completedCount}/${STEPS.length} photos captured`}
        </Button>
      )}
    </div>
  )
}
