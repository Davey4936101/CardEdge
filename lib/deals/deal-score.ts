export interface Alert {
  id: string
  watchlist_id: string | null
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

export type SortKey = 'deal_score' | 'ending_soon' | 'newest' | 'price_asc'

export interface FilterState {
  player: string
  gradedOnly: boolean
  rookieOnly: boolean
  minPrice: string
  maxPrice: string
  minRoi: string
}

export const DEFAULT_FILTERS: FilterState = {
  player: '',
  gradedOnly: false,
  rookieOnly: false,
  minPrice: '',
  maxPrice: '',
  minRoi: '5',
}

const GRADING_COMPANIES = ['psa', 'bgs', 'sgc', 'csg', 'cgc', 'hga', 'ace', 'beckett']

export function isGraded(grade: string | null): boolean {
  if (!grade) return false
  const g = grade.toLowerCase()
  return GRADING_COMPANIES.some((co) => g.includes(co))
}

export function isRookie(title: string): boolean {
  return /\brc\b|rookie/i.test(title)
}

/**
 * Deal score: combines ROI, time urgency, and graded premium.
 *
 * ROI contributes 60% of the raw score. Urgency bonuses reward auction
 * listings about to end (real scarcity). Graded cards carry a reliability
 * premium because condition is certified.
 */
export function dealScore(alert: Alert): number {
  let score = alert.roi_pct * 0.6

  if (alert.end_time) {
    const hoursLeft =
      (new Date(alert.end_time).getTime() - Date.now()) / (1000 * 60 * 60)
    if (hoursLeft > 0 && hoursLeft <= 6) score += 20
    else if (hoursLeft <= 24) score += 10
    else if (hoursLeft <= 72) score += 5
  }

  if (isGraded(alert.grade)) score += 5

  return score
}

export function applyFilters(alerts: Alert[], f: FilterState): Alert[] {
  const player = f.player.trim().toLowerCase()
  const minPrice = f.minPrice !== '' ? parseFloat(f.minPrice) : null
  const maxPrice = f.maxPrice !== '' ? parseFloat(f.maxPrice) : null
  const minRoi = f.minRoi !== '' ? parseFloat(f.minRoi) : null

  return alerts.filter((a) => {
    if (player && !a.player?.toLowerCase().includes(player) && !a.card_title.toLowerCase().includes(player)) return false
    if (f.gradedOnly && !isGraded(a.grade)) return false
    if (f.rookieOnly && !isRookie(a.card_title)) return false
    if (minPrice !== null && a.listed_price < minPrice) return false
    if (maxPrice !== null && a.listed_price > maxPrice) return false
    if (minRoi !== null && a.roi_pct < minRoi) return false
    return true
  })
}

export function sortAlerts(alerts: Alert[], key: SortKey): Alert[] {
  return [...alerts].sort((a, b) => {
    switch (key) {
      case 'deal_score':
        return dealScore(b) - dealScore(a)
      case 'ending_soon': {
        // Nulls (no end time) go last
        if (!a.end_time && !b.end_time) return 0
        if (!a.end_time) return 1
        if (!b.end_time) return -1
        return new Date(a.end_time).getTime() - new Date(b.end_time).getTime()
      }
      case 'newest':
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      case 'price_asc':
        return a.listed_price - b.listed_price
    }
  })
}

/**
 * Returns a recommended action and reasoning for a card investor.
 *
 * Thresholds:
 *   ≥30% ROI + ending <6h  → Strong Buy (urgency + big discount)
 *   ≥25% ROI              → Strong Buy
 *   ≥15% ROI              → Buy
 *   ≥10% ROI              → Watch
 *   <10% ROI              → Pass
 */
export function recommendedAction(alert: Alert): {
  label: 'Strong Buy' | 'Buy' | 'Watch' | 'Pass'
  color: string
  reason: string
} {
  const roi = alert.roi_pct
  const hoursLeft = alert.end_time
    ? (new Date(alert.end_time).getTime() - Date.now()) / (1000 * 60 * 60)
    : null
  const endingSoon = hoursLeft !== null && hoursLeft > 0 && hoursLeft <= 6
  const graded = isGraded(alert.grade)

  if (roi >= 30 && endingSoon) {
    return {
      label: 'Strong Buy',
      color: 'text-emerald-400',
      reason: `Exceptional ${roi.toFixed(0)}% discount with only ${Math.ceil(hoursLeft!)}h left — rare combination of value and urgency.`,
    }
  }
  if (roi >= 25) {
    return {
      label: 'Strong Buy',
      color: 'text-emerald-400',
      reason: `${roi.toFixed(0)}% below fair value${graded ? ' on a certified card' : ''} — strong margin of safety for resale or hold.`,
    }
  }
  if (roi >= 15) {
    return {
      label: 'Buy',
      color: 'text-green-400',
      reason: `${roi.toFixed(0)}% ROI comfortably covers fees and leaves upside${endingSoon ? '. Act quickly — ending soon' : ''}.`,
    }
  }
  if (roi >= 10) {
    return {
      label: 'Watch',
      color: 'text-amber-400',
      reason: `Decent discount but thin margin after fees (~${(roi - 15).toFixed(0)}% net after ~15% fees). Monitor for price drop or set a watchlist alert.`,
    }
  }
  return {
    label: 'Pass',
    color: 'text-slate-500',
    reason: `${roi.toFixed(0)}% ROI is unlikely to cover the ~15% combined platform + shipping fees. Not worth the risk.`,
  }
}
