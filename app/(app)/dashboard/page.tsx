import { KpiCard } from '@/components/dashboard/KpiCard'
import { EmptyFeed } from '@/components/dashboard/EmptyFeed'

export default function DashboardPage() {
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
        <KpiCard title="Portfolio Value" value="$0.00" />
        <KpiCard title="Active Deal Alerts" value="0" />
        <KpiCard title="Open Sell Signals" value="0" />
        <KpiCard title="Total ROI" value="0.00%" />
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
