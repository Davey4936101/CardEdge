// app/(app)/grade/page.tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ModeToggle } from '@/components/grade/ModeToggle'
import { EbayInput } from '@/components/grade/EbayInput'
import { CaptureFlow } from '@/components/grade/CaptureFlow'
import { PhotoGrid } from '@/components/grade/PhotoGrid'
import { ReliabilityBanner } from '@/components/grade/ReliabilityBanner'
import { CardConfirmation } from '@/components/grade/CardConfirmation'
import { AnalysisLoader } from '@/components/grade/AnalysisLoader'
import { AttributeBreakdown } from '@/components/grade/AttributeBreakdown'
import { GradeDistributionChart } from '@/components/grade/GradeDistribution'
import { EvTable } from '@/components/grade/EvTable'
import { Recommendation } from '@/components/grade/Recommendation'
import { CaveatList } from '@/components/grade/CaveatList'
import { AnalysisHistory } from '@/components/grade/AnalysisHistory'
import type { GradeAnalysisRow } from '@/lib/grade/types'

type Stage =
  | 'input'
  | 'confirm-card'
  | 'analyzing'
  | 'result'

export default function GradePage() {
  const router = useRouter()
  const [mode, setMode] = useState<'ebay' | 'personal'>('ebay')
  const [stage, setStage] = useState<Stage>('input')
  const [imageUrls, setImageUrls] = useState<string[]>([])
  const [ebayMeta, setEbayMeta] = useState<{ itemId: string; title: string; price: number | null } | null>(null)
  const [analysisId, setAnalysisId] = useState<string | null>(null)
  const [result, setResult] = useState<GradeAnalysisRow | null>(null)
  const [rawPrice, setRawPrice] = useState<number>(0)

  function reset() {
    setStage('input')
    setImageUrls([])
    setEbayMeta(null)
    setAnalysisId(null)
    setResult(null)
    setRawPrice(0)
  }

  async function startAnalysis(confirmedRawPrice: number) {
    setRawPrice(confirmedRawPrice)
    setStage('analyzing')

    const res = await fetch('/api/grade/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imageUrls,
        rawPrice: confirmedRawPrice,
        mode,
        ebayItemId: ebayMeta?.itemId,
        ebayListingTitle: ebayMeta?.title,
      }),
    })

    const { analysisId: id } = (await res.json()) as { analysisId: string }
    setAnalysisId(id)
  }

  function onAnalysisComplete(row: GradeAnalysisRow) {
    setResult(row)
    setStage('result')
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-10 space-y-8">
      <div className="space-y-1">
        <h1 className="text-3xl font-bold">Pre-Grade</h1>
        <p className="text-slate-500 dark:text-slate-400 text-sm">
          Predict PSA grade probability and calculate expected grading profit before you submit.
        </p>
      </div>

      {stage === 'input' && (
        <div className="space-y-6">
          <ModeToggle mode={mode} onChange={(m) => { setMode(m); reset() }} />

          {mode === 'ebay' ? (
            <EbayInput
              onImagesLoaded={(urls, meta) => {
                setImageUrls(urls)
                setEbayMeta(meta)
              }}
            />
          ) : (
            <CaptureFlow onComplete={(urls) => setImageUrls(urls)} />
          )}

          {imageUrls.length > 0 && (
            <div className="space-y-4">
              <PhotoGrid imageUrls={imageUrls} mode={mode} />
              {mode === 'ebay' && <ReliabilityBanner imageUrls={imageUrls} />}
              <CardConfirmation
                imageUrls={imageUrls}
                listingTitle={ebayMeta?.title}
                suggestedPrice={ebayMeta?.price ?? undefined}
                onConfirm={(price) => {
                  setStage('confirm-card')
                  startAnalysis(price)
                }}
              />
            </div>
          )}
        </div>
      )}

      {stage === 'analyzing' && analysisId && (
        <AnalysisLoader analysisId={analysisId} onComplete={onAnalysisComplete} />
      )}

      {stage === 'result' && result && (
        <div className="space-y-8">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">{result.card_key.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}</h2>
            <button onClick={reset} className="text-sm text-indigo-500 hover:underline">
              New Analysis
            </button>
          </div>
          <Recommendation
              result={result}
              onTrack={() => {
                const params = new URLSearchParams({
                  addFrom: 'analysis',
                  analysisId: result.id,
                  player: result.card_key,
                })
                router.push(`/portfolio?${params.toString()}`)
              }}
            />
          <AttributeBreakdown result={result} />
          <GradeDistributionChart distribution={result.grade_distribution} comps={result.graded_comps} />
          <EvTable result={result} />
          <CaveatList caveats={result.caveats as string[]} />
        </div>
      )}

      <div className="border-t border-slate-200 dark:border-slate-800 pt-8">
        <AnalysisHistory />
      </div>
    </div>
  )
}
