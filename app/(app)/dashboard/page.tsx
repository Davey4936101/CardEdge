'use client'

import { useEffect, useState } from 'react'
import { KpiCard } from '@/components/dashboard/KpiCard'
import { EmptyFeed } from '@/components/dashboard/EmptyFeed'
import type { PortfolioSummary } from '@/lib/portfolio/types'

export default function DashboardPage() {
  const [summary, setSummary] = useState<PortfolioSummary | null>(null)

  useEffect(() => {
    void fetch('/api/portfolio/summary')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: PortfolioSummary | null) => { if (d) setSummary(d) })
  }, [])

  const portfolioValue = summary
    ? `$${summary.portfolioValue.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
    : '…'

  const totalRoi = summary
    ? `${summary.unrealizedPnlPct >= 0 ? '+' : ''}${summary.unrealizedPnlPct.toFixed(2)}%`
    : '…'

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
          Good morning, David.
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          {new Date().toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })}
        </p>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <KpiCard title="Portfolio Value" value={portfolioValue} />
        <KpiCard title="Active Deal Alerts" value={summary ? summary.activeAlertCount.toString() : '…'} />
        <KpiCard title="Open Sell Signals" value="0" />
        <KpiCard title="Total ROI" value={totalRoi} />
      </div>

      {/* Two-column feeds */}
      <div className="grid md:grid-cols-2 gap-6 mb-6">
        <div>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">
            Recent Deal Alerts
          </h2>
          <EmptyFeed
            title="No active deal alerts"
            message="Deal alerts will appear here when cards matching your criteria are found."
          />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">
            Top Sell Signals
          </h2>
          <EmptyFeed
            title="No sell signals"
            message="Sell signals will appear here when cards in your portfolio are ready to move."
          />
        </div>
      </div>

      {/* Recent activity */}
      <div>
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">
          Recent Activity
        </h2>
        <EmptyFeed
          title="No recent activity"
          message="Your activity will appear here."
        />
      </div>
    </div>
  )
}
