// lib/grade/pipeline.ts
import { createServerClient } from '@/lib/supabase/server'
import { scorePhotoQuality } from './photo-quality'
import { aggregateReliability } from './reliability'
import { measureCentering } from './centering'
import { identifyCardFromTitle, identifyCardFromImage } from './card-identify'
import { ensureReferenceImages, getReferenceImages } from './reference-images'
import { getGradeDistribution } from './grade-dist-cache'
import { analyzeCorners } from './corner-analysis'
import { analyzeEdges } from './edge-analysis'
import { analyzeSurface } from './surface-analysis'
import { applyBayesianUpdate, computeGradeScore } from './grade-distribution'
import { fetchGradedComps } from './graded-comps'
import { calculateAllTiers } from './ev-engine'
import type { CardIdentity, CardImageManifest, GradeAnalysisRow } from './types'

export interface PipelineInput {
  analysisId: string
  // Personal mode: structured manifest
  manifest?: CardImageManifest
  // eBay mode: unstructured array (limited accuracy)
  imageUrls?: string[]
  rawPrice: number
  mode: 'ebay' | 'personal'
  ebayListingTitle?: string
}

export async function runPipeline(input: PipelineInput): Promise<void> {
  const supabase = createServerClient()

  async function updateRow(data: Partial<GradeAnalysisRow>) {
    await supabase.from('grade_analyses').update(data).eq('id', input.analysisId)
  }

  try {
    await updateRow({ status: 'analyzing' })

    // Determine image set
    const allImageUrls = input.manifest
      ? Object.values(input.manifest)
      : (input.imageUrls ?? [])

    // Step 1: Photo quality check (all images)
    const photoScores = await Promise.all(allImageUrls.map(scorePhotoQuality))
    const reliability = aggregateReliability(photoScores)

    // Step 2: Card identification
    let identity: CardIdentity | null = null
    if (input.ebayListingTitle) {
      identity = await identifyCardFromTitle(input.ebayListingTitle)
    }
    const frontImage = input.manifest?.front ?? input.imageUrls?.[0]
    if (!identity && frontImage) {
      identity = await identifyCardFromImage(frontImage)
    }
    if (!identity) {
      await updateRow({ status: 'error', error_message: 'Could not identify card.' })
      return
    }

    // Step 3: Centering — front + back separately (personal mode has both; eBay falls back)
    const frontUrl = input.manifest?.front ?? input.imageUrls?.[0] ?? ''
    const backUrl  = input.manifest?.back  ?? input.imageUrls?.[1] ?? frontUrl
    const centering = await measureCentering(frontUrl, backUrl)

    // Step 4: Reference images + grade distribution prior (parallel)
    const [_, priorResult] = await Promise.all([
      ensureReferenceImages(identity.cardKey, identity.player, identity.year, identity.set),
      getGradeDistribution(identity.cardKey, identity.player, identity.year, identity.set, identity.cardNumber),
    ])
    const { distribution: prior, popData } = priorResult
    const referenceImages = await getReferenceImages(identity.cardKey)

    // Step 5: Attribute analysis
    // Personal mode: full per-attribute analysis using manifest
    // eBay mode: single-call fallback using legacy attribute-analysis
    let multiplierSets: [number, number, number, number][]
    let attributeDetails: GradeAnalysisRow['attribute_details']
    let cornerData = null
    let edgeData = null
    let surfaceData = null

    if (input.manifest) {
      // Full analysis
      ;[cornerData, edgeData, surfaceData] = await Promise.all([
        analyzeCorners(input.manifest, referenceImages, identity.cardType),
        analyzeEdges(input.manifest, referenceImages, identity.cardType),
        analyzeSurface(input.manifest, referenceImages, identity.cardType),
      ])

      multiplierSets = [
        cornerData.multipliers,
        edgeData.multipliers,
        surfaceData.multipliers,
      ]

      attributeDetails = [
        {
          attribute: 'corners',
          assessment: cornerData.corners.reduce((w, c) => {
            const order = ['excellent', 'good', 'fair', 'poor']
            return order.indexOf(c.assessment) > order.indexOf(w) ? c.assessment : w
          }, 'excellent' as GradeAnalysisRow['attribute_details'][number]['assessment']),
          confidence: 'high',
          multipliers: cornerData.multipliers,
          notes: cornerData.notes,
        },
        {
          attribute: 'edges',
          assessment: edgeData.assessment,
          confidence: edgeData.confidence,
          multipliers: edgeData.multipliers,
          notes: edgeData.notes,
        },
        {
          attribute: 'surface',
          assessment: surfaceData.front.assessment,
          confidence: surfaceData.front.confidence,
          multipliers: surfaceData.multipliers,
          notes: surfaceData.front.notes,
        },
      ]
    } else {
      // eBay mode fallback — import legacy analyzer lazily to avoid loading it in personal mode
      const { analyzeAttributes } = await import('./attribute-analysis')
      const attrs = await analyzeAttributes(input.imageUrls ?? [], referenceImages)
      multiplierSets = attrs.map((a) => a.multipliers)
      attributeDetails = attrs
    }

    // Step 6: Bayesian grade distribution
    const distribution = applyBayesianUpdate(
      prior,
      multiplierSets,
      centering.front.psa10Eligible
    )
    const gradeScore = computeGradeScore(distribution)

    // Step 7: Graded comps + EV (parallel)
    const comps = await fetchGradedComps(identity.player, identity.year, identity.set, identity.cardNumber)
    const tiers = calculateAllTiers(input.rawPrice, distribution, comps)

    // Step 8: Caveats
    const caveats: string[] = []
    if (reliability.score !== 'high') {
      caveats.push('Surface defects may not be fully visible in current photos. Re-photograph with raking light for higher confidence.')
    }
    if (!centering.front.psa10Eligible) {
      const lr = centering.front.leftRight
      const tb = centering.front.topBottom
      caveats.push(`Front centering (${lr}/${100 - lr} L/R, ${tb}/${100 - tb} T/B) exceeds PSA 10 threshold of 55/45. PSA 10 is unlikely.`)
    }
    if (!centering.back.psa10Eligible) {
      caveats.push(`Back centering exceeds the 75/25 PSA 10 threshold.`)
    }
    if (surfaceData && surfaceData.front.defectsFound.length > 0) {
      caveats.push(`Potential surface defects detected: ${surfaceData.front.defectsFound.join(', ')}.`)
    }
    if (referenceImages.length < 5) {
      caveats.push('Limited reference images available. Grade comparison accuracy may be reduced.')
    }

    const regularTier     = tiers.find((t) => t.name === 'regular')!
    const expressTier     = tiers.find((t) => t.name === 'express')!
    const superExpressTier = tiers.find((t) => t.name === 'superExpress')!

    await updateRow({
      status: 'complete',
      card_key: identity.cardKey,
      card_type: identity.cardType,

      centering_front_lr: centering.front.leftRight,
      centering_front_tb: centering.front.topBottom,
      centering_front_eligible: centering.front.psa10Eligible,
      centering_back_lr: centering.back.leftRight,
      centering_back_tb: centering.back.topBottom,
      centering_back_eligible: centering.back.psa10Eligible,

      corner_tl_assessment: cornerData?.corners.find((c) => c.position === 'top_left')?.assessment,
      corner_tr_assessment: cornerData?.corners.find((c) => c.position === 'top_right')?.assessment,
      corner_bl_assessment: cornerData?.corners.find((c) => c.position === 'bottom_left')?.assessment,
      corner_br_assessment: cornerData?.corners.find((c) => c.position === 'bottom_right')?.assessment,
      corner_worst: cornerData?.worstCorner,

      subgrade_centering: centering.front.psa10Eligible ? 10 : centering.front.leftRight <= 60 ? 9 : 8,
      subgrade_corners: cornerData?.subGrade,
      subgrade_edges: edgeData?.subGrade,
      subgrade_surface: surfaceData?.front.subGrade,

      attribute_details: attributeDetails as unknown as GradeAnalysisRow['attribute_details'],
      grade_distribution: distribution as unknown as GradeAnalysisRow['grade_distribution'],
      continuous_score: gradeScore.continuousScore,
      confidence_band: gradeScore.confidenceBand,

      pop_gem_rate: popData?.gemRate,
      pop_count_10: popData?.count10,
      pop_count_9: popData?.count9,
      pop_count_8: popData?.count8,
      pop_count_7: popData?.count7,
      pop_total: popData?.total,

      graded_comps: comps as unknown as GradeAnalysisRow['graded_comps'],
      raw_price: input.rawPrice,
      ev_regular: regularTier.ev.evGraded,
      ep_regular: regularTier.ev.expectedProfit,
      ev_express: expressTier.ev.evGraded,
      ep_express: expressTier.ev.expectedProfit,
      ev_super_express: superExpressTier.ev.evGraded,
      ep_super_express: superExpressTier.ev.expectedProfit,
      break_even_grade: regularTier.ev.breakEvenGrade ?? undefined,
      break_even_prob: regularTier.ev.breakEvenProbability,
      recommendation: regularTier.ev.recommendation,
      reliability_score: reliability.score,
      caveats: caveats as unknown as GradeAnalysisRow['caveats'],
    })
  } catch (err) {
    await updateRow({
      status: 'error',
      error_message: err instanceof Error ? err.message : 'Pipeline failed.',
    })
  }
}
