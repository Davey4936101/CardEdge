'use client'

import { useEffect, useState } from 'react'
import { ExternalLink, ShoppingCart, TrendingUp, Clock, Award, Zap, AlertTriangle, BarChart2, RefreshCw } from 'lucide-react'
import { useRouter } from 'next/navigation'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { supabase } from '@/lib/supabase/client'
import {
  isGraded,
  isRookie,
  dealScore,
  recommendedAction,
  type Alert,
} from '@/lib/deals/deal-score'

// ── Types ──────────────────────────────────────────────────────────────────────

interface CompData {
  query: string
  comps: { price: number; saleDate: string }[]
  fairValue: number | null
  compCount: number
  oldestComp: string | null
  newestComp: string | null
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function timeUntil(dateStr: string): string | null {
  const ms = new Date(dateStr).getTime() - Date.now()
  if (ms <= 0) return 'Ended'
  const h = Math.floor(ms / (1000 * 60 * 60))
  const m = Math.floor((ms % (1000 * 60 * 60)) / 60_000)
  if (h < 1) return `${m}m remaining`
  if (h < 24) return `${h}h ${m}m remaining`
  const d = Math.floor(h / 24)
  return `${d}d ${h % 24}h remaining`
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function MetricRow({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex items-start justify-between py-2.5 border-b border-slate-800/60 last:border-0">
      <span className="text-sm text-slate-400">{label}</span>
      <div className="text-right">
        <span className="text-sm font-semibold text-slate-100">{value}</span>
        {sub && <p className="text-[10px] text-slate-500 mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

// ── Sparkline ─────────────────────────────────────────────────────────────────

function CompSparkline({ comps, fairValue }: { comps: CompData['comps']; fairValue: number | null }) {
  if (comps.length < 2) return null

  const W = 320
  const H = 90
  const padX = 8
  const padY = 10

  // Sort chronologically for the line
  const sorted = [...comps].sort((a, b) => new Date(a.saleDate).getTime() - new Date(b.saleDate).getTime())
  const prices = sorted.map((c) => c.price)
  const times = sorted.map((c) => new Date(c.saleDate).getTime())

  const minP = Math.min(...prices) * 0.9
  const maxP = Math.max(...prices) * 1.1
  const minT = Math.min(...times)
  const maxT = Math.max(...times)
  const tRange = maxT - minT || 1
  const pRange = maxP - minP || 1

  function tx(t: number) { return padX + ((t - minT) / tRange) * (W - padX * 2) }
  function ty(p: number) { return H - padY - ((p - minP) / pRange) * (H - padY * 2) }

  const pathD = sorted.map((c, i) => {
    const x = tx(new Date(c.saleDate).getTime())
    const y = ty(c.price)
    return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`
  }).join(' ')

  const fvY = fairValue ? ty(fairValue) : null
  const oldestDate = formatDate(sorted[0].saleDate)
  const newestDate = formatDate(sorted[sorted.length - 1].saleDate)

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H + 16}`} className="w-full" style={{ height: 100 }}>
        {/* Grid line */}
        <line x1={padX} y1={H - padY} x2={W - padX} y2={H - padY} stroke="#334155" strokeWidth="0.5" />

        {/* Fair value line */}
        {fvY !== null && fvY > padY && fvY < H - padY && (
          <>
            <line
              x1={padX} y1={fvY} x2={W - padX} y2={fvY}
              stroke="#10b981" strokeWidth="1" strokeDasharray="4 3" opacity="0.7"
            />
            <text x={W - padX + 2} y={fvY + 4} fontSize="8" fill="#10b981" opacity="0.8">FV</text>
          </>
        )}

        {/* Price line */}
        <path d={pathD} fill="none" stroke="#6366f1" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />

        {/* Data points */}
        {sorted.map((c, i) => (
          <circle
            key={i}
            cx={tx(new Date(c.saleDate).getTime())}
            cy={ty(c.price)}
            r="2.5"
            fill="#6366f1"
            opacity="0.85"
          />
        ))}

        {/* Y-axis labels */}
        <text x={padX} y={padY + 4} fontSize="8" fill="#64748b">${maxP > 1000 ? `${(maxP / 1000).toFixed(1)}k` : maxP.toFixed(0)}</text>
        <text x={padX} y={H - padY - 2} fontSize="8" fill="#64748b">${minP.toFixed(0)}</text>

        {/* X-axis labels */}
        <text x={padX} y={H + 12} fontSize="8" fill="#475569">{oldestDate}</text>
        <text x={W - padX} y={H + 12} fontSize="8" fill="#475569" textAnchor="end">{newestDate}</text>
      </svg>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

interface DealDetailSheetProps {
  alert: Alert | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function DealDetailSheet({ alert, open, onOpenChange }: DealDetailSheetProps) {
  const router = useRouter()
  const [compData, setCompData] = useState<CompData | null>(null)
  const [compLoading, setCompLoading] = useState(false)
  const [compError, setCompError] = useState<string | null>(null)
  const [showAllComps, setShowAllComps] = useState(false)

  // Fetch comps whenever the sheet opens with a new alert
  useEffect(() => {
    if (!open || !alert) return
    setCompData(null)
    setCompError(null)
    setShowAllComps(false)

    const fetchComps = async () => {
      setCompLoading(true)
      try {
        const { data: session } = await supabase.auth.getSession()
        const token = session.session?.access_token
        const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {}

        // Use card title for most specific comps; fall back to player+grade query
        const query = alert.card_title
        const res = await fetch(`/api/deals/comps?query=${encodeURIComponent(query)}`, { headers })
        if (!res.ok) {
          const j = (await res.json()) as { error?: string }
          setCompError(j.error ?? 'Failed to load comps')
          return
        }
        setCompData((await res.json()) as CompData)
      } catch {
        setCompError('Could not load comp data')
      } finally {
        setCompLoading(false)
      }
    }
    void fetchComps()
  }, [open, alert?.id])

  if (!alert) return null

  const score = dealScore(alert)
  const action = recommendedAction(alert)
  const graded = isGraded(alert.grade, alert.card_title)
  const rookie = isRookie(alert.card_title)
  const isOffer = alert.buying_format === 'accepts_offers'
  const listingTypeLabel = isOffer ? 'Make Offer' : 'Buy It Now'
  const discount = alert.fair_value - alert.listed_price
  const discountPct = alert.roi_pct
  const endTimeLabel = alert.end_time ? timeUntil(alert.end_time) : null
  const hoursLeft = alert.end_time
    ? (new Date(alert.end_time).getTime() - Date.now()) / (1000 * 60 * 60)
    : null

  // Score breakdown
  const roiContrib = alert.roi_pct * 0.6
  let urgencyBonus = 0
  if (hoursLeft !== null && hoursLeft > 0) {
    if (hoursLeft <= 6) urgencyBonus = 20
    else if (hoursLeft <= 24) urgencyBonus = 10
    else if (hoursLeft <= 72) urgencyBonus = 5
  }
  const gradedBonus = graded ? 5 : 0

  // Mismatch detection: very high ROI relative to a low listed price suggests
  // the stored fair value was computed from different-grade or different-card comps.
  const suspiciouslyHighRoi = alert.roi_pct > 70 && alert.listed_price < alert.fair_value * 0.15
  // Corroborate: if live comps give a very different fair value
  const liveFv = compData?.fairValue
  const fvDivergence = liveFv && Math.abs(liveFv - alert.fair_value) / alert.fair_value > 0.3

  function handleTrackBuy() {
    const params = new URLSearchParams({
      addFrom: 'alert',
      alertId: alert!.id,
      player: alert!.player ?? '',
      set: alert!.set_name ?? '',
      grade: alert!.grade ?? '',
      price: alert!.listed_price.toString(),
    })
    router.push(`/portfolio?${params.toString()}`)
  }

  const visibleComps = showAllComps ? (compData?.comps ?? []) : (compData?.comps ?? []).slice(0, 8)

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-[500px] overflow-y-auto p-0 bg-slate-900 border-slate-800">
        <SheetHeader className="px-5 py-4 border-b border-slate-800 sticky top-0 bg-slate-900 z-10">
          <SheetTitle className="text-slate-100 text-base leading-snug pr-6 line-clamp-2">
            {alert.card_title}
          </SheetTitle>
        </SheetHeader>

        <div className="px-5 py-4 flex flex-col gap-4">

          {/* Image + badges */}
          <div className="flex gap-4">
            <div className="w-[110px] h-[154px] flex-shrink-0 rounded-xl overflow-hidden bg-slate-800 border border-slate-700/50">
              {alert.image_url ? (
                <img src={alert.image_url} alt={alert.card_title} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-slate-600">
                  <svg className="size-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <path d="M3 9h18M9 21V9" />
                  </svg>
                </div>
              )}
            </div>
            <div className="flex flex-col gap-2 pt-1 flex-1 min-w-0">
              <div className="flex flex-wrap gap-1.5">
                {graded && alert.grade && alert.grade !== 'Any' && (
                  <span className="text-xs bg-amber-500/15 text-amber-400 border border-amber-500/25 px-2 py-0.5 rounded-md font-mono">
                    {alert.grade}
                  </span>
                )}
                {rookie && (
                  <span className="text-xs bg-indigo-500/15 text-indigo-400 border border-indigo-500/25 px-2 py-0.5 rounded-md font-mono">
                    Rookie Card
                  </span>
                )}
                {isOffer ? (
                  <span className="text-xs bg-violet-500/15 text-violet-400 border border-violet-500/25 px-2 py-0.5 rounded-md font-mono">
                    Make Offer
                  </span>
                ) : (
                  <span className="text-xs bg-teal-500/15 text-teal-400 border border-teal-500/25 px-2 py-0.5 rounded-md font-mono">
                    Buy It Now
                  </span>
                )}
                {alert.sport && (
                  <span className="text-xs bg-slate-700/50 text-slate-400 border border-slate-700 px-2 py-0.5 rounded-md">
                    {alert.sport}
                  </span>
                )}
                {alert.set_name && (
                  <span className="text-xs bg-slate-700/50 text-slate-400 border border-slate-700 px-2 py-0.5 rounded-md">
                    {alert.set_name}
                  </span>
                )}
                {alert.player && (
                  <span className="text-xs bg-slate-700/50 text-slate-400 border border-slate-700 px-2 py-0.5 rounded-md">
                    {alert.player}
                  </span>
                )}
              </div>
              {endTimeLabel && (
                <div className={`flex items-center gap-1.5 text-xs ${hoursLeft !== null && hoursLeft <= 6 ? 'text-red-400' : 'text-slate-400'}`}>
                  <Clock className="size-3.5" />
                  {endTimeLabel}
                </div>
              )}
              <div className="mt-auto">
                <a
                  href={alert.listing_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-2 rounded-lg transition-colors"
                >
                  View on eBay <ExternalLink className="size-3" />
                </a>
              </div>
            </div>
          </div>

          {/* Mismatch warning */}
          {(suspiciouslyHighRoi || fvDivergence) && (
            <div className="flex gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
              <AlertTriangle className="size-4 text-amber-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-amber-300 mb-1">Possible comp mismatch — verify before buying</p>
                <p className="text-[11px] text-amber-200/70 leading-relaxed">
                  {suspiciouslyHighRoi
                    ? `This listing is priced at only ${((alert.listed_price / alert.fair_value) * 100).toFixed(0)}% of the stored fair value. This can happen when sold comps are from a higher-grade version of the same card. Check the comp history below to confirm.`
                    : `The live fair value ($${liveFv!.toFixed(2)}) differs significantly from the stored fair value ($${alert.fair_value.toFixed(2)}). Comps may have shifted since the scan.`
                  }
                </p>
              </div>
            </div>
          )}

          {/* Recommended action */}
          <div className="rounded-xl border border-slate-800 bg-slate-800/30 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Zap className="size-4 text-indigo-400" />
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Recommended Action</span>
            </div>
            <p className={`text-xl font-bold ${action.color} mb-2`}>{action.label}</p>
            <p className="text-sm text-slate-400 leading-relaxed">{action.reason}</p>
          </div>

          {/* Pricing metrics */}
          <div className="rounded-xl border border-slate-800 bg-slate-800/30 p-4">
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="size-4 text-indigo-400" />
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Pricing</span>
            </div>
            <MetricRow
              label={listingTypeLabel + ' Price'}
              value={`$${alert.listed_price.toFixed(2)}`}
              sub="Confirmed buy price — not a bid"
            />
            <MetricRow
              label="Stored Fair Value"
              value={`$${alert.fair_value.toFixed(2)}`}
              sub="Time-weighted avg of 90-day sold comps at scan time"
            />
            {liveFv !== null && liveFv !== undefined && (
              <MetricRow
                label="Live Fair Value"
                value={`$${liveFv.toFixed(2)}`}
                sub={`From ${compData?.compCount ?? '?'} live comps — may differ from stored`}
              />
            )}
            <MetricRow
              label="Discount"
              value={`$${discount.toFixed(2)} (${discountPct.toFixed(1)}%)`}
              sub="Amount below stored fair value"
            />
            <MetricRow
              label="Est. Net ROI"
              value={discountPct - 15 <= 0 ? '~0% after fees' : `~${(discountPct - 15).toFixed(1)}%`}
              sub="After ~13% eBay fees + ~2% shipping"
            />
          </div>

          {/* Comp history */}
          <div className="rounded-xl border border-slate-800 bg-slate-800/30 p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <BarChart2 className="size-4 text-indigo-400" />
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Sale History</span>
              </div>
              {compData && (
                <span className="text-[10px] text-slate-600">{compData.compCount} sold comps</span>
              )}
            </div>

            {compLoading && (
              <div className="space-y-2">
                <div className="h-24 rounded-lg bg-slate-800/60 animate-pulse" />
                <div className="space-y-1.5">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="h-5 rounded bg-slate-800/60 animate-pulse" />
                  ))}
                </div>
              </div>
            )}

            {compError && !compLoading && (
              <div className="flex items-center gap-2 text-xs text-slate-500 py-2">
                <RefreshCw className="size-3.5" />
                <span>{compError}</span>
              </div>
            )}

            {compData && !compLoading && (
              <>
                {/* Query used */}
                <div className="mb-3 flex items-start gap-1.5">
                  <span className="text-[10px] text-slate-600 flex-shrink-0 mt-0.5">Query:</span>
                  <span className="text-[10px] text-slate-500 font-mono leading-tight break-all">&ldquo;{compData.query}&rdquo;</span>
                </div>

                {compData.comps.length === 0 ? (
                  <p className="text-xs text-slate-500 py-2">No sold comps found for this query. Fair value may be unreliable.</p>
                ) : (
                  <>
                    {/* Sparkline */}
                    <div className="mb-3">
                      <CompSparkline comps={compData.comps} fairValue={alert.fair_value} />
                    </div>

                    {/* Comp table */}
                    <div className="space-y-0">
                      <div className="flex justify-between text-[10px] text-slate-600 pb-1 border-b border-slate-800/60 mb-1">
                        <span>Sale date</span>
                        <span>Price</span>
                      </div>
                      {visibleComps.map((c, i) => {
                        const delta = ((c.price - alert.fair_value) / alert.fair_value) * 100
                        return (
                          <div key={i} className="flex items-center justify-between py-1 border-b border-slate-800/40 last:border-0">
                            <span className="text-[11px] text-slate-500">{formatDate(c.saleDate)}</span>
                            <div className="flex items-center gap-2">
                              <span className={`text-[10px] ${delta > 5 ? 'text-emerald-500/60' : delta < -5 ? 'text-red-500/60' : 'text-slate-600'}`}>
                                {delta > 0 ? '+' : ''}{delta.toFixed(0)}%
                              </span>
                              <span className="text-[11px] font-semibold text-slate-300 font-mono tabular-nums w-14 text-right">
                                ${c.price.toFixed(2)}
                              </span>
                            </div>
                          </div>
                        )
                      })}
                      {compData.comps.length > 8 && (
                        <button
                          onClick={() => setShowAllComps((v) => !v)}
                          className="text-[10px] text-slate-500 hover:text-slate-300 mt-1.5 transition-colors"
                        >
                          {showAllComps ? 'Show less' : `Show all ${compData.comps.length} comps`}
                        </button>
                      )}
                    </div>

                    {compData.oldestComp && compData.newestComp && (
                      <p className="text-[10px] text-slate-600 mt-2">
                        {formatDate(compData.newestComp)} — {formatDate(compData.oldestComp)} · FV uses exponential decay weighting (recent sales count more)
                      </p>
                    )}
                  </>
                )}
              </>
            )}
          </div>

          {/* Deal score breakdown */}
          <div className="rounded-xl border border-slate-800 bg-slate-800/30 p-4">
            <div className="flex items-center gap-2 mb-3">
              <Award className="size-4 text-indigo-400" />
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Deal Score: {score.toFixed(0)}</span>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-400">ROI component (60% of {discountPct.toFixed(1)}%)</span>
                <span className="text-slate-200 font-mono">+{roiContrib.toFixed(1)}</span>
              </div>
              {urgencyBonus > 0 && (
                <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-400">
                    Urgency bonus {hoursLeft !== null && hoursLeft <= 6 ? '(ends <6h)' : hoursLeft !== null && hoursLeft <= 24 ? '(ends <24h)' : '(ends <72h)'}
                  </span>
                  <span className="text-amber-400 font-mono">+{urgencyBonus}</span>
                </div>
              )}
              {gradedBonus > 0 && (
                <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-400">Graded premium (certified condition)</span>
                  <span className="text-indigo-400 font-mono">+{gradedBonus}</span>
                </div>
              )}
              <div className="flex justify-between items-center text-sm border-t border-slate-700 pt-2 mt-2">
                <span className="text-slate-300 font-medium">Total</span>
                <span className="text-slate-100 font-bold font-mono">{score.toFixed(1)}</span>
              </div>
            </div>
            <p className="text-[10px] text-slate-600 mt-3">
              Scores above 40 are strong, 25–40 are good, below 25 are marginal.
            </p>
          </div>

          {/* CTA */}
          <div className="flex gap-2 pb-2">
            <Button className="flex-1" onClick={handleTrackBuy}>
              <ShoppingCart className="size-4" /> Track Buy in Portfolio
            </Button>
            <a
              href={alert.listing_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm font-medium border border-slate-700 hover:border-slate-600 text-slate-300 hover:text-white px-4 py-2 rounded-lg transition-colors"
            >
              eBay <ExternalLink className="size-3.5" />
            </a>
          </div>

        </div>
      </SheetContent>
    </Sheet>
  )
}
