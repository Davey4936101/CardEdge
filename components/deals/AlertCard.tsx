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

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => { if (!alert.is_read) onRead(alert.id) }}
      onKeyDown={(e) => { if (e.key === 'Enter' && !alert.is_read) onRead(alert.id) }}
      className={`relative flex gap-3 p-4 rounded-lg border transition-colors cursor-pointer ${
        alert.is_read
          ? 'border-slate-200 dark:border-slate-800'
          : 'border-indigo-200 dark:border-indigo-900 bg-indigo-50/30 dark:bg-indigo-950/20'
      }`}
    >
      {!alert.is_read && (
        <span className="absolute top-4 right-4 w-2 h-2 rounded-full bg-indigo-500" />
      )}
      {alert.image_url && (
        <img
          src={alert.image_url}
          alt={alert.card_title}
          className="w-12 h-12 object-cover rounded flex-shrink-0"
        />
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-900 dark:text-slate-100 leading-snug line-clamp-2">
          {alert.card_title}
        </p>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
            +{alert.roi_pct.toFixed(1)}% below market
          </span>
          {alert.grade && alert.grade !== 'Any' && (
            <span className="text-xs bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 px-1.5 py-0.5 rounded">
              {alert.grade}
            </span>
          )}
        </div>
        <p className="text-xs text-slate-500 mt-1">
          ${alert.listed_price.toFixed(2)} listed
          <span className="text-slate-400"> · ${alert.fair_value.toFixed(2)} FV</span>
        </p>
        <div className="flex items-center justify-between mt-2 gap-2 flex-wrap">
          <span className="text-xs text-slate-400">
            {alert.watchlists?.name} · {timeAgo(alert.created_at)}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={handleMarkPurchased}
              className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400 hover:text-green-500 transition-colors"
            >
              <ShoppingCart className="size-3" /> Track Buy
            </button>
            <a
              href={alert.listing_url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="flex items-center gap-1 text-xs text-indigo-500 hover:text-indigo-400 transition-colors"
            >
              View on eBay <ExternalLink className="size-3" />
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
