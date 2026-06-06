export type PortfolioStatus = 'raw_owned' | 'submitted' | 'graded_owned' | 'sold'
export type PortfolioSource = 'manual' | 'alert' | 'analysis'

export interface PortfolioCard {
  id: string
  user_id: string | null
  card_key: string
  player: string
  set_name: string
  year: string | null
  grade: string | null
  status: PortfolioStatus
  source: PortfolioSource
  alert_id: string | null
  analysis_id: string | null
  raw_purchase_price: number
  raw_purchase_date: string
  submitted_at: string | null
  received_grade: number | null
  received_at: string | null
  current_value_override: number | null
  current_value_fetched: number | null
  current_value_fetched_at: string | null
  sold_price: number | null
  sold_at: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface PortfolioSummary {
  portfolioValue: number
  costBasis: number
  unrealizedPnl: number
  unrealizedPnlPct: number
  realizedPnl: number
  activeAlertCount: number
  positionCount: number
  statusBreakdown: { raw_owned: number; submitted: number; graded_owned: number }
}

export interface AddCardPayload {
  player: string
  set_name: string
  year: string | null
  grade: string | null
  raw_purchase_price: number
  raw_purchase_date: string
  notes: string | null
  source: PortfolioSource
  alert_id: string | null
  analysis_id: string | null
}
