'use client'

import { ExternalLink, ShoppingCart, Clock } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { isGraded, isRookie, dealScore, type Alert } from '@/lib/deals/deal-score'
import { timeAgo } from '@/lib/utils'

function timeUntil(dateStr: string): { label: string; urgent: boolean } | null {
  const ms = new Date(dateStr).getTime() - Date.now()
  if (ms <= 0) return null
  const totalMins = Math.floor(ms / 60_000)
  const urgent = ms < 6 * 60 * 60 * 1000
  if (totalMins < 60) return { label: `${totalMins}m left`, urgent }
  const h = Math.floor(totalMins / 60)
  const m = totalMins % 60
  return { label: m > 0 ? `${h}h ${m}m left` : `${h}h left`, urgent }
}

function RoiBadge({ roi }: { roi: number }) {
  const cls =
    roi >= 25
      ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
      : roi >= 15
      ? 'bg-green-500/15 text-green-400 border-green-500/30'
      : roi >= 10
      ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
      : 'bg-slate-500/15 text-slate-400 border-slate-500/30'
  return (
    <div className={`flex-shrink-0 flex flex-col items-center justify-center rounded-lg border font-mono font-bold tabular-nums px-2 py-1 min-w-[52px] ${cls}`}>
      <span className="text-base leading-none">{roi >= 0 ? '+' : ''}{roi.toFixed(0)}%</span>
      <span className="text-[9px] font-normal opacity-70 mt-0.5">ROI</span>
    </div>
  )
}

interface DealCardProps {
  alert: Alert
  onSelect: (alert: Alert) => void
  onRead: (id: string) => void
}

export function DealCard({ alert, onSelect, onRead }: DealCardProps) {
  const router = useRouter()
  const endTime = alert.end_time ? timeUntil(alert.end_time) : null
  const graded = isGraded(alert.grade)
  const rookie = isRookie(alert.card_title)
  const discount = alert.fair_value - alert.listed_price
  const score = dealScore(alert)

  function handleCardClick() {
    if (!alert.is_read) onRead(alert.id)
    onSelect(alert)
  }

  function handleTrackBuy(e: React.MouseEvent) {
    e.stopPropagation()
    const params = new URLSearchParams({
      addFrom: 'alert',
      alertId: alert.id,
      player: alert.player ?? '',
      set: alert.set_name ?? '',
      grade: alert.grade ?? '',
      price: alert.listed_price.toString(),
    })
    router.push(`/portfolio?${params.toString()}`)
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleCardClick}
      onKeyDown={(e) => { if (e.key === 'Enter') handleCardClick() }}
      className={`group flex gap-3 p-4 rounded-xl border transition-all cursor-pointer hover:border-indigo-500/50 hover:bg-slate-800/40 ${
        alert.is_read
          ? 'border-slate-800 bg-slate-900/30'
          : 'border-indigo-900/60 bg-indigo-950/20'
      }`}
    >
      {/* Card image */}
      <div className="flex-shrink-0 w-[72px] h-[100px] rounded-lg overflow-hidden bg-slate-800 border border-slate-700/50">
        {alert.image_url ? (
          <img
            src={alert.image_url}
            alt={alert.card_title}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-1 text-slate-600">
            <svg className="size-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path d="M3 9h18M9 21V9" />
            </svg>
          </div>
        )}
      </div>

      {/* Main content */}
      <div className="flex-1 min-w-0 flex flex-col justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-slate-100 leading-snug line-clamp-2 group-hover:text-white">
            {alert.card_title}
          </p>
          <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
            {graded && alert.grade && alert.grade !== 'Any' && (
              <span className="text-[10px] bg-amber-500/15 text-amber-400 border border-amber-500/25 px-1.5 py-0.5 rounded font-mono">
                {alert.grade}
              </span>
            )}
            {rookie && (
              <span className="text-[10px] bg-indigo-500/15 text-indigo-400 border border-indigo-500/25 px-1.5 py-0.5 rounded font-mono">
                RC
              </span>
            )}
            {alert.set_name && (
              <span className="text-[10px] bg-slate-700/50 text-slate-400 border border-slate-700 px-1.5 py-0.5 rounded">
                {alert.set_name}
              </span>
            )}
          </div>
        </div>

        <div>
          <div className="flex items-baseline gap-2">
            <span className="text-base font-bold text-slate-100 tabular-nums">
              ${alert.listed_price.toFixed(2)}
            </span>
            <span className="text-xs text-slate-500 tabular-nums">
              FV ${alert.fair_value.toFixed(2)}
            </span>
            <span className="text-xs text-emerald-500 tabular-nums font-medium">
              −${discount.toFixed(2)}
            </span>
          </div>
          <div className="flex items-center gap-2 mt-1">
            {endTime && (
              <span className={`flex items-center gap-1 text-[10px] tabular-nums ${endTime.urgent ? 'text-red-400' : 'text-slate-500'}`}>
                <Clock className="size-3" />
                {endTime.label}
              </span>
            )}
            <span className="text-[10px] text-slate-600">
              Score {score.toFixed(0)} · {timeAgo(alert.created_at)}
            </span>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-col items-end justify-between flex-shrink-0 gap-2">
        <RoiBadge roi={alert.roi_pct} />
        <div className="flex flex-col items-end gap-1.5">
          <a
            href={alert.listing_url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="flex items-center gap-1 text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white px-2.5 py-1.5 rounded-lg transition-colors"
          >
            View on eBay <ExternalLink className="size-3" />
          </a>
          <button
            onClick={handleTrackBuy}
            className="flex items-center gap-1 text-[10px] text-slate-500 hover:text-green-400 transition-colors"
          >
            <ShoppingCart className="size-3" /> Track Buy
          </button>
        </div>
      </div>
    </div>
  )
}
