import { PillarHeader } from '@/components/pillar/PillarHeader'
import { PillarEmptyState } from '@/components/pillar/PillarEmptyState'

export default function PortfolioPage() {
  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <PillarHeader
        title="Portfolio Intelligence"
        description="True cost basis tracking, population monitoring, and concentration risk scoring across your entire collection."
        actionLabel="Add Card"
      />
      <PillarEmptyState description="Your portfolio holdings, cost basis, and population alerts will appear here once you start tracking cards." />
    </div>
  )
}
