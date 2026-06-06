'use client'

import { useRouter } from 'next/navigation'
import { ExternalLink, ShoppingCart } from 'lucide-react'

export interface Alert {
  id: string
  card_title: string
  listed_price: number
  fair_value: number
  roi_pct: number
  grade: string | null
  player: string | null
  set_name: string | null
  listing_url: string
  image_url: string | null
  end_time: string | null
  is_read: boolean
  created_at: string
  watchlists: { name: string } | null
}

interface AlertCardProps {
  alert: Alert
  onRead: (id: string) => void
}

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (seconds < 60) return `${seconds}s ago`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}

function timeUntil(dateStr: string): string | null {
  const ms = new Date(dateStr).getTime() - Date.now()
  if (ms <= 0) return null
  const totalMins = Math.floor(ms / 60_000)
  if (totalMins < 60) return `Ends in ${totalMins}m`
  const h = Math.floor(totalMins / 60)
  const m = totalMins % 60
  return `Ends in ${h}h ${m}m`
}

function RoiBadge({ roi }: { roi: number }) {
  const color =
    roi >= 15
      ? 'bg-green-500/20 text-green-400 border-green-500/30'
      : roi >= 10
      ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
      : 'bg-red-500/20 text-red-400 border-red-500/30'

  return (
    <div
      className={`flex-shrink-0 w-16 flex items-center justify-center rounded-lg border font-mono font-bold text-base tabular-nums ${color}`}
      style={{ minHeight: '72px' }}
    >
      +{roi.toFixed(0)}%
    </div>
  )
}

export function AlertCard({ alert, onRead }: AlertCardProps) {
  const router = useRouter()

  function handleMarkPurchased(e: React.MouseEvent) {
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

  const endTimeLabel = alert.end_time ? timeUntil(alert.end_time) : null
  const endingSoon = alert.end_time
    ? new Date(alert.end_time).getTime() - Date.now() < 6 * 60 * 60 * 1000
    : false

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => { if (!alert.is_read) onRead(alert.id) }}
      onKeyDown={(e) => { if (e.key === 'Enter' && !alert.is_read) onRead(alert.id) }}
      className={`relative flex gap-3 p-4 rounded-lg border transition-colors cursor-pointer items-center ${
        alert.is_read
          ? 'border-slate-200 dark:border-slate-800'
          : 'border-indigo-200 dark:border-indigo-900 bg-indigo-50/30 dark:bg-indigo-950/20'
      }`}
    >
      {!alert.is_read && (
        <span className="absolute top-3 right-3 w-2 h-2 rounded-full bg-indigo-500" />
      )}

      <RoiBadge roi={alert.roi_pct} />

      <div className="flex-1 min-w-0 space-y-1">
        <p className="text-sm font-medium text-slate-900 dark:text-slate-100 leading-snug line-clamp-2">
          {alert.card_title}
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          {alert.grade && alert.grade !== 'Any' && (
            <span className="text-xs bg-amber-500/20 text-amber-400 border border-amber-500/30 px-1.5 py-0.5 rounded font-mono">
              {alert.grade}
            </span>
          )}
          <span className="text-xs font-mono tabular-nums text-slate-300">
            ${alert.listed_price.toFixed(2)} listed
            <span className="text-slate-500"> · ${alert.fair_value.toFixed(2)} FV</span>
          </span>
        </div>
        <p className="text-xs text-slate-500">
          {alert.watchlists?.name} · {timeAgo(alert.created_at)}
        </p>
      </div>

      <div className="flex-shrink-0 flex flex-col items-end gap-2">
        <a
          href={alert.listing_url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="flex items-center gap-1.5 text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded transition-colors"
        >
          Buy on eBay <ExternalLink className="size-3" />
        </a>
        <button
          onClick={handleMarkPurchased}
          className="flex items-center gap-1 text-xs text-slate-400 hover:text-green-400 transition-colors"
        >
          <ShoppingCart className="size-3" /> Track Buy
        </button>
        {endTimeLabel && (
          <span className={`text-xs font-mono tabular-nums ${endingSoon ? 'text-red-400' : 'text-slate-500'}`}>
            {endTimeLabel}
          </span>
        )}
      </div>
    </div>
  )
}
