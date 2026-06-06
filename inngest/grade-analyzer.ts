// inngest/grade-analyzer.ts
import { inngest } from './client'
import { runPipeline } from '@/lib/grade/pipeline'

export const gradeAnalyzer = inngest.createFunction(
  { id: 'grade-analyzer', triggers: [{ event: 'grade/analyze.requested' }] },
  async ({ event }) => {
    await runPipeline({
      analysisId: event.data.analysisId as string,
      imageUrls: event.data.imageUrls as string[],
      rawPrice: event.data.rawPrice as number,
      mode: event.data.mode as 'ebay' | 'personal',
      ebayListingTitle: event.data.ebayListingTitle as string | undefined,
    })
  }
)
