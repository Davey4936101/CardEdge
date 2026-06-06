'use client'

import { ExternalLink, ShoppingCart, TrendingUp, Clock, Award, Zap } from 'lucide-react'
import { useRouter } from 'next/navigation'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import {
  isGraded,
  isRookie,
  dealScore,
  recommendedAction,
  type Alert,
} from '@/lib/deals/deal-score'

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

interface DealDetailSheetProps {
  alert: Alert | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function DealDetailSheet({ alert, open, onOpenChange }: DealDetailSheetProps) {
  const router = useRouter()

  if (!alert) return null

  const score = dealScore(alert)
  const action = recommendedAction(alert)
  const graded = isGraded(alert.grade)
  const rookie = isRookie(alert.card_title)
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

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-[480px] overflow-y-auto p-0 bg-slate-900 border-slate-800">
        <SheetHeader className="px-5 py-4 border-b border-slate-800 sticky top-0 bg-slate-900 z-10">
          <SheetTitle className="text-slate-100 text-base leading-snug pr-6 line-clamp-2">
            {alert.card_title}
          </SheetTitle>
        </SheetHeader>

        <div className="px-5 py-4 flex flex-col gap-5">

          {/* Image + badges */}
          <div className="flex gap-4">
            <div className="w-[120px] h-[168px] flex-shrink-0 rounded-xl overflow-hidden bg-slate-800 border border-slate-700/50">
              {alert.image_url ? (
                <img
                  src={alert.image_url}
                  alt={alert.card_title}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-slate-600">
                  <svg className="size-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <path d="M3 9h18M9 21V9" />
                  </svg>
                </div>
              )}
            </div>
            <div className="flex flex-col gap-2 pt-1">
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
            <MetricRow label="Listed Price" value={`$${alert.listed_price.toFixed(2)}`} />
            <MetricRow
              label="Fair Value"
              value={`$${alert.fair_value.toFixed(2)}`}
              sub="Time-weighted avg of 90-day sold comps (recent sales weighted higher)"
            />
            <MetricRow
              label="Discount"
              value={`$${discount.toFixed(2)} (${discountPct.toFixed(1)}%)`}
              sub="Amount below fair value"
            />
            <MetricRow
              label="Est. Net ROI"
              value={`~${(discountPct - 15).toFixed(1)}%`}
              sub="After ~13% eBay fees + ~2% shipping"
            />
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

          {/* Fair value methodology */}
          <div className="rounded-xl border border-slate-800/50 p-4 text-xs text-slate-500 leading-relaxed">
            <p className="font-medium text-slate-400 mb-1">Fair Value Methodology</p>
            <p>Fair value is calculated from sold comps on eBay over the past 90 days. More recent sales are weighted higher (exponential decay), so the estimate reflects current market conditions rather than outdated peaks or dips. Minimum 3 comps required.</p>
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
