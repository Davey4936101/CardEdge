// inngest/deal-grade-enricher.ts
import { inngest } from './client'
import { createServerClient } from '@/lib/supabase/server'
import { quickGrade } from '@/lib/grade/quick-grade'
import { computeGradePotential } from '@/lib/grade/deal-grade-potential'
import { identifyCardFromTitle } from '@/lib/grade/card-identify'

export const dealGradeEnricher = inngest.createFunction(
  { id: 'deal-grade-enricher', triggers: [{ event: 'deals/grade-potential.requested' }] },
  async ({ event }) => {
    const { alertId, imageUrl, cardTitle, listedPrice } = event.data as {
      alertId: string
      imageUrl: string | null
      cardTitle: string
      listedPrice: number
    }

    if (!imageUrl) return { skipped: 'no_image' }

    const supabase = createServerClient()

    const [qg, identity] = await Promise.all([
      quickGrade(imageUrl),
      identifyCardFromTitle(cardTitle),
    ])

    if (!identity) {
      await supabase
        .from('alerts')
        .update({ grade_potential_score: qg.psa10Probability })
        .eq('id', alertId)
      return { alertId, psa10: qg.psa10Probability, ev: null }
    }

    const potential = await computeGradePotential(
      qg,
      identity.player,
      identity.year,
      identity.set,
      identity.cardNumber,
      listedPrice
    )

    await supabase
      .from('alerts')
      .update({
        grade_potential_score: potential.gradePotentialScore,
        ev_if_graded: potential.evIfGraded,
        grade_upside: potential.gradeUpside,
      })
      .eq('id', alertId)

    return { alertId, psa10: potential.gradePotentialScore, ev: potential.evIfGraded }
  }
)
