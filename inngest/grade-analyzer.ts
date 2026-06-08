// inngest/grade-analyzer.ts
import { inngest } from './client'
import { runPipeline } from '@/lib/grade/pipeline'
import type { CardImageManifest } from '@/lib/grade/types'

export const gradeAnalyzer = inngest.createFunction(
  { id: 'grade-analyzer', triggers: [{ event: 'grade/analyze.requested' }] },
  async ({ event }) => {
    await runPipeline({
      analysisId: event.data.analysisId as string,
      manifest: event.data.manifest as CardImageManifest | undefined,
      imageUrls: event.data.imageUrls as string[] | undefined,
      rawPrice: event.data.rawPrice as number,
      mode: event.data.mode as 'ebay' | 'personal',
      ebayListingTitle: event.data.ebayListingTitle as string | undefined,
    })
  }
)
