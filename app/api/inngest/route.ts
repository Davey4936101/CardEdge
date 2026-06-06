import { serve } from 'inngest/next'
import { inngest } from '@/inngest/client'
import { dealScanner } from '@/inngest/deal-scanner'
import { globalDealScanner } from '@/inngest/global-deal-scanner'
import { gradeAnalyzer } from '@/inngest/grade-analyzer'
import { portfolioValueRefresh } from '@/inngest/portfolio-value-refresh'

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [dealScanner, globalDealScanner, gradeAnalyzer, portfolioValueRefresh],
})
