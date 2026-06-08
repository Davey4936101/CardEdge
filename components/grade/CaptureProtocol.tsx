// components/grade/CaptureProtocol.tsx
'use client'

import { useState, useRef } from 'react'
import type { CardImageManifest, CardType } from '@/lib/grade/types'

interface StepConfig {
  key: keyof CardImageManifest
  label: string
  instructions: string
  rakingRequired?: boolean
}

function getSteps(cardType: CardType): StepConfig[] {
  const surfaceInstructions =
    cardType === 'foil_chrome'
      ? 'Hold a flashlight at 45° to the card surface. Look for foil scratches and check the card center for the Prizm Dimple indentation. The raking angle reveals defects invisible under overhead light.'
      : cardType === 'dark_border'
      ? 'Hold a flashlight at 45° to the card surface. Check for surface scratches. Also check dark edges under angled light for white specks (edge whitening).'
      : 'Hold a flashlight at 45° to the card surface. Look for scratches or print defects that only show at this angle.'

  return [
    { key: 'front',             label: 'Front',              instructions: 'Lay card flat. Overhead lighting, card fills the frame. Avoid glare.' },
    { key: 'back',              label: 'Back',               instructions: 'Flip the card. Same conditions as front — flat, overhead, no glare.' },
    { key: 'cornerTopLeft',     label: 'Top-Left Corner',    instructions: 'Move close. The corner should fill most of the frame. Even lighting.' },
    { key: 'cornerTopRight',    label: 'Top-Right Corner',   instructions: 'Same — corner fills the frame.' },
    { key: 'cornerBottomLeft',  label: 'Bottom-Left Corner', instructions: 'Same — corner fills the frame.' },
    { key: 'cornerBottomRight', label: 'Bottom-Right Corner',instructions: 'Same — corner fills the frame.' },
    { key: 'rakingLight',       label: 'Raking Light Surface', instructions: surfaceInstructions, rakingRequired: true },
    { key: 'edgeTop',           label: 'Top Edge',           instructions: 'Hold the card so the top edge runs horizontally across the frame.' },
    { key: 'edgeBottom',        label: 'Bottom Edge',        instructions: 'Same for the bottom edge.' },
    { key: 'edgeSides',         label: 'Left + Right Edges', instructions: 'Hold the card vertically so both side edges are visible in one photo.' },
  ]
}

interface Props {
  cardType?: CardType
  onComplete: (manifest: CardImageManifest) => void
}

export function CaptureProtocol({ cardType = 'matte', onComplete }: Props) {
  const steps = getSteps(cardType)
  const [currentStep, setCurrentStep] = useState(0)
  const [captures, setCaptures] = useState<Partial<CardImageManifest>>({})
  const fileInputRef = useRef<HTMLInputElement>(null)

  const step = steps[currentStep]
  const isLast = currentStep === steps.length - 1

  function handleCapture(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result as string
      const updated = { ...captures, [step.key]: dataUrl }
      setCaptures(updated)

      if (isLast) {
        onComplete(updated as CardImageManifest)
      } else {
        setCurrentStep((s) => s + 1)
      }
    }
    reader.readAsDataURL(file)

    // Reset input so the same file can be re-selected if needed
    e.target.value = ''
  }

  function retakeStep(index: number) {
    setCurrentStep(index)
    // Remove this and all subsequent captures so the flow re-runs from here
    const updated = { ...captures }
    steps.slice(index).forEach((s) => delete updated[s.key])
    setCaptures(updated)
  }

  const completedSteps = steps.filter((s) => captures[s.key])

  return (
    <div className="space-y-6">
      {/* Progress */}
      <div className="space-y-1">
        <div className="flex justify-between text-xs text-slate-500">
          <span>Photo {currentStep + 1} of {steps.length}</span>
          <span>{completedSteps.length} captured</span>
        </div>
        <div className="h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-indigo-500 transition-all"
            style={{ width: `${(completedSteps.length / steps.length) * 100}%` }}
          />
        </div>
      </div>

      {/* Current step */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-6 space-y-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-indigo-500 uppercase tracking-wide">
              Step {currentStep + 1}
            </span>
            {step.rakingRequired && (
              <span className="text-xs bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 px-2 py-0.5 rounded">
                Raking light required
              </span>
            )}
          </div>
          <h3 className="text-lg font-semibold">{step.label}</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">{step.instructions}</p>
        </div>

        <button
          onClick={() => fileInputRef.current?.click()}
          className="w-full py-10 border-2 border-dashed border-indigo-300 dark:border-indigo-700 rounded-lg text-indigo-500 hover:border-indigo-500 transition-colors text-sm font-medium"
        >
          Tap to capture {step.label}
        </button>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handleCapture}
        />
      </div>

      {/* Completed steps */}
      {completedSteps.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Captured</p>
          <div className="grid grid-cols-5 gap-2">
            {steps.map((s, i) => {
              const url = captures[s.key]
              if (!url) return null
              return (
                <button
                  key={s.key}
                  onClick={() => retakeStep(i)}
                  className="relative aspect-square rounded overflow-hidden border border-slate-200 dark:border-slate-700 hover:opacity-80 transition-opacity"
                  title={`Retake ${s.label}`}
                >
                  <img src={url} alt={s.label} className="object-cover w-full h-full" />
                  <span className="absolute bottom-0 left-0 right-0 text-[9px] bg-black/60 text-white text-center py-0.5 truncate px-1">
                    {s.label}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
