// lib/grade/types.ts

export type GradeKey = 10 | 9 | 8 | 7
export type Reliability = 'high' | 'medium' | 'low'
export type Recommendation = 'grade' | 'uncertain' | 'skip'
export type AttributeName = 'corners' | 'edges' | 'surface'
export type Assessment = 'excellent' | 'good' | 'fair' | 'poor'
export type AnalysisStatus = 'pending' | 'analyzing' | 'complete' | 'error'
export type CardType = 'foil_chrome' | 'dark_border' | 'matte' | 'vintage'
export type CornerPosition = 'top_left' | 'top_right' | 'bottom_left' | 'bottom_right'

// Structured image set for personal mode (10-photo protocol)
export interface CardImageManifest {
  front: string
  back: string
  cornerTopLeft: string
  cornerTopRight: string
  cornerBottomLeft: string
  cornerBottomRight: string
  rakingLight: string        // flashlight at 45° — catches foil scratches
  edgeTop: string
  edgeBottom: string
  edgeSides: string          // left + right in one photo
}

export interface CardIdentity {
  player: string
  year: number
  set: string
  cardNumber: string
  cardKey: string
  cardType: CardType         // NEW
  grade?: { grader: 'PSA' | 'BGS' | 'SGC'; score: number }
}

// Probability distribution across grades (values sum to 1.0)
export interface GradeDistribution {
  10: number
  9: number
  8: number
  7: number
}

// Continuous score output
export interface GradeScore {
  distribution: GradeDistribution
  continuousScore: number    // weighted avg, e.g. 9.3
  confidenceBand: number     // ±band, e.g. 0.4
}

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
  front: { leftRight: number; topBottom: number; psa10Eligible: boolean }
  back: { leftRight: number; topBottom: number; psa10Eligible: boolean }
  confidence: 'high' | 'low'
  error?: string
}

// Single corner assessment
export interface CornerResult {
  position: CornerPosition
  assessment: Assessment
  confidence: Reliability
  multiplier: number        // contribution to grade multiplier (applied to PSA 10 probability)
  notes: string
}

// Aggregated corner sub-grade (worst corner drives the grade)
export interface CornersResult {
  corners: CornerResult[]
  worstCorner: CornerPosition
  subGrade: number          // PSA sub-grade 1–10
  multipliers: [number, number, number, number]  // [mult_10, mult_9, mult_8, mult_7]
  notes: string
}

export interface EdgeResult {
  subGrade: number
  assessment: Assessment
  confidence: Reliability
  multipliers: [number, number, number, number]
  notes: string
}

export interface SurfaceResult {
  front: {
    subGrade: number
    assessment: Assessment
    confidence: Reliability
    defectsFound: string[]
    notes: string
  }
  back: {
    subGrade: number
    assessment: Assessment
    confidence: Reliability
    notes: string
  }
  multipliers: [number, number, number, number]  // combined front+back influence
}

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
  annualizedReturn: number | null
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
  card_type: CardType
  mode: 'ebay' | 'personal'
  status: AnalysisStatus
  ebay_item_id?: string
  image_urls: string[]                    // raw array for eBay mode
  image_manifest?: CardImageManifest      // structured manifest for personal mode

  // Centering (front + back separately)
  centering_front_lr?: number
  centering_front_tb?: number
  centering_front_eligible?: boolean
  centering_back_lr?: number
  centering_back_tb?: number
  centering_back_eligible?: boolean

  // Per-corner assessments
  corner_tl_assessment?: string
  corner_tr_assessment?: string
  corner_bl_assessment?: string
  corner_br_assessment?: string
  corner_worst?: string

  // Sub-grade scores (PSA scale 1–10)
  subgrade_centering?: number
  subgrade_corners?: number
  subgrade_edges?: number
  subgrade_surface?: number

  // Legacy flat assessments (kept for eBay mode fallback)
  corner_assessment?: string
  edge_assessment?: string
  surface_assessment?: string

  attribute_details: AttributeResult[]
  grade_distribution: GradeDistribution
  continuous_score?: number
  confidence_band?: number

  // PSA population at time of analysis
  pop_gem_rate?: number
  pop_count_10?: number
  pop_count_9?: number
  pop_count_8?: number
  pop_count_7?: number
  pop_total?: number

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

  // Post-submission outcome
  actual_psa_grade?: number
  outcome_logged_at?: string

  created_at: string
}
