// lib/grade/types.ts

export type GradeKey = 10 | 9 | 8 | 7
export type Reliability = 'high' | 'medium' | 'low'
export type Recommendation = 'grade' | 'uncertain' | 'skip'
export type AttributeName = 'corners' | 'edges' | 'surface'
export type Assessment = 'excellent' | 'good' | 'fair' | 'poor'
export type AnalysisStatus = 'pending' | 'analyzing' | 'complete' | 'error'

export interface CardIdentity {
  player: string
  year: number
  set: string
  cardNumber: string
  cardKey: string // e.g. "mahomes-2018-prizm-168"
}

// Probability distribution across grades (values sum to 1.0)
export interface GradeDistribution {
  10: number
  9: number
  8: number
  7: number
}

// Market comp prices per grade (may be missing grades with < 3 comps)
export type GradedComps = Partial<Record<GradeKey, number>>

export interface PhotoQualityResult {
  imageUrl: string
  resolution: Reliability
  blurSevere: boolean
  glare: boolean
  score: Reliability
}

export interface SessionReliability {
  score: Reliability
  photoScores: PhotoQualityResult[]
  bannerText: string | null
}

export interface CenteringResult {
  leftRight: number   // left side percentage, e.g. 53 means 53/47
  topBottom: number   // top side percentage, e.g. 55 means 55/45
  psa10Eligible: boolean
  confidence: 'high' | 'low'
  error?: string
}

// Multipliers adjust each grade's prior probability.
// [mult_10, mult_9, mult_8, mult_7] — 1.0 = no change
export interface AttributeResult {
  attribute: AttributeName
  assessment: Assessment
  confidence: Reliability
  multipliers: [number, number, number, number]
  notes: string
}

export interface EvResult {
  totalCost: number
  evGraded: number
  expectedProfit: number
  breakEvenGrade: GradeKey | null
  breakEvenProbability: number
  annualizedReturn: number | null // null if EP <= 0
  recommendation: Recommendation
}

export interface GradingTierResult {
  name: 'regular' | 'express' | 'superExpress'
  displayName: string
  fee: number
  shippingCost: number
  turnaroundDays: number
  ev: EvResult
}

export interface GradeAnalysisRow {
  id: string
  card_key: string
  mode: 'ebay' | 'personal'
  status: AnalysisStatus
  ebay_item_id?: string
  image_urls: string[]
  centering_lr?: number
  centering_tb?: number
  centering_eligible?: boolean
  corner_assessment?: string
  edge_assessment?: string
  surface_assessment?: string
  attribute_details: AttributeResult[]
  grade_distribution: GradeDistribution
  graded_comps: GradedComps
  raw_price?: number
  ev_regular?: number
  ep_regular?: number
  ev_express?: number
  ep_express?: number
  ev_super_express?: number
  ep_super_express?: number
  break_even_grade?: number
  break_even_prob?: number
  recommendation?: Recommendation
  reliability_score?: Reliability
  caveats: string[]
  error_message?: string
  created_at: string
}
