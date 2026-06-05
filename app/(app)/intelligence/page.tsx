import { PillarHeader } from '@/components/pillar/PillarHeader'
import { PillarEmptyState } from '@/components/pillar/PillarEmptyState'

export default function IntelligencePage() {
  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <PillarHeader
        title="Acquisition Intelligence"
        description="Fair value modeling that accounts for recent sales volume, trend direction, population size, and seasonal patterns."
        actionLabel="Run Analysis"
      />
      <PillarEmptyState description="Fair value models, buy/wait signals, and pop-adjusted valuations will appear here once the intelligence engine is active." />
    </div>
  )
}
