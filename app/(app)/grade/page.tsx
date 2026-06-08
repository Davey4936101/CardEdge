// app/(app)/grade/page.tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ModeToggle } from '@/components/grade/ModeToggle'
import { EbayInput } from '@/components/grade/EbayInput'
import { CaptureProtocol } from '@/components/grade/CaptureProtocol'
import { PhotoGrid } from '@/components/grade/PhotoGrid'
import { ReliabilityBanner } from '@/components/grade/ReliabilityBanner'
import { CardConfirmation } from '@/components/grade/CardConfirmation'
import { AnalysisLoader } from '@/components/grade/AnalysisLoader'
import { SubGradeBreakdown } from '@/components/grade/SubGradeBreakdown'
import { SubmissionVerdict } from '@/components/grade/SubmissionVerdict'
import { GradeDistributionChart } from '@/components/grade/GradeDistribution'
import { CaveatList } from '@/components/grade/CaveatList'
import { AnalysisHistory } from '@/components/grade/AnalysisHistory'
import type { CardImageManifest, GradeAnalysisRow } from '@/lib/grade/types'

type Stage = 'input' | 'confirm' | 'analyzing' | 'result'

export default function GradePage() {
  const router = useRouter()
  const [mode, setMode] = useState<'ebay' | 'personal'>('personal')
  const [stage, setStage] = useState<Stage>('input')
  const [manifest, setManifest] = useState<CardImageManifest | null>(null)
  const [imageUrls, setImageUrls] = useState<string[]>([])          // eBay mode
  const [ebayMeta, setEbayMeta] = useState<{ itemId: string; title: string; price: number | null } | null>(null)
  const [analysisId, setAnalysisId] = useState<string | null>(null)
  const [result, setResult] = useState<GradeAnalysisRow | null>(null)

  function reset() {
    setStage('input')
    setManifest(null)
    setImageUrls([])
    setEbayMeta(null)
    setAnalysisId(null)
    setResult(null)
  }

  async function startAnalysis(confirmedRawPrice: number) {
    setStage('analyzing')

    const body = mode === 'personal'
      ? { manifest, rawPrice: confirmedRawPrice, mode }
      : { imageUrls, rawPrice: confirmedRawPrice, mode, ebayItemId: ebayMeta?.itemId, ebayListingTitle: ebayMeta?.title }

    const res = await fetch('/api/grade/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    const { analysisId: id } = (await res.json()) as { analysisId: string }
    setAnalysisId(id)
  }

  function onAnalysisComplete(row: GradeAnalysisRow) {
    setResult(row)
    setStage('result')
  }

  const previewUrls = manifest ? Object.values(manifest) : imageUrls

  return (
    <div className="max-w-5xl mx-auto px-6 py-10 space-y-8">
      <div className="space-y-1">
        <h1 className="text-3xl font-bold">Pre-Grade</h1>
        <p className="text-slate-500 dark:text-slate-400 text-sm">
          Predict PSA grade probability and calculate expected submission profit before you submit.
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
                setStage('confirm')
              }}
            />
          ) : (
            <CaptureProtocol
              onComplete={(m) => {
                setManifest(m)
                setStage('confirm')
              }}
            />
          )}
        </div>
      )}

      {stage === 'confirm' && (
        <div className="space-y-4">
          <PhotoGrid imageUrls={previewUrls} mode={mode} />
          {mode === 'ebay' && <ReliabilityBanner imageUrls={imageUrls} />}
          <CardConfirmation
            imageUrls={previewUrls}
            listingTitle={ebayMeta?.title}
            suggestedPrice={ebayMeta?.price ?? undefined}
            onConfirm={startAnalysis}
          />
        </div>
      )}

      {stage === 'analyzing' && (
        analysisId
          ? <AnalysisLoader analysisId={analysisId} onComplete={onAnalysisComplete} />
          : <div className="flex flex-col items-center justify-center py-20 space-y-4">
              <div className="h-10 w-10 rounded-full border-4 border-indigo-500/30 border-t-indigo-500 animate-spin" />
              <p className="text-sm text-slate-400">Starting analysis…</p>
            </div>
      )}

      {stage === 'result' && result && (
        <div className="space-y-8">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">
              {result.card_key.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
            </h2>
            <button onClick={reset} className="text-sm text-indigo-500 hover:underline">
              New Analysis
            </button>
          </div>

          <SubmissionVerdict
            result={result}
            onTrack={() => {
              const params = new URLSearchParams({ addFrom: 'analysis', analysisId: result.id, player: result.card_key })
              router.push(`/portfolio?${params.toString()}`)
            }}
          />

          <SubGradeBreakdown result={result} />

          <GradeDistributionChart distribution={result.grade_distribution} comps={result.graded_comps} />

          <CaveatList caveats={result.caveats as string[]} />
        </div>
      )}

      <div className="border-t border-slate-200 dark:border-slate-800 pt-8">
        <AnalysisHistory />
      </div>
    </div>
  )
}
