import { serve } from 'inngest/next'
import { inngest } from '@/inngest/client'
import { gradeAnalyzer } from '@/inngest/grade-analyzer'
import { portfolioValueRefresh } from '@/inngest/portfolio-value-refresh'
import { playerIntelScanner } from '@/inngest/player-intel-scanner'
import { bidWatchScanner } from '@/inngest/bid-watch-scanner'

// dealScanner and globalDealScanner are intentionally not served here.
// They would fire on cron schedules and burn RapidAPI quota automatically.
// Deals are populated only via the manual scan button (POST /api/deals/scan).
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [gradeAnalyzer, portfolioValueRefresh, playerIntelScanner, bidWatchScanner],
})
