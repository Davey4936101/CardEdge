import { serve } from 'inngest/next'
import { inngest } from '@/inngest/client'
import { dealScanner } from '@/inngest/deal-scanner'
import { gradeAnalyzer } from '@/inngest/grade-analyzer'

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [dealScanner, gradeAnalyzer],
})
