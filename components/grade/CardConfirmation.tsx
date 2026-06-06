'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'

interface Props {
  imageUrls: string[]
  listingTitle?: string
  suggestedPrice?: number
  onConfirm: (rawPrice: number) => void
}

export function CardConfirmation({ listingTitle, suggestedPrice, onConfirm }: Props) {
  const [price, setPrice] = useState(suggestedPrice?.toString() ?? '')

  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-5 space-y-4">
      <h3 className="font-semibold">Confirm before analysis</h3>

      {listingTitle && (
        <div>
          <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Listing</p>
          <p className="text-sm">{listingTitle}</p>
        </div>
      )}

      <div className="space-y-1">
        <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
          Raw card price ($)
        </label>
        <input
          type="number"
          min={0}
          step={0.01}
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          placeholder="e.g. 120"
          className="w-40 rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
        />
        <p className="text-xs text-slate-400">
          Enter what you paid or the current asking price. Used to calculate expected profit.
        </p>
      </div>

      <Button
        onClick={() => onConfirm(parseFloat(price))}
        disabled={!price || parseFloat(price) <= 0}
      >
        Run Grading Analysis
      </Button>
    </div>
  )
}
