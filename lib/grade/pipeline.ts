// lib/grade/pipeline.ts
import { createServerClient } from '@/lib/supabase/server'
import { scorePhotoQuality } from './photo-quality'
import { aggregateReliability } from './reliability'
import { measureCentering } from './centering'
import { identifyCardFromTitle, identifyCardFromImage } from './card-identify'
import { ensureReferenceImages, getReferenceImages } from './reference-images'
import { getGradeDistribution } from './grade-dist-cache'
import { analyzeAttributes } from './attribute-analysis'
import { applyBayesianUpdate } from './grade-distribution'
import { fetchGradedComps } from './graded-comps'
import { calculateAllTiers } from './ev-engine'
import type { CardIdentity, GradeAnalysisRow } from './types'

export interface PipelineInput {
  analysisId: string
  imageUrls: string[]
  rawPrice: number
  mode: 'ebay' | 'personal'
  ebayListingTitle?: string // eBay mode only — fast card ID path
}

export async function runPipeline(input: PipelineInput): Promise<void> {
  const supabase = createServerClient()

  async function updateRow(data: Partial<GradeAnalysisRow>) {
    await supabase.from('grade_analyses').update(data).eq('id', input.analysisId)
  }

  try {
    await updateRow({ status: 'analyzing' })

    // Step 1: Photo quality
    const photoScores = await Promise.all(input.imageUrls.map(scorePhotoQuality))
    const reliability = aggregateReliability(photoScores)

    // Step 2: Card identification
    let identity: CardIdentity | null = null
    if (input.ebayListingTitle) {
      identity = await identifyCardFromTitle(input.ebayListingTitle)
    }
    if (!identity && input.imageUrls[0]) {
      identity = await identifyCardFromImage(input.imageUrls[0])
    }
    if (!identity) {
      await updateRow({ status: 'error', error_message: 'Could not identify card from images or title.' })
      return
    }

    // Step 3: Centering (use front image)
    const centering = await measureCentering(input.imageUrls[0])

    // Step 4: Reference images + grade distribution prior (parallel)
    const [_, prior] = await Promise.all([
      ensureReferenceImages(identity.cardKey, identity.player, identity.year, identity.set),
      getGradeDistribution(identity.cardKey, identity.player, identity.year, identity.set),
    ])

    const referenceImages = await getReferenceImages(identity.cardKey)

    // Step 5: Attribute analysis
    const attributes = await analyzeAttributes(input.imageUrls, referenceImages)

    // Step 6: Bayesian grade distribution
    const distribution = applyBayesianUpdate(prior, attributes, centering.psa10Eligible)

    // Step 7: Graded comps + EV (parallel)
    const comps = await fetchGradedComps(identity.player, identity.year, identity.set, identity.cardNumber)
    const tiers = calculateAllTiers(input.rawPrice, distribution, comps)

    // Step 8: Generate caveats
    const caveats: string[] = []
    if (reliability.score === 'low' || reliability.score === 'medium') {
      caveats.push('Surface defects may not be visible in flat or low-quality lighting. Re-photograph with raking light for higher confidence.')
    }
    const surfaceAttr = attributes.find((a) => a.attribute === 'surface')
    if (surfaceAttr?.confidence === 'low') {
      caveats.push('Surface analysis confidence is low. Consider photographing with a flashlight held at 45° to reveal scratches.')
    }
    if (referenceImages.length < 5) {
      caveats.push('Limited reference images available for this card. Grade comparison accuracy may be reduced.')
    }

    const regularTier = tiers.find((t) => t.name === 'regular')!
    const expressTier = tiers.find((t) => t.name === 'express')!
    const superExpressTier = tiers.find((t) => t.name === 'superExpress')!

    await updateRow({
      status: 'complete',
      card_key: identity.cardKey,
      centering_lr: centering.leftRight,
      centering_tb: centering.topBottom,
      centering_eligible: centering.psa10Eligible,
      corner_assessment: attributes.find((a) => a.attribute === 'corners')?.assessment,
      edge_assessment: attributes.find((a) => a.attribute === 'edges')?.assessment,
      surface_assessment: attributes.find((a) => a.attribute === 'surface')?.assessment,
      attribute_details: attributes as unknown as GradeAnalysisRow['attribute_details'],
      grade_distribution: distribution as unknown as GradeAnalysisRow['grade_distribution'],
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
