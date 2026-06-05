import { PillarHeader } from '@/components/pillar/PillarHeader'
import { PillarEmptyState } from '@/components/pillar/PillarEmptyState'

export default function PerformancePage() {
  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <PillarHeader
        title="Performance Accounting"
        description="Real ROI and IRR, capital velocity, and win/loss breakdowns by player, sport, set, and grade tier."
        actionLabel="View Report"
      />
      <PillarEmptyState description="Realized and unrealized returns, IRR calculations, and performance breakdowns will appear here once your portfolio has activity." />
    </div>
  )
}
