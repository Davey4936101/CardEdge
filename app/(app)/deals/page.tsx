import { PillarHeader } from '@/components/pillar/PillarHeader'
import { PillarEmptyState } from '@/components/pillar/PillarEmptyState'

export default function DealsPage() {
  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <PillarHeader
        title="Deal Discovery"
        description="Live scanning across marketplaces for cards priced below fair value. Cross-platform and grade arbitrage detection."
        actionLabel="Scan Now"
      />
      <PillarEmptyState description="Live deal alerts, arbitrage signals, and marketplace scanning will appear here once the deal engine is active." />
    </div>
  )
}
