'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ExternalLink } from 'lucide-react'
import { KpiCard } from '@/components/dashboard/KpiCard'
import { EmptyFeed } from '@/components/dashboard/EmptyFeed'
import { timeAgo, greeting } from '@/lib/utils'
import type { PortfolioSummary } from '@/lib/portfolio/types'
import type { Alert } from '@/lib/deals/deal-score'

export default function DashboardPage() {
  const [summary, setSummary] = useState<PortfolioSummary | null>(null)
  const [alerts, setAlerts] = useState<Alert[] | null>(null)

  useEffect(() => {
    void fetch('/api/portfolio/summary')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: PortfolioSummary | null) => { if (d) setSummary(d) })

    void fetch('/api/alerts')
      .then((r) => (r.ok ? r.json() : []))
      .then((d: Alert[]) => setAlerts(Array.isArray(d) ? d : []))
  }, [])

  const portfolioValue = summary
    ? `$${summary.portfolioValue.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
    : '…'

  const totalRoi = summary
    ? `${summary.unrealizedPnlPct >= 0 ? '+' : ''}${summary.unrealizedPnlPct.toFixed(2)}%`
    : '…'

  const avgDealRoi = alerts && alerts.length > 0
    ? alerts.reduce((s, a) => s + a.roi_pct, 0) / alerts.length
    : null

  const globalCount = alerts ? alerts.filter(a => a.watchlist_id === null).length : null
  const watchlistCount = alerts ? alerts.filter(a => a.watchlist_id !== null).length : null
  const alertCountDisplay = alerts !== null
    ? `${globalCount} global · ${watchlistCount} watchlist`
    : '…'

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
          {greeting()}, David.
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
        <KpiCard title="Active Deal Alerts" value={alertCountDisplay} />
        <KpiCard title="Unrealized ROI" value={totalRoi} />
        <KpiCard title="Avg Deal ROI" value={avgDealRoi !== null ? `+${avgDealRoi.toFixed(1)}%` : '…'} />
      </div>

      {/* Two-column feeds */}
      <div className="grid md:grid-cols-2 gap-6 mb-6">
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Recent Deal Alerts
            </h2>
            <Link href="/deals" className="text-xs text-indigo-500 hover:text-indigo-400">
              View all →
            </Link>
          </div>
          {alerts === null ? (
            <p className="text-sm text-slate-400 py-4">Loading…</p>
          ) : alerts.length === 0 ? (
            <>
              <EmptyFeed
                title="No deals scanned yet"
                message="Visit Deals to run a scan."
              />
              <div className="mt-2 text-center">
                <Link href="/deals" className="text-xs font-semibold text-indigo-500 hover:text-indigo-400 border border-indigo-500/30 px-3 py-1.5 rounded-lg transition-colors">
                  Go to Deals →
                </Link>
              </div>
            </>
          ) : (
            <div className="space-y-2">
              {alerts.slice(0, 5).map((alert) => (
                <div
                  key={alert.id}
                  className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                    alert.is_read
                      ? 'border-slate-200 dark:border-slate-800'
                      : 'border-indigo-200 dark:border-indigo-900 bg-indigo-50/30 dark:bg-indigo-950/20'
                  }`}
                >
                  <div
                    className={`flex-shrink-0 w-12 h-12 flex items-center justify-center rounded-md text-xs font-mono font-bold border ${
                      alert.roi_pct >= 15
                        ? 'bg-green-500/20 text-green-600 dark:text-green-400 border-green-500/30'
                        : alert.roi_pct >= 10
                        ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-500/30'
                        : 'bg-red-500/20 text-red-500 border-red-500/30'
                    }`}
                  >
                    {alert.roi_pct >= 0 ? '+' : ''}{alert.roi_pct.toFixed(0)}%
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                      {alert.card_title}
                    </p>
                    <p className="text-xs text-slate-500">
                      ${alert.listed_price.toFixed(0)} · {timeAgo(alert.created_at)}
                    </p>
                  </div>
                  <a
                    href={alert.listing_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-shrink-0 text-slate-400 hover:text-indigo-500 transition-colors"
                  >
                    <ExternalLink className="size-3.5" />
                  </a>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Portfolio Summary
            </h2>
            <Link href="/portfolio" className="text-xs text-indigo-500 hover:text-indigo-400">
              View all →
            </Link>
          </div>
          {summary && summary.positionCount > 0 ? (
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800">
              <div className="grid grid-cols-3 px-4 py-3">
                <Stat label="Raw" value={summary.statusBreakdown.raw_owned} />
                <Stat label="Submitted" value={summary.statusBreakdown.submitted} />
                <Stat label="Graded" value={summary.statusBreakdown.graded_owned} />
              </div>
              <div className="px-4 py-3">
                <p className="text-xs text-slate-500 mb-0.5">Unrealized P&L</p>
                <p className={`text-sm font-semibold font-mono ${summary.unrealizedPnl >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500'}`}>
                  {summary.unrealizedPnl >= 0 ? '+' : ''}${summary.unrealizedPnl.toFixed(0)} ({summary.unrealizedPnlPct >= 0 ? '+' : ''}{summary.unrealizedPnlPct.toFixed(1)}%)
                </p>
              </div>
            </div>
          ) : (
            <EmptyFeed
              title="No positions yet"
              message="Add cards to your portfolio to track performance."
            />
          )}
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

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-lg font-bold text-slate-900 dark:text-slate-100">{value}</p>
    </div>
  )
}
