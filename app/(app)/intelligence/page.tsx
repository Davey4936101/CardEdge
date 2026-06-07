'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ExternalLink, Zap, TrendingUp, Award, Clock } from 'lucide-react'
import type { Alert } from '@/lib/deals/deal-score'
import { timeAgo } from '@/lib/utils'

type GradeHistory = {
  id: string
  card_key: string
  mode: string
  status: string
  recommendation: Record<string, unknown> | null
  reliability_score: number | null
  raw_price: number | null
  ep_regular: number | null
  created_at: string
}

function timeUntil(dateStr: string): { label: string; urgent: boolean } | null {
  const ms = new Date(dateStr).getTime() - Date.now()
  if (ms <= 0) return null
  const urgent = ms < 6 * 60 * 60 * 1000
  const h = Math.floor(ms / (1000 * 60 * 60))
  const m = Math.floor((ms % (1000 * 60 * 60)) / 60_000)
  if (h < 1) return { label: `${m}m left`, urgent }
  return { label: `${h}h ${m}m left`, urgent }
}

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-indigo-400">{icon}</span>
        <h2 className="text-sm font-semibold text-slate-100">{title}</h2>
      </div>
      {children}
    </section>
  )
}

export default function IntelligencePage() {
  const [alerts, setAlerts] = useState<Alert[] | null>(null)
  const [gradeHistory, setGradeHistory] = useState<GradeHistory[] | null>(null)
  const [lastUpdated] = useState(() => new Date())

  useEffect(() => {
    void fetch('/api/alerts')
      .then((r) => (r.ok ? r.json() : []))
      .then((d: Alert[]) => setAlerts(Array.isArray(d) ? d : []))

    void fetch('/api/grade/history')
      .then((r) => (r.ok ? r.json() : []))
      .then((d: GradeHistory[]) => setGradeHistory(Array.isArray(d) ? d : []))
  }, [])

  const loading = alerts === null || gradeHistory === null

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="h-8 bg-slate-800 rounded animate-pulse w-56 mb-2" />
        <div className="h-4 bg-slate-800 rounded animate-pulse w-80 mb-8" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[...Array(4)].map((_, i) => <div key={i} className="h-24 rounded-xl bg-slate-800 animate-pulse" />)}
        </div>
      </div>
    )
  }

  const globalAlerts = alerts.filter((a) => a.watchlist_id === null)
  const avgRoi = globalAlerts.length > 0
    ? globalAlerts.reduce((s, a) => s + a.roi_pct, 0) / globalAlerts.length
    : 0
  const highestRoiDeal = globalAlerts.length > 0
    ? globalAlerts.reduce((best, a) => (a.roi_pct > best.roi_pct ? a : best), globalAlerts[0])
    : null
  const endingSoonCount = globalAlerts.filter((a) => {
    if (!a.end_time) return false
    const ms = new Date(a.end_time).getTime() - Date.now()
    return ms > 0 && ms < 6 * 60 * 60 * 1000
  }).length

  // Player groupings — ≥2 deals
  const playerMap = new Map<string, Alert[]>()
  for (const a of globalAlerts) {
    const key = a.player ?? 'Unknown'
    if (!playerMap.has(key)) playerMap.set(key, [])
    playerMap.get(key)!.push(a)
  }
  const playerSegments = Array.from(playerMap.entries())
    .filter(([, list]) => list.length >= 2)
    .map(([player, list]) => ({
      player,
      count: list.length,
      avgRoi: list.reduce((s, a) => s + a.roi_pct, 0) / list.length,
      bestDeal: list.reduce((best, a) => (a.roi_pct > best.roi_pct ? a : best), list[0]),
    }))
    .sort((a, b) => b.avgRoi - a.avgRoi)

  // Grade opportunity
  const gradeCount = gradeHistory.length
  const avgReliability = gradeCount > 0
    ? gradeHistory.reduce((s, g) => s + (g.reliability_score ?? 0), 0) / gradeCount
    : 0
  const avgExpectedRoi = gradeCount > 0
    ? gradeHistory
        .filter((g) => g.ep_regular !== null && g.raw_price !== null && g.raw_price > 0)
        .reduce((s, g) => {
          const roi = ((g.ep_regular! - g.raw_price!) / g.raw_price!) * 100
          return s + roi
        }, 0) /
        Math.max(
          1,
          gradeHistory.filter((g) => g.ep_regular !== null && g.raw_price !== null && g.raw_price > 0).length
        )
    : 0
  const topGradeCard = gradeHistory.length > 0 ? gradeHistory[0] : null

  // Action queue — alerts ending <24h
  const actionQueue = alerts
    .filter((a) => {
      if (!a.end_time) return false
      const ms = new Date(a.end_time).getTime() - Date.now()
      return ms > 0 && ms < 24 * 60 * 60 * 1000
    })
    .sort((a, b) => new Date(a.end_time!).getTime() - new Date(b.end_time!).getTime())

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <div className="flex items-start justify-between mb-8 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Intelligence</h1>
          <p className="text-sm text-slate-400 mt-1">Market signals, segment analysis, and grading opportunities.</p>
        </div>
        <p className="text-xs text-slate-600 flex-shrink-0 mt-1">
          Updated {timeAgo(lastUpdated.toISOString())}
        </p>
      </div>

      {/* Market Snapshot */}
      <Section title="Market Snapshot" icon={<TrendingUp className="size-4" />}>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
            <p className="text-[10px] font-mono uppercase tracking-widest text-slate-500 mb-1">Global Deals</p>
            <p className="text-xl font-bold font-mono text-slate-100">{globalAlerts.length}</p>
            <p className="text-xs text-slate-500 mt-0.5">In system now</p>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
            <p className="text-[10px] font-mono uppercase tracking-widest text-slate-500 mb-1">Avg ROI</p>
            <p className={`text-xl font-bold font-mono ${avgRoi >= 15 ? 'text-green-400' : avgRoi >= 10 ? 'text-amber-400' : 'text-slate-400'}`}>
              {globalAlerts.length > 0 ? `+${avgRoi.toFixed(1)}%` : '—'}
            </p>
            <p className="text-xs text-slate-500 mt-0.5">Across all deals</p>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
            <p className="text-[10px] font-mono uppercase tracking-widest text-slate-500 mb-1">Top Deal</p>
            {highestRoiDeal ? (
              <>
                <p className="text-xl font-bold font-mono text-emerald-400">+{highestRoiDeal.roi_pct.toFixed(0)}%</p>
                <Link href="/deals" className="text-xs text-indigo-400 hover:text-indigo-300 mt-0.5 block truncate">
                  {highestRoiDeal.player ?? highestRoiDeal.card_title} →
                </Link>
              </>
            ) : (
              <p className="text-xl font-bold font-mono text-slate-500">—</p>
            )}
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
            <p className="text-[10px] font-mono uppercase tracking-widest text-slate-500 mb-1">Ending &lt;6h</p>
            <p className={`text-xl font-bold font-mono ${endingSoonCount > 0 ? 'text-red-400' : 'text-slate-400'}`}>
              {endingSoonCount}
            </p>
            <p className="text-xs text-slate-500 mt-0.5">Act fast</p>
          </div>
        </div>
      </Section>

      {/* Best Value Segments */}
      <Section title="Best Value Segments" icon={<Award className="size-4" />}>
        {playerSegments.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-800 py-10 text-center">
            <p className="text-sm text-slate-500">Need ≥2 deals per player to show segments.</p>
            <Link href="/deals" className="text-xs text-indigo-400 hover:text-indigo-300 mt-1 block">
              Run a scan to find deals →
            </Link>
          </div>
        ) : (
          <div className="rounded-xl border border-slate-800 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b border-slate-800 bg-slate-900/80">
                  <tr>
                    {['Player', 'Deals', 'Avg ROI', 'Best Deal'].map((h) => (
                      <th key={h} className="text-left text-[10px] font-mono uppercase tracking-wider px-4 py-2.5 text-slate-500">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {playerSegments.map(({ player, count, avgRoi: aRoi, bestDeal }) => (
                    <tr key={player} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                      <td className="px-4 py-3 text-sm font-semibold text-slate-100">{player}</td>
                      <td className="px-4 py-3 text-sm font-mono text-slate-400">{count}</td>
                      <td className="px-4 py-3">
                        <span className={`text-sm font-mono font-bold ${aRoi >= 20 ? 'text-emerald-400' : aRoi >= 15 ? 'text-green-400' : 'text-amber-400'}`}>
                          +{aRoi.toFixed(1)}%
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <a
                          href={bestDeal.listing_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
                        >
                          +{bestDeal.roi_pct.toFixed(0)}% ROI
                          <ExternalLink className="size-3" />
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Section>

      {/* Grade Opportunity */}
      <Section title="Grade Opportunity" icon={<Zap className="size-4" />}>
        {gradeCount === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-800 py-10 text-center">
            <p className="text-sm text-slate-500">No grade analyses run yet.</p>
            <Link href="/grade" className="text-xs text-indigo-400 hover:text-indigo-300 mt-1 block">
              Run your first analysis →
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
              <p className="text-[10px] font-mono uppercase tracking-widest text-slate-500 mb-1">Analyses Run</p>
              <p className="text-xl font-bold font-mono text-slate-100">{gradeCount}</p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
              <p className="text-[10px] font-mono uppercase tracking-widest text-slate-500 mb-1">Avg Confidence</p>
              <p className={`text-xl font-bold font-mono ${avgReliability >= 70 ? 'text-green-400' : avgReliability >= 50 ? 'text-amber-400' : 'text-red-400'}`}>
                {avgReliability.toFixed(0)}%
              </p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
              <p className="text-[10px] font-mono uppercase tracking-widest text-slate-500 mb-1">Avg Expected ROI</p>
              <p className={`text-xl font-bold font-mono ${avgExpectedRoi >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {avgExpectedRoi >= 0 ? '+' : ''}{avgExpectedRoi.toFixed(1)}%
              </p>
              <p className="text-xs text-slate-500 mt-0.5">vs raw purchase price</p>
            </div>
            {topGradeCard && (
              <div className="sm:col-span-3 rounded-xl border border-slate-800 bg-slate-900/40 p-4">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-[10px] font-mono uppercase tracking-widest text-slate-500 mb-1">Most Recent Analysis</p>
                    <p className="text-sm font-semibold text-slate-100">{topGradeCard.card_key}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{timeAgo(topGradeCard.created_at)} · {topGradeCard.mode} mode</p>
                  </div>
                  <Link
                    href="/grade"
                    className="flex-shrink-0 text-xs font-semibold text-indigo-400 hover:text-indigo-300 border border-indigo-800 hover:border-indigo-600 px-3 py-1.5 rounded-lg transition-colors"
                  >
                    New Analysis →
                  </Link>
                </div>
              </div>
            )}
          </div>
        )}
      </Section>

      {/* Action Queue */}
      <Section title="Act Now" icon={<Clock className="size-4" />}>
        {actionQueue.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-800 py-10 text-center">
            <p className="text-sm text-slate-500">No deals ending in the next 24 hours.</p>
            <Link href="/deals" className="text-xs text-indigo-400 hover:text-indigo-300 mt-1 block">
              Browse all deals →
            </Link>
          </div>
        ) : (
          <div className="space-y-2">
            {actionQueue.map((alert) => {
              const end = timeUntil(alert.end_time!)
              return (
                <div
                  key={alert.id}
                  className="flex items-center gap-3 p-3 rounded-xl border border-slate-800 bg-slate-900/40 hover:border-slate-700 transition-colors"
                >
                  <div className={`flex-shrink-0 flex flex-col items-center justify-center rounded-lg border font-mono font-bold px-2 py-1 min-w-[48px] ${
                    alert.roi_pct >= 25
                      ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                      : alert.roi_pct >= 15
                      ? 'bg-green-500/15 text-green-400 border-green-500/30'
                      : 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                  }`}>
                    <span className="text-sm leading-none">+{alert.roi_pct.toFixed(0)}%</span>
                    <span className="text-[9px] font-normal opacity-70 mt-0.5">ROI</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-100 truncate">{alert.card_title}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-slate-500">${alert.listed_price.toFixed(0)}</span>
                      {end && (
                        <span className={`flex items-center gap-0.5 text-[10px] font-medium ${end.urgent ? 'text-red-400' : 'text-amber-400'}`}>
                          <Clock className="size-2.5" />
                          {end.label}
                        </span>
                      )}
                    </div>
                  </div>
                  <a
                    href={alert.listing_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-shrink-0 flex items-center gap-1 text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white px-2.5 py-1.5 rounded-lg transition-colors"
                  >
                    eBay <ExternalLink className="size-3" />
                  </a>
                </div>
              )
            })}
          </div>
        )}
      </Section>
    </div>
  )
}
