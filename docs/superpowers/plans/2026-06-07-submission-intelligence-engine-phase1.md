# Submission Intelligence Engine — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the placeholder pre-grading pipeline with a high-accuracy, structured multi-photo analysis engine that outputs a complete submission decision (grade probability + sub-grades + market value + PSA population + EV recommendation).

**Architecture:** A 10-photo capture protocol feeds labeled images into a per-attribute analysis pipeline (4 separate corner calls, dedicated edge/surface/back calls, each run 3× and aggregated). PSA population data replaces the flat Bayesian prior. The pipeline outputs a continuous grade score, four sub-grade breakdowns, and a full submission verdict combining grade prediction with market comps and PSA pop data.

**Tech Stack:** Next.js App Router, TypeScript, Supabase, Claude Opus (Anthropic SDK), Inngest, Vitest, existing CV microservice.

---

## File Map

**New files:**
- `lib/psa/api-client.ts` — PSA public API OAuth2 client (population queries)
- `lib/grade/card-type.ts` — detect foil_chrome / dark_border / matte / vintage from card identity
- `lib/grade/multi-pass.ts` — run an async analysis function N times, aggregate results
- `lib/grade/corner-analysis.ts` — per-corner Claude analysis (replaces corners in attribute-analysis)
- `lib/grade/edge-analysis.ts` — edge Claude analysis (replaces edges in attribute-analysis)
- `lib/grade/surface-analysis.ts` — front raking-light + back surface Claude analysis
- `lib/grade/__tests__/card-type.test.ts`
- `lib/grade/__tests__/multi-pass.test.ts`
- `lib/grade/__tests__/grade-distribution.test.ts`
- `lib/psa/__tests__/api-client.test.ts`
- `components/grade/CaptureProtocol.tsx` — rebuilt 10-photo guided capture flow
- `components/grade/SubGradeBreakdown.tsx` — four sub-grade scores with PSA language
- `components/grade/SubmissionVerdict.tsx` — full decision output with math shown
- `supabase/migrations/20260607_grade_phase1.sql` — schema additions

**Modified files:**
- `lib/grade/types.ts` — add CardImageManifest, CardType, updated GradeAnalysisRow
- `lib/grade/centering.ts` — return front + back centering separately
- `lib/grade/grade-dist-cache.ts` — PSA API primary, eBay fallback
- `lib/grade/grade-distribution.ts` — add continuous score + confidence band output
- `lib/grade/pipeline.ts` — full rewrite orchestrating new modules
- `app/api/grade/analyze/route.ts` — accept CardImageManifest input
- `app/(app)/grade/page.tsx` — use CaptureProtocol, render new result components

**Deleted / superseded:**
- `lib/grade/attribute-analysis.ts` — replaced by corner-analysis, edge-analysis, surface-analysis (delete after pipeline rewrite)

---

## Task 1: Types

**Files:**
- Modify: `lib/grade/types.ts`

- [ ] **Step 1: Replace the types file content**

```typescript
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
```

- [ ] **Step 2: Commit**

```bash
git add lib/grade/types.ts
git commit -m "feat: expand grade types for Phase 1 (manifest, card type, sub-grades, continuous score)"
```

---

## Task 2: Database Migration

**Files:**
- Create: `supabase/migrations/20260607_grade_phase1.sql`

- [ ] **Step 1: Write migration**

```sql
-- supabase/migrations/20260607_grade_phase1.sql

-- New columns on grade_analyses
ALTER TABLE grade_analyses
  ADD COLUMN IF NOT EXISTS card_type text,
  ADD COLUMN IF NOT EXISTS image_manifest jsonb,
  ADD COLUMN IF NOT EXISTS centering_front_lr float,
  ADD COLUMN IF NOT EXISTS centering_front_tb float,
  ADD COLUMN IF NOT EXISTS centering_front_eligible boolean,
  ADD COLUMN IF NOT EXISTS centering_back_lr float,
  ADD COLUMN IF NOT EXISTS centering_back_tb float,
  ADD COLUMN IF NOT EXISTS centering_back_eligible boolean,
  ADD COLUMN IF NOT EXISTS corner_tl_assessment text,
  ADD COLUMN IF NOT EXISTS corner_tr_assessment text,
  ADD COLUMN IF NOT EXISTS corner_bl_assessment text,
  ADD COLUMN IF NOT EXISTS corner_br_assessment text,
  ADD COLUMN IF NOT EXISTS corner_worst text,
  ADD COLUMN IF NOT EXISTS subgrade_centering float,
  ADD COLUMN IF NOT EXISTS subgrade_corners float,
  ADD COLUMN IF NOT EXISTS subgrade_edges float,
  ADD COLUMN IF NOT EXISTS subgrade_surface float,
  ADD COLUMN IF NOT EXISTS continuous_score float,
  ADD COLUMN IF NOT EXISTS confidence_band float,
  ADD COLUMN IF NOT EXISTS pop_gem_rate float,
  ADD COLUMN IF NOT EXISTS pop_count_10 integer,
  ADD COLUMN IF NOT EXISTS pop_count_9 integer,
  ADD COLUMN IF NOT EXISTS pop_count_8 integer,
  ADD COLUMN IF NOT EXISTS pop_count_7 integer,
  ADD COLUMN IF NOT EXISTS pop_total integer,
  ADD COLUMN IF NOT EXISTS actual_psa_grade float,
  ADD COLUMN IF NOT EXISTS outcome_logged_at timestamptz;

-- Population snapshots table
CREATE TABLE IF NOT EXISTS pop_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  card_key text NOT NULL,
  snapshot_date date NOT NULL,
  count_10 integer NOT NULL DEFAULT 0,
  count_9 integer NOT NULL DEFAULT 0,
  count_8 integer NOT NULL DEFAULT 0,
  count_7 integer NOT NULL DEFAULT 0,
  total integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (card_key, snapshot_date)
);

CREATE INDEX IF NOT EXISTS pop_snapshots_card_key_idx ON pop_snapshots (card_key, snapshot_date DESC);
```

- [ ] **Step 2: Apply migration**

```bash
npx supabase db push
```

Expected: migration applied successfully with no errors.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260607_grade_phase1.sql
git commit -m "feat: add Phase 1 schema — per-corner, sub-grades, centering front/back, pop data, continuous score"
```

---

## Task 3: Card Type Detection

**Files:**
- Create: `lib/grade/card-type.ts`
- Create: `lib/grade/__tests__/card-type.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// lib/grade/__tests__/card-type.test.ts
import { describe, it, expect } from 'vitest'
import { detectCardType } from '../card-type'

describe('detectCardType', () => {
  it('identifies Prizm as foil_chrome', () => {
    expect(detectCardType('Patrick Mahomes', 2018, 'Prizm', '168')).toBe('foil_chrome')
  })

  it('identifies Chrome as foil_chrome', () => {
    expect(detectCardType('Luka Doncic', 2018, 'Topps Chrome', '168')).toBe('foil_chrome')
  })

  it('identifies Optic as foil_chrome', () => {
    expect(detectCardType('Joe Burrow', 2020, 'Optic', '151')).toBe('foil_chrome')
  })

  it('identifies Prizm Silver as dark_border', () => {
    expect(detectCardType('Patrick Mahomes', 2018, 'Prizm Silver', '168')).toBe('dark_border')
  })

  it('identifies Select as dark_border', () => {
    expect(detectCardType('Josh Allen', 2018, 'Select', '290')).toBe('dark_border')
  })

  it('identifies pre-1990 card as vintage', () => {
    expect(detectCardType('Nolan Ryan', 1972, 'Topps', '595')).toBe('vintage')
  })

  it('identifies base Topps as matte', () => {
    expect(detectCardType('Ronald Acuna', 2019, 'Topps', '1')).toBe('matte')
  })

  it('identifies Heritage as matte', () => {
    expect(detectCardType('Mike Trout', 2011, 'Heritage', '207')).toBe('matte')
  })
})
```

- [ ] **Step 2: Run to verify failure**

```bash
npx vitest run lib/grade/__tests__/card-type.test.ts
```

Expected: FAIL — "detectCardType is not a function"

- [ ] **Step 3: Implement**

```typescript
// lib/grade/card-type.ts
import type { CardType } from './types'

const FOIL_CHROME_SETS = new Set([
  'prizm', 'chrome', 'optic', 'refractor', 'select chrome',
  'topps chrome', 'bowman chrome', 'finest',
])

// Dark border sets — edge whitening is critical on these
const DARK_BORDER_SETS = new Set([
  'prizm silver', 'prizm black', 'select', 'mosaic black',
  'spectra', 'select silver', 'select gold',
])

export function detectCardType(
  _player: string,
  year: number,
  set: string,
  _cardNumber: string
): CardType {
  if (year < 1990) return 'vintage'

  const normalised = set.toLowerCase().trim()

  for (const darkSet of DARK_BORDER_SETS) {
    if (normalised.includes(darkSet)) return 'dark_border'
  }

  for (const foilSet of FOIL_CHROME_SETS) {
    if (normalised.includes(foilSet)) return 'foil_chrome'
  }

  return 'matte'
}
```

- [ ] **Step 4: Run to verify passing**

```bash
npx vitest run lib/grade/__tests__/card-type.test.ts
```

Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/grade/card-type.ts lib/grade/__tests__/card-type.test.ts
git commit -m "feat: card type detection (foil_chrome / dark_border / matte / vintage)"
```

---

## Task 4: Multi-Pass Aggregation

**Files:**
- Create: `lib/grade/multi-pass.ts`
- Create: `lib/grade/__tests__/multi-pass.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// lib/grade/__tests__/multi-pass.test.ts
import { describe, it, expect, vi } from 'vitest'
import { runMultiPass } from '../multi-pass'

describe('runMultiPass', () => {
  it('calls the function N times and returns all results', async () => {
    const fn = vi.fn().mockResolvedValue('result')
    const results = await runMultiPass(fn, 3)
    expect(fn).toHaveBeenCalledTimes(3)
    expect(results).toHaveLength(3)
  })

  it('aggregates numeric arrays by averaging', async () => {
    let call = 0
    const fn = vi.fn().mockImplementation(async () => {
      call++
      return { multipliers: [call, call, call, call] as [number, number, number, number] }
    })
    const results = await runMultiPass(fn, 3)
    const avg = averageMultipliers(results.map((r) => r.multipliers))
    // calls returned [1,1,1,1], [2,2,2,2], [3,3,3,3] — avg should be [2,2,2,2]
    expect(avg).toEqual([2, 2, 2, 2])
  })

  it('runs calls in parallel', async () => {
    const order: number[] = []
    const fn = vi.fn().mockImplementation(async (_i: number) => {
      order.push(_i)
      return _i
    })
    await runMultiPass((i) => fn(i), 3)
    // All three should have been dispatched (order may vary)
    expect(order).toHaveLength(3)
  })
})

function averageMultipliers(
  allMultipliers: [number, number, number, number][]
): [number, number, number, number] {
  const sum: [number, number, number, number] = [0, 0, 0, 0]
  for (const m of allMultipliers) {
    sum[0] += m[0]; sum[1] += m[1]; sum[2] += m[2]; sum[3] += m[3]
  }
  const n = allMultipliers.length
  return [sum[0] / n, sum[1] / n, sum[2] / n, sum[3] / n]
}
```

- [ ] **Step 2: Run to verify failure**

```bash
npx vitest run lib/grade/__tests__/multi-pass.test.ts
```

Expected: FAIL — "runMultiPass is not a function"

- [ ] **Step 3: Implement**

```typescript
// lib/grade/multi-pass.ts

// Run an async factory function N times in parallel and return all results.
// The factory receives the run index (0-based) in case it needs it.
export async function runMultiPass<T>(
  factory: (runIndex: number) => Promise<T>,
  runs: number
): Promise<T[]> {
  return Promise.all(Array.from({ length: runs }, (_, i) => factory(i)))
}

// Average four-element multiplier arrays across multiple runs.
export function averageMultipliers(
  allMultipliers: [number, number, number, number][]
): [number, number, number, number] {
  if (allMultipliers.length === 0) return [1, 1, 1, 1]
  const sum: [number, number, number, number] = [0, 0, 0, 0]
  for (const m of allMultipliers) {
    sum[0] += m[0]; sum[1] += m[1]; sum[2] += m[2]; sum[3] += m[3]
  }
  const n = allMultipliers.length
  return [sum[0] / n, sum[1] / n, sum[2] / n, sum[3] / n]
}

// Median of a numeric array.
export function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid]
}

// Convert array of string assessments to the most common one.
export function majorityAssessment(
  assessments: string[]
): string {
  const counts: Record<string, number> = {}
  for (const a of assessments) counts[a] = (counts[a] ?? 0) + 1
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'fair'
}

// If all runs agree, confidence is high. If they disagree, degrade.
export function aggregateConfidence(
  confidences: string[]
): 'high' | 'medium' | 'low' {
  const unique = new Set(confidences)
  if (unique.size === 1) return confidences[0] as 'high' | 'medium' | 'low'
  if (unique.has('low')) return 'low'
  return 'medium'
}
```

- [ ] **Step 4: Run to verify passing**

```bash
npx vitest run lib/grade/__tests__/multi-pass.test.ts
```

Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/grade/multi-pass.ts lib/grade/__tests__/multi-pass.test.ts
git commit -m "feat: multi-pass aggregation utility (runMultiPass, averageMultipliers, majorityAssessment)"
```

---

## Task 5: PSA API Client

**Files:**
- Create: `lib/psa/api-client.ts`
- Create: `lib/psa/__tests__/api-client.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// lib/psa/__tests__/api-client.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock fetch before importing the module
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

import { getPopData, type PopData } from '../api-client'

describe('getPopData', () => {
  beforeEach(() => {
    mockFetch.mockReset()
    // Token request
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: 'test-token', expires_in: 3600 }),
    })
  })

  it('returns parsed population data when API responds', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        PSASet: {
          PSACards: [
            {
              cardID: '123',
              pop10: 47,
              pop9: 210,
              pop8: 88,
              pop7: 31,
              totalGraded: 376,
            },
          ],
        },
      }),
    })

    const result = await getPopData('Patrick Mahomes', 2018, 'Prizm', '168')
    expect(result).not.toBeNull()
    expect(result!.count10).toBe(47)
    expect(result!.total).toBe(376)
    expect(result!.gemRate).toBeCloseTo(47 / 376, 5)
  })

  it('returns null when API call fails', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404 })
    const result = await getPopData('Unknown Player', 1900, 'Unknown Set', '1')
    expect(result).toBeNull()
  })

  it('returns null when PSA_API_USERNAME env var is missing', async () => {
    const original = process.env.PSA_API_USERNAME
    delete process.env.PSA_API_USERNAME
    const result = await getPopData('Patrick Mahomes', 2018, 'Prizm', '168')
    expect(result).toBeNull()
    process.env.PSA_API_USERNAME = original
  })
})
```

- [ ] **Step 2: Run to verify failure**

```bash
npx vitest run lib/psa/__tests__/api-client.test.ts
```

Expected: FAIL — "Cannot find module '../api-client'"

- [ ] **Step 3: Create directory and implement**

```bash
mkdir -p lib/psa
```

```typescript
// lib/psa/api-client.ts

export interface PopData {
  count10: number
  count9: number
  count8: number
  count7: number
  total: number
  gemRate: number
}

let cachedToken: { token: string; expiresAt: number } | null = null

async function getAccessToken(): Promise<string | null> {
  const username = process.env.PSA_API_USERNAME
  const password = process.env.PSA_API_PASSWORD
  if (!username || !password) return null

  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) {
    return cachedToken.token
  }

  try {
    const res = await fetch('https://api.psacard.com/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'password',
        username,
        password,
      }),
    })
    if (!res.ok) return null
    const data = (await res.json()) as { access_token: string; expires_in: number }
    cachedToken = {
      token: data.access_token,
      expiresAt: Date.now() + data.expires_in * 1000,
    }
    return cachedToken.token
  } catch {
    return null
  }
}

// Query PSA population data for a specific card.
// Returns null on any failure — callers must handle gracefully.
export async function getPopData(
  player: string,
  year: number,
  set: string,
  cardNumber: string
): Promise<PopData | null> {
  const token = await getAccessToken()
  if (!token) return null

  try {
    const query = encodeURIComponent(`${player} ${year} ${set} #${cardNumber}`)
    const res = await fetch(
      `https://api.psacard.com/publicapi/pop/GetPopReportBySeries?q=${query}&perPage=1`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    if (!res.ok) return null

    const data = (await res.json()) as {
      PSASet?: {
        PSACards?: Array<{
          pop10?: number
          pop9?: number
          pop8?: number
          pop7?: number
          totalGraded?: number
        }>
      }
    }

    const card = data?.PSASet?.PSACards?.[0]
    if (!card) return null

    const count10 = card.pop10 ?? 0
    const count9 = card.pop9 ?? 0
    const count8 = card.pop8 ?? 0
    const count7 = card.pop7 ?? 0
    const total = card.totalGraded ?? count10 + count9 + count8 + count7

    return {
      count10,
      count9,
      count8,
      count7,
      total,
      gemRate: total > 0 ? count10 / total : 0,
    }
  } catch {
    return null
  }
}
```

- [ ] **Step 4: Run to verify passing**

```bash
npx vitest run lib/psa/__tests__/api-client.test.ts
```

Expected: PASS (3 tests)

- [ ] **Step 5: Add env vars to `.env.local` (do not commit values)**

```bash
# Add to .env.local (already gitignored)
# PSA_API_USERNAME=your-psa-account-email
# PSA_API_PASSWORD=your-psa-account-password
```

- [ ] **Step 6: Commit**

```bash
git add lib/psa/api-client.ts lib/psa/__tests__/api-client.test.ts
git commit -m "feat: PSA public API client with OAuth2 token caching and population query"
```

---

## Task 6: Card Identification — Add Card Type

**Files:**
- Modify: `lib/grade/card-identify.ts`

- [ ] **Step 1: Import `detectCardType` and attach it to the returned identity**

In `identifyCardFromTitle`, after building the identity object, add:

```typescript
// lib/grade/card-identify.ts — add import at top
import { detectCardType } from './card-type'
```

In `identifyCardFromTitle`, change the identity construction from:

```typescript
  const identity: CardIdentity = { player, year, set, cardNumber, cardKey }
```

to:

```typescript
  const cardType = detectCardType(player, year, set, cardNumber)
  const identity: CardIdentity = { player, year, set, cardNumber, cardKey, cardType }
```

In `identifyCardFromImage`, change:

```typescript
    return {
      player: parsed.player,
      year: parsed.year,
      set: parsed.set,
      cardNumber: parsed.cardNumber,
      cardKey,
    }
```

to:

```typescript
    const cardType = detectCardType(parsed.player, parsed.year, parsed.set, parsed.cardNumber)
    return {
      player: parsed.player,
      year: parsed.year,
      set: parsed.set,
      cardNumber: parsed.cardNumber,
      cardKey,
      cardType,
    }
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors related to CardIdentity.

- [ ] **Step 3: Commit**

```bash
git add lib/grade/card-identify.ts
git commit -m "feat: attach card type to CardIdentity at identification time"
```

---

## Task 7: Enhanced Centering — Front + Back

**Files:**
- Modify: `lib/grade/centering.ts`

- [ ] **Step 1: Rewrite centering.ts to return front + back**

```typescript
// lib/grade/centering.ts
import type { CenteringResult } from './types'
import { fetchImageBuffer } from './image-source'

const CV_SERVICE_URL = process.env.CV_SERVICE_URL ?? 'http://localhost:8001'

// PSA centering thresholds
// Front: 55/45 for PSA 10, 60/40 for PSA 9
// Back:  75/25 for PSA 10 (much more lenient)
function frontEligible(lr: number, tb: number): boolean {
  return lr <= 55 && lr >= 45 && tb <= 55 && tb >= 45
}
function backEligible(lr: number, tb: number): boolean {
  return lr <= 75 && lr >= 25 && tb <= 75 && tb >= 25
}

async function measureOne(
  imageUrl: string,
  face: 'front' | 'back'
): Promise<{ leftRight: number; topBottom: number; confidence: 'high' | 'low'; error?: string }> {
  let imageBuffer: ArrayBuffer
  try {
    imageBuffer = await fetchImageBuffer(imageUrl)
  } catch {
    return { leftRight: 50, topBottom: 50, confidence: 'low', error: 'image_fetch_failed' }
  }

  const form = new FormData()
  form.append('file', new Blob([imageBuffer], { type: 'image/jpeg' }), `${face}.jpg`)
  form.append('face', face)

  try {
    const cvRes = await fetch(`${CV_SERVICE_URL}/centering`, {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(10_000),
    })

    if (!cvRes.ok) {
      return { leftRight: 50, topBottom: 50, confidence: 'low', error: 'cv_service_error' }
    }

    const data = (await cvRes.json()) as {
      left_right?: number
      top_bottom?: number
      confidence?: 'high' | 'low'
      error?: string
    }

    if (data.error) {
      return { leftRight: 50, topBottom: 50, confidence: 'low', error: data.error }
    }

    return {
      leftRight: data.left_right ?? 50,
      topBottom: data.top_bottom ?? 50,
      confidence: data.confidence ?? 'low',
    }
  } catch (err) {
    return {
      leftRight: 50,
      topBottom: 50,
      confidence: 'low',
      error: err instanceof Error ? err.message : 'unknown',
    }
  }
}

export async function measureCentering(
  frontImageUrl: string,
  backImageUrl: string
): Promise<CenteringResult> {
  const [frontRaw, backRaw] = await Promise.all([
    measureOne(frontImageUrl, 'front'),
    measureOne(backImageUrl, 'back'),
  ])

  return {
    front: {
      leftRight: frontRaw.leftRight,
      topBottom: frontRaw.topBottom,
      psa10Eligible: frontEligible(frontRaw.leftRight, frontRaw.topBottom),
    },
    back: {
      leftRight: backRaw.leftRight,
      topBottom: backRaw.topBottom,
      psa10Eligible: backEligible(backRaw.leftRight, backRaw.topBottom),
    },
    confidence: frontRaw.confidence === 'high' && backRaw.confidence === 'high' ? 'high' : 'low',
    error: frontRaw.error ?? backRaw.error,
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/grade/centering.ts
git commit -m "feat: measure front + back centering separately with correct PSA thresholds per face"
```

---

## Task 8: Per-Corner Analysis

**Files:**
- Create: `lib/grade/corner-analysis.ts`

- [ ] **Step 1: Create the module**

```typescript
// lib/grade/corner-analysis.ts
import Anthropic from '@anthropic-ai/sdk'
import type { CornerPosition, CornerResult, CornersResult, CardType } from './types'
import { toAnthropicImageSource } from './image-source'
import { runMultiPass, averageMultipliers, majorityAssessment, aggregateConfidence } from './multi-pass'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const CORNER_LABEL: Record<CornerPosition, string> = {
  top_left: 'Top-Left',
  top_right: 'Top-Right',
  bottom_left: 'Bottom-Left',
  bottom_right: 'Bottom-Right',
}

function buildCornerPrompt(position: CornerPosition, cardType: CardType): string {
  const label = CORNER_LABEL[position]
  const typeNote =
    cardType === 'dark_border'
      ? 'This is a dark-bordered card. Corner fraying shows as white fibres on the dark edge — look carefully for any white at the corner tip.'
      : cardType === 'foil_chrome'
      ? 'This is a foil/chrome card. Corner wear may appear as dull or silver-exposed areas at the tip.'
      : ''

  return `You are an expert PSA grader evaluating the ${label} corner of a raw sports card.

${typeNote}

You will see corner crop images in this order:
- First images: CONFIRMED PSA 10 (Gem Mint) corner crops of this same card
- Next images: CONFIRMED PSA 9 (Mint) corner crops  
- Next images: CONFIRMED PSA 8 (NM-MT) corner crops
- Final image: The RAW CARD'S ${label} corner being evaluated

PSA CORNER STANDARDS:
- Excellent (→PSA 10): Perfectly sharp tip, zero fraying under any lighting
- Good (→PSA 9): Microscopic softness or single fibre, does not impair appeal
- Fair (→PSA 8): Slight fraying visible without magnification, corner not sharp
- Poor (→PSA 7 or below): Noticeable rounding, multiple fibres, heavy fraying

Return ONLY valid JSON:
{
  "assessment": "excellent|good|fair|poor",
  "confidence": "high|medium|low",
  "multiplier_10": 1.0,
  "multiplier_9": 1.0,
  "multiplier_8": 1.0,
  "multiplier_7": 1.0,
  "notes": "one sentence describing what you see"
}`
}

async function analyseOneCorner(
  position: CornerPosition,
  cornerCropUrl: string,
  referenceImages: Array<{ imageUrl: string; psa_grade: number }>,
  cardType: CardType
): Promise<CornerResult> {
  const refs10 = referenceImages.filter((r) => r.psa_grade === 10).slice(0, 3)
  const refs9 = referenceImages.filter((r) => r.psa_grade === 9).slice(0, 3)
  const refs8 = referenceImages.filter((r) => r.psa_grade === 8).slice(0, 2)

  const allUrls = [
    ...refs10.map((r) => r.imageUrl),
    ...refs9.map((r) => r.imageUrl),
    ...refs8.map((r) => r.imageUrl),
    cornerCropUrl,
  ]

  const imageBlocks = allUrls.map((url) => ({
    type: 'image' as const,
    source: toAnthropicImageSource(url),
  }))

  const response = await client.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 256,
    messages: [
      {
        role: 'user',
        content: [
          ...imageBlocks,
          { type: 'text', text: buildCornerPrompt(position, cardType) },
        ],
      },
    ],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : '{}'
  const jsonMatch = text.match(/\{[\s\S]*\}/)

  try {
    const parsed = JSON.parse(jsonMatch?.[0] ?? '{}') as {
      assessment?: string
      confidence?: string
      multiplier_10?: number
      multiplier_9?: number
      multiplier_8?: number
      multiplier_7?: number
      notes?: string
    }
    return {
      position,
      assessment: (parsed.assessment ?? 'fair') as CornerResult['assessment'],
      confidence: (parsed.confidence ?? 'low') as CornerResult['confidence'],
      multiplier: parsed.multiplier_10 ?? 1,
      notes: parsed.notes ?? '',
    }
  } catch {
    return {
      position,
      assessment: 'fair',
      confidence: 'low',
      multiplier: 1,
      notes: 'Analysis unavailable.',
    }
  }
}

const ASSESSMENT_ORDER = ['excellent', 'good', 'fair', 'poor']
const ASSESSMENT_SUBGRADE: Record<string, number> = {
  excellent: 10,
  good: 9,
  fair: 8,
  poor: 6,
}
const ASSESSMENT_MULTIPLIERS: Record<string, [number, number, number, number]> = {
  excellent: [1.2, 1.0, 0.8, 0.5],
  good:      [0.7, 1.3, 1.0, 0.6],
  fair:      [0.2, 0.8, 1.3, 1.1],
  poor:      [0.05, 0.4, 1.0, 1.5],
}

export async function analyzeCorners(
  manifest: { cornerTopLeft: string; cornerTopRight: string; cornerBottomLeft: string; cornerBottomRight: string },
  referenceImages: Array<{ imageUrl: string; psa_grade: number }>,
  cardType: CardType,
  runs = 3
): Promise<CornersResult> {
  const positions: Array<{ pos: CornerPosition; url: string }> = [
    { pos: 'top_left',     url: manifest.cornerTopLeft },
    { pos: 'top_right',    url: manifest.cornerTopRight },
    { pos: 'bottom_left',  url: manifest.cornerBottomLeft },
    { pos: 'bottom_right', url: manifest.cornerBottomRight },
  ]

  // Run each corner through multi-pass in parallel
  const cornerResults = await Promise.all(
    positions.map(async ({ pos, url }) => {
      const passResults = await runMultiPass(
        () => analyseOneCorner(pos, url, referenceImages, cardType),
        runs
      )
      return {
        position: pos,
        assessment: majorityAssessment(passResults.map((r) => r.assessment)) as CornerResult['assessment'],
        confidence: aggregateConfidence(passResults.map((r) => r.confidence)),
        multiplier: passResults.reduce((sum, r) => sum + r.multiplier, 0) / runs,
        notes: passResults[0].notes,
      } as CornerResult
    })
  )

  // PSA grades to the worst corner
  const worstCorner = cornerResults.reduce((worst, c) => {
    const wIdx = ASSESSMENT_ORDER.indexOf(worst.assessment)
    const cIdx = ASSESSMENT_ORDER.indexOf(c.assessment)
    return cIdx > wIdx ? c : worst
  })

  const worstAssessment = worstCorner.assessment
  const multipliers = ASSESSMENT_MULTIPLIERS[worstAssessment] ?? [1, 1, 1, 1]

  return {
    corners: cornerResults,
    worstCorner: worstCorner.position,
    subGrade: ASSESSMENT_SUBGRADE[worstAssessment] ?? 8,
    multipliers: multipliers as [number, number, number, number],
    notes: `Worst corner: ${CORNER_LABEL[worstCorner.position]} (${worstAssessment}). ${worstCorner.notes}`,
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no type errors.

- [ ] **Step 3: Commit**

```bash
git add lib/grade/corner-analysis.ts
git commit -m "feat: per-corner PSA analysis with multi-pass aggregation and worst-corner grading"
```

---

## Task 9: Edge Analysis

**Files:**
- Create: `lib/grade/edge-analysis.ts`

- [ ] **Step 1: Create the module**

```typescript
// lib/grade/edge-analysis.ts
import Anthropic from '@anthropic-ai/sdk'
import type { EdgeResult, CardType } from './types'
import { toAnthropicImageSource } from './image-source'
import { runMultiPass, averageMultipliers, majorityAssessment, aggregateConfidence } from './multi-pass'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

function buildEdgePrompt(cardType: CardType): string {
  const typeNote =
    cardType === 'dark_border'
      ? 'CRITICAL: This is a dark-bordered card. Edge whitening — white specks or streaks along dark edges — is the #1 PSA 10 killer on dark-bordered cards. Examine every edge extremely carefully under the angled lighting for any white.'
      : cardType === 'foil_chrome'
      ? 'This is a foil/chrome card. Look for edge chipping where the foil layer has separated, and for roughness along the cut edges.'
      : ''

  return `You are an expert PSA grader evaluating the edges of a raw sports card.

${typeNote}

Image order:
- First images: CONFIRMED PSA 10 edge crops of this same card
- Next images: CONFIRMED PSA 9 edge crops
- Next images: CONFIRMED PSA 8 edge crops
- Remaining images: The RAW CARD's edge crops (top, bottom, sides)

PSA EDGE STANDARDS:
- Excellent (→PSA 10): All edges perfectly clean — no chipping, whitening, roughness, or wear
- Good (→PSA 9): Slight handling on one edge; no chipping; minor white specks tolerable if non-distracting
- Fair (→PSA 8): Slight roughness or whitening on 1–2 edges; no heavy chipping
- Poor (→PSA 7 or below): Clear chipping, heavy whitening, or rough edges on multiple sides

Return ONLY valid JSON:
{
  "assessment": "excellent|good|fair|poor",
  "confidence": "high|medium|low",
  "multipliers": [1.0, 1.0, 1.0, 1.0],
  "notes": "one sentence — which edges have issues and what kind"
}`
}

const ASSESSMENT_SUBGRADE: Record<string, number> = {
  excellent: 10, good: 9, fair: 8, poor: 6,
}
const ASSESSMENT_MULTIPLIERS: Record<string, [number, number, number, number]> = {
  excellent: [1.1, 1.0, 0.9, 0.7],
  good:      [0.8, 1.2, 1.0, 0.7],
  fair:      [0.3, 0.9, 1.2, 1.0],
  poor:      [0.05, 0.5, 1.0, 1.4],
}

async function analyseEdgesOnce(
  edgeCropUrls: string[],
  referenceImages: Array<{ imageUrl: string; psa_grade: number }>,
  cardType: CardType
): Promise<{ assessment: string; confidence: string; multipliers: [number, number, number, number]; notes: string }> {
  const refs10 = referenceImages.filter((r) => r.psa_grade === 10).slice(0, 2)
  const refs9  = referenceImages.filter((r) => r.psa_grade === 9).slice(0, 2)
  const refs8  = referenceImages.filter((r) => r.psa_grade === 8).slice(0, 1)

  const allUrls = [
    ...refs10.map((r) => r.imageUrl),
    ...refs9.map((r) => r.imageUrl),
    ...refs8.map((r) => r.imageUrl),
    ...edgeCropUrls,
  ]

  const imageBlocks = allUrls.map((url) => ({
    type: 'image' as const,
    source: toAnthropicImageSource(url),
  }))

  const response = await client.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 256,
    messages: [
      {
        role: 'user',
        content: [
          ...imageBlocks,
          { type: 'text', text: buildEdgePrompt(cardType) },
        ],
      },
    ],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : '{}'
  const jsonMatch = text.match(/\{[\s\S]*\}/)

  try {
    const parsed = JSON.parse(jsonMatch?.[0] ?? '{}') as {
      assessment?: string
      confidence?: string
      multipliers?: [number, number, number, number]
      notes?: string
    }
    return {
      assessment: parsed.assessment ?? 'fair',
      confidence: parsed.confidence ?? 'low',
      multipliers: parsed.multipliers ?? [1, 1, 1, 1],
      notes: parsed.notes ?? '',
    }
  } catch {
    return { assessment: 'fair', confidence: 'low', multipliers: [1, 1, 1, 1], notes: 'Analysis unavailable.' }
  }
}

export async function analyzeEdges(
  manifest: { edgeTop: string; edgeBottom: string; edgeSides: string },
  referenceImages: Array<{ imageUrl: string; psa_grade: number }>,
  cardType: CardType,
  runs = 3
): Promise<EdgeResult> {
  const edgeCropUrls = [manifest.edgeTop, manifest.edgeBottom, manifest.edgeSides]
  const passResults = await runMultiPass(
    () => analyseEdgesOnce(edgeCropUrls, referenceImages, cardType),
    runs
  )

  const assessment = majorityAssessment(passResults.map((r) => r.assessment))
  const confidence = aggregateConfidence(passResults.map((r) => r.confidence))
  const multipliers = averageMultipliers(passResults.map((r) => r.multipliers))

  return {
    subGrade: ASSESSMENT_SUBGRADE[assessment] ?? 8,
    assessment: assessment as EdgeResult['assessment'],
    confidence: confidence as EdgeResult['confidence'],
    multipliers,
    notes: passResults[0].notes,
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add lib/grade/edge-analysis.ts
git commit -m "feat: edge analysis with dark-border whitening detection and multi-pass aggregation"
```

---

## Task 10: Surface Analysis

**Files:**
- Create: `lib/grade/surface-analysis.ts`

- [ ] **Step 1: Create the module**

```typescript
// lib/grade/surface-analysis.ts
import Anthropic from '@anthropic-ai/sdk'
import type { SurfaceResult, CardType } from './types'
import { toAnthropicImageSource } from './image-source'
import { runMultiPass, averageMultipliers, majorityAssessment, aggregateConfidence } from './multi-pass'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

function buildFrontSurfacePrompt(cardType: CardType): string {
  const prizmNote = cardType === 'foil_chrome'
    ? `CRITICAL DEFECT TO CHECK: The "Prizm Dimple" — a small factory indentation at or near the card center — is the most common cause of PSA 9 on otherwise gem-mint Prizm/Chrome cards. Look specifically for a tiny circular or oval indentation in the card surface. If found, note its location and size.

Also examine for foil scratches — bright linear marks or dull patches in the foil visible at this raking angle. These are the hardest defects to detect and only visible with raking light.`
    : ''

  return `You are an expert PSA grader evaluating the FRONT SURFACE of a raw sports card. This is a RAKING LIGHT photo (flashlight held at 45°) — the optimal angle to detect scratches and surface defects.

${prizmNote}

Image order:
- First images: CONFIRMED PSA 10 front surface reference photos of this card
- Next images: CONFIRMED PSA 9 front surface reference photos
- Final image: The RAW CARD's front surface under raking light

PSA SURFACE STANDARDS (front):
- Excellent (→PSA 10): Sharp focus, full original gloss. No scratches, stains, print lines, or surface defects of any kind.
- Good (→PSA 9): One slight printing defect OR very minor scratch that does not impair overall appeal. No staining.
- Fair (→PSA 8): Minor printing imperfections visible. Slight surface wear. No significant staining.
- Poor (→PSA 7 or below): Clear scratches, print lines, staining, or heavy surface wear visible.

Return ONLY valid JSON:
{
  "assessment": "excellent|good|fair|poor",
  "confidence": "high|medium|low",
  "multipliers": [1.0, 1.0, 1.0, 1.0],
  "defects_found": ["list any specific defects, e.g. 'possible Prizm Dimple at center', 'foil scratch upper-right'"],
  "notes": "one sentence describing surface condition"
}`
}

function buildBackSurfacePrompt(): string {
  return `You are an expert PSA grader evaluating the BACK SURFACE of a raw sports card.

Image order:
- First images: CONFIRMED PSA 10 back surface references
- Next images: CONFIRMED PSA 9 back surface references  
- Final image: The RAW CARD's back surface

PSA BACK SURFACE STANDARDS:
- Excellent (→PSA 10): Clean, no staining, no wax stains, original gloss intact
- Good (→PSA 9): Very slight imperfection that does not impair overall appeal
- Fair (→PSA 8): Very slight wax stain permissible. Minor print defect acceptable.
- Poor (→PSA 7 or below): Visible staining, heavy print defects, significant wear

Return ONLY valid JSON:
{
  "assessment": "excellent|good|fair|poor",
  "confidence": "high|medium|low",
  "multipliers": [1.0, 1.0, 1.0, 1.0],
  "notes": "one sentence describing back surface condition"
}`
}

async function analyseOnce(
  imageUrl: string,
  referenceImages: Array<{ imageUrl: string; psa_grade: number }>,
  prompt: string
) {
  const refs10 = referenceImages.filter((r) => r.psa_grade === 10).slice(0, 3)
  const refs9  = referenceImages.filter((r) => r.psa_grade === 9).slice(0, 2)
  const allUrls = [...refs10.map((r) => r.imageUrl), ...refs9.map((r) => r.imageUrl), imageUrl]

  const imageBlocks = allUrls.map((url) => ({
    type: 'image' as const,
    source: toAnthropicImageSource(url),
  }))

  const response = await client.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 512,
    messages: [{ role: 'user', content: [...imageBlocks, { type: 'text', text: prompt }] }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : '{}'
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  try {
    return JSON.parse(jsonMatch?.[0] ?? '{}') as {
      assessment?: string
      confidence?: string
      multipliers?: [number, number, number, number]
      defects_found?: string[]
      notes?: string
    }
  } catch {
    return {}
  }
}

const ASSESSMENT_SUBGRADE: Record<string, number> = {
  excellent: 10, good: 9, fair: 8, poor: 6,
}
const FRONT_MULTIPLIERS: Record<string, [number, number, number, number]> = {
  excellent: [1.2, 1.0, 0.8, 0.5],
  good:      [0.6, 1.3, 1.0, 0.6],
  fair:      [0.2, 0.8, 1.3, 1.0],
  poor:      [0.05, 0.3, 1.0, 1.5],
}
const BACK_MULTIPLIERS: Record<string, [number, number, number, number]> = {
  excellent: [1.1, 1.0, 0.9, 0.8],
  good:      [0.8, 1.1, 1.0, 0.8],
  fair:      [0.5, 0.9, 1.1, 1.0],
  poor:      [0.1, 0.5, 1.0, 1.3],
}

export async function analyzeSurface(
  manifest: { rakingLight: string; back: string },
  referenceImages: Array<{ imageUrl: string; psa_grade: number }>,
  cardType: CardType,
  runs = 3
): Promise<SurfaceResult> {
  const frontPrompt = buildFrontSurfacePrompt(cardType)
  const backPrompt = buildBackSurfacePrompt()

  const [frontRuns, backRuns] = await Promise.all([
    runMultiPass(() => analyseOnce(manifest.rakingLight, referenceImages, frontPrompt), runs),
    runMultiPass(() => analyseOnce(manifest.back, referenceImages, backPrompt), runs),
  ])

  const frontAssessment = majorityAssessment(frontRuns.map((r) => r.assessment ?? 'fair'))
  const backAssessment  = majorityAssessment(backRuns.map((r) => r.assessment ?? 'fair'))

  // Combined multipliers: front is weighted 2×, back 1×
  const frontMults = FRONT_MULTIPLIERS[frontAssessment] ?? [1, 1, 1, 1]
  const backMults  = BACK_MULTIPLIERS[backAssessment] ?? [1, 1, 1, 1]
  const combined: [number, number, number, number] = [
    (frontMults[0] * 2 + backMults[0]) / 3,
    (frontMults[1] * 2 + backMults[1]) / 3,
    (frontMults[2] * 2 + backMults[2]) / 3,
    (frontMults[3] * 2 + backMults[3]) / 3,
  ]

  return {
    front: {
      subGrade: ASSESSMENT_SUBGRADE[frontAssessment] ?? 8,
      assessment: frontAssessment as SurfaceResult['front']['assessment'],
      confidence: aggregateConfidence(frontRuns.map((r) => r.confidence ?? 'low')) as 'high' | 'medium' | 'low',
      defectsFound: frontRuns[0].defects_found ?? [],
      notes: frontRuns[0].notes ?? '',
    },
    back: {
      subGrade: ASSESSMENT_SUBGRADE[backAssessment] ?? 8,
      assessment: backAssessment as SurfaceResult['back']['assessment'],
      confidence: aggregateConfidence(backRuns.map((r) => r.confidence ?? 'low')) as 'high' | 'medium' | 'low',
      notes: backRuns[0].notes ?? '',
    },
    multipliers: combined,
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add lib/grade/surface-analysis.ts
git commit -m "feat: surface analysis — raking-light front + back, card-type-aware Prizm Dimple detection"
```

---

## Task 11: PSA Pop-Seeded Grade Priors

**Files:**
- Modify: `lib/grade/grade-dist-cache.ts`

- [ ] **Step 1: Update to use PSA API as primary source**

Replace the entire file:

```typescript
// lib/grade/grade-dist-cache.ts
import { searchListings } from '@/lib/ebay/rapidapi'
import { getPopData } from '@/lib/psa/api-client'
import { createServerClient } from '@/lib/supabase/server'
import type { GradeDistribution, GradeKey } from './types'

const FLAT_PRIOR: GradeDistribution = { 10: 0.08, 9: 0.50, 8: 0.30, 7: 0.12 }
const CACHE_TTL_MS = 24 * 60 * 60 * 1000

export function parseGradeFromTitle(title: string): GradeKey | null {
  const lower = title.toLowerCase()
  if (/psa\s*10/.test(lower)) return 10
  if (/psa\s*9(?![\d.])/.test(lower)) return 9
  if (/psa\s*8(?![\d.])/.test(lower)) return 8
  if (/psa\s*[1-7](?![\d.])/.test(lower)) return 7
  return null
}

// Try PSA API first; fall back to eBay listing grade counts; fall back to flat prior.
export async function getGradeDistribution(
  cardKey: string,
  player: string,
  year: number,
  set: string,
  cardNumber: string
): Promise<{ distribution: GradeDistribution; popData: { count10: number; count9: number; count8: number; count7: number; total: number; gemRate: number } | null }> {
  const supabase = createServerClient()

  // Check cache
  const { data: cached } = await supabase
    .from('grade_dist_cache')
    .select('*')
    .eq('card_key', cardKey)
    .single()

  if (cached && Date.now() - new Date(cached.last_fetched).getTime() < CACHE_TTL_MS) {
    return {
      distribution: normalizeGrades(
        cached.grades as Partial<Record<GradeKey, number>>,
        cached.total
      ),
      popData: null,
    }
  }

  // Primary: PSA API
  const popData = await getPopData(player, year, set, cardNumber)
  if (popData && popData.total >= 10) {
    const distribution: GradeDistribution = {
      10: popData.count10 / popData.total,
      9:  popData.count9  / popData.total,
      8:  popData.count8  / popData.total,
      7:  popData.count7  / popData.total,
    }

    await supabase.from('grade_dist_cache').upsert({
      card_key: cardKey,
      grades: { 10: popData.count10, 9: popData.count9, 8: popData.count8, 7: popData.count7 },
      total: popData.total,
      last_fetched: new Date().toISOString(),
    })

    return { distribution, popData }
  }

  // Fallback: eBay listing grades
  try {
    const listings = await searchListings(`${player} ${year} ${set} PSA`)
    const grades: Partial<Record<GradeKey, number>> = {}
    let total = 0
    for (const listing of listings) {
      const grade = parseGradeFromTitle(listing.title)
      if (grade !== null) {
        grades[grade] = (grades[grade] ?? 0) + 1
        total++
      }
    }

    if (total >= 5) {
      await supabase.from('grade_dist_cache').upsert({
        card_key: cardKey,
        grades,
        total,
        last_fetched: new Date().toISOString(),
      })
      return { distribution: normalizeGrades(grades, total), popData: null }
    }
  } catch {
    // fall through
  }

  return { distribution: FLAT_PRIOR, popData: null }
}

function normalizeGrades(
  grades: Partial<Record<GradeKey, number>>,
  total: number
): GradeDistribution {
  if (total === 0) return FLAT_PRIOR
  return {
    10: (grades[10] ?? 0) / total,
    9:  (grades[9]  ?? 0) / total,
    8:  (grades[8]  ?? 0) / total,
    7:  (grades[7]  ?? 0) / total,
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add lib/grade/grade-dist-cache.ts
git commit -m "feat: PSA API as primary grade distribution source with eBay fallback"
```

---

## Task 12: Continuous Grade Score

**Files:**
- Modify: `lib/grade/grade-distribution.ts`
- Create: `lib/grade/__tests__/grade-distribution.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// lib/grade/__tests__/grade-distribution.test.ts
import { describe, it, expect } from 'vitest'
import { computeGradeScore, applyBayesianUpdate } from '../grade-distribution'

describe('computeGradeScore', () => {
  it('returns 10 for certain PSA 10 distribution', () => {
    const dist = { 10: 1, 9: 0, 8: 0, 7: 0 }
    const score = computeGradeScore(dist)
    expect(score.continuousScore).toBe(10)
    expect(score.confidenceBand).toBeCloseTo(0, 1)
  })

  it('returns 9 for certain PSA 9 distribution', () => {
    const dist = { 10: 0, 9: 1, 8: 0, 7: 0 }
    const score = computeGradeScore(dist)
    expect(score.continuousScore).toBe(9)
  })

  it('returns weighted average for mixed distribution', () => {
    // 50% PSA 10 + 50% PSA 9 = 9.5
    const dist = { 10: 0.5, 9: 0.5, 8: 0, 7: 0 }
    const score = computeGradeScore(dist)
    expect(score.continuousScore).toBeCloseTo(9.5, 5)
  })

  it('confidence band is wider for uncertain distributions', () => {
    const certain = computeGradeScore({ 10: 1, 9: 0, 8: 0, 7: 0 })
    const uncertain = computeGradeScore({ 10: 0.25, 9: 0.25, 8: 0.25, 7: 0.25 })
    expect(uncertain.confidenceBand).toBeGreaterThan(certain.confidenceBand)
  })
})

describe('applyBayesianUpdate', () => {
  it('boosts PSA 10 probability when all attributes are excellent', () => {
    const prior = { 10: 0.08, 9: 0.50, 8: 0.30, 7: 0.12 }
    const excellentMults: [number, number, number, number] = [1.5, 1.0, 0.7, 0.4]
    const result = applyBayesianUpdate(prior, [excellentMults, excellentMults, excellentMults], true)
    expect(result[10]).toBeGreaterThan(prior[10])
  })

  it('crushes PSA 10 probability when centering is not eligible', () => {
    const prior = { 10: 0.35, 9: 0.50, 8: 0.12, 7: 0.03 }
    const result = applyBayesianUpdate(prior, [], false)
    expect(result[10]).toBeLessThan(0.05)
  })
})
```

- [ ] **Step 2: Run to verify failure**

```bash
npx vitest run lib/grade/__tests__/grade-distribution.test.ts
```

Expected: FAIL — computeGradeScore not exported.

- [ ] **Step 3: Update grade-distribution.ts**

```typescript
// lib/grade/grade-distribution.ts
import type { GradeDistribution, GradeScore } from './types'

const FLAT_PRIOR: GradeDistribution = { 10: 0.08, 9: 0.50, 8: 0.30, 7: 0.12 }

export function computeGradeScore(distribution: GradeDistribution): GradeScore {
  const continuousScore =
    10 * distribution[10] +
    9  * distribution[9]  +
    8  * distribution[8]  +
    7  * distribution[7]

  // Standard deviation of the distribution
  const variance =
    distribution[10] * Math.pow(10 - continuousScore, 2) +
    distribution[9]  * Math.pow(9  - continuousScore, 2) +
    distribution[8]  * Math.pow(8  - continuousScore, 2) +
    distribution[7]  * Math.pow(7  - continuousScore, 2)

  const confidenceBand = Math.round(Math.sqrt(variance) * 100) / 100

  return { distribution, continuousScore: Math.round(continuousScore * 100) / 100, confidenceBand }
}

// multiplierSets: array of [mult_10, mult_9, mult_8, mult_7] from each attribute
export function applyBayesianUpdate(
  prior: GradeDistribution,
  multiplierSets: [number, number, number, number][],
  centeringFrontEligible: boolean
): GradeDistribution {
  const centeringMults: [number, number, number, number] = centeringFrontEligible
    ? [1.2, 1.0, 0.9, 0.7]
    : [0.1, 0.8, 1.2, 1.3]

  const combined: [number, number, number, number] = [1, 1, 1, 1]
  for (const mults of [centeringMults, ...multiplierSets]) {
    combined[0] *= mults[0]
    combined[1] *= mults[1]
    combined[2] *= mults[2]
    combined[3] *= mults[3]
  }

  const unnormalized = {
    10: prior[10] * combined[0],
    9:  prior[9]  * combined[1],
    8:  prior[8]  * combined[2],
    7:  prior[7]  * combined[3],
  }

  return normalize(unnormalized)
}

function normalize(dist: GradeDistribution): GradeDistribution {
  const total = dist[10] + dist[9] + dist[8] + dist[7]
  if (total === 0) return FLAT_PRIOR
  return {
    10: dist[10] / total,
    9:  dist[9]  / total,
    8:  dist[8]  / total,
    7:  dist[7]  / total,
  }
}

export { FLAT_PRIOR }
```

- [ ] **Step 4: Run to verify passing**

```bash
npx vitest run lib/grade/__tests__/grade-distribution.test.ts
```

Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/grade/grade-distribution.ts lib/grade/__tests__/grade-distribution.test.ts
git commit -m "feat: continuous grade score (weighted avg + std dev confidence band)"
```

---

## Task 13: Pipeline Rewrite

**Files:**
- Modify: `lib/grade/pipeline.ts`

- [ ] **Step 1: Rewrite the pipeline**

```typescript
// lib/grade/pipeline.ts
import { createServerClient } from '@/lib/supabase/server'
import { scorePhotoQuality } from './photo-quality'
import { aggregateReliability } from './reliability'
import { measureCentering } from './centering'
import { identifyCardFromTitle, identifyCardFromImage } from './card-identify'
import { ensureReferenceImages, getReferenceImages } from './reference-images'
import { getGradeDistribution } from './grade-dist-cache'
import { analyzeCorners } from './corner-analysis'
import { analyzeEdges } from './edge-analysis'
import { analyzeSurface } from './surface-analysis'
import { applyBayesianUpdate, computeGradeScore } from './grade-distribution'
import { fetchGradedComps } from './graded-comps'
import { calculateAllTiers } from './ev-engine'
import type { CardIdentity, CardImageManifest, GradeAnalysisRow } from './types'

export interface PipelineInput {
  analysisId: string
  // Personal mode: structured manifest
  manifest?: CardImageManifest
  // eBay mode: unstructured array (limited accuracy)
  imageUrls?: string[]
  rawPrice: number
  mode: 'ebay' | 'personal'
  ebayListingTitle?: string
}

export async function runPipeline(input: PipelineInput): Promise<void> {
  const supabase = createServerClient()

  async function updateRow(data: Partial<GradeAnalysisRow>) {
    await supabase.from('grade_analyses').update(data).eq('id', input.analysisId)
  }

  try {
    await updateRow({ status: 'analyzing' })

    // Determine image set
    const allImageUrls = input.manifest
      ? Object.values(input.manifest)
      : (input.imageUrls ?? [])

    // Step 1: Photo quality check (all images)
    const photoScores = await Promise.all(allImageUrls.map(scorePhotoQuality))
    const reliability = aggregateReliability(photoScores)

    // Step 2: Card identification
    let identity: CardIdentity | null = null
    if (input.ebayListingTitle) {
      identity = await identifyCardFromTitle(input.ebayListingTitle)
    }
    const frontImage = input.manifest?.front ?? input.imageUrls?.[0]
    if (!identity && frontImage) {
      identity = await identifyCardFromImage(frontImage)
    }
    if (!identity) {
      await updateRow({ status: 'error', error_message: 'Could not identify card.' })
      return
    }

    // Step 3: Centering — front + back separately (personal mode has both; eBay falls back)
    const frontUrl = input.manifest?.front ?? input.imageUrls?.[0] ?? ''
    const backUrl  = input.manifest?.back  ?? input.imageUrls?.[1] ?? frontUrl
    const centering = await measureCentering(frontUrl, backUrl)

    // Step 4: Reference images + grade distribution prior (parallel)
    const [_, priorResult] = await Promise.all([
      ensureReferenceImages(identity.cardKey, identity.player, identity.year, identity.set),
      getGradeDistribution(identity.cardKey, identity.player, identity.year, identity.set, identity.cardNumber),
    ])
    const { distribution: prior, popData } = priorResult
    const referenceImages = await getReferenceImages(identity.cardKey)

    // Step 5: Attribute analysis
    // Personal mode: full per-attribute analysis using manifest
    // eBay mode: single-call fallback using legacy attribute-analysis
    let multiplierSets: [number, number, number, number][]
    let attributeDetails: GradeAnalysisRow['attribute_details']
    let cornerData = null
    let edgeData = null
    let surfaceData = null

    if (input.manifest) {
      // Full analysis
      ;[cornerData, edgeData, surfaceData] = await Promise.all([
        analyzeCorners(input.manifest, referenceImages, identity.cardType),
        analyzeEdges(input.manifest, referenceImages, identity.cardType),
        analyzeSurface(input.manifest, referenceImages, identity.cardType),
      ])

      multiplierSets = [
        cornerData.multipliers,
        edgeData.multipliers,
        surfaceData.multipliers,
      ]

      attributeDetails = [
        {
          attribute: 'corners',
          assessment: cornerData.corners.reduce((w, c) => {
            const order = ['excellent', 'good', 'fair', 'poor']
            return order.indexOf(c.assessment) > order.indexOf(w) ? c.assessment : w
          }, 'excellent' as GradeAnalysisRow['attribute_details'][number]['assessment']),
          confidence: 'high',
          multipliers: cornerData.multipliers,
          notes: cornerData.notes,
        },
        {
          attribute: 'edges',
          assessment: edgeData.assessment,
          confidence: edgeData.confidence,
          multipliers: edgeData.multipliers,
          notes: edgeData.notes,
        },
        {
          attribute: 'surface',
          assessment: surfaceData.front.assessment,
          confidence: surfaceData.front.confidence,
          multipliers: surfaceData.multipliers,
          notes: surfaceData.front.notes,
        },
      ]
    } else {
      // eBay mode fallback — import legacy analyzer lazily to avoid loading it in personal mode
      const { analyzeAttributes } = await import('./attribute-analysis')
      const attrs = await analyzeAttributes(input.imageUrls ?? [], referenceImages)
      multiplierSets = attrs.map((a) => a.multipliers)
      attributeDetails = attrs
    }

    // Step 6: Bayesian grade distribution
    const distribution = applyBayesianUpdate(
      prior,
      multiplierSets,
      centering.front.psa10Eligible
    )
    const gradeScore = computeGradeScore(distribution)

    // Step 7: Graded comps + EV (parallel)
    const comps = await fetchGradedComps(identity.player, identity.year, identity.set, identity.cardNumber)
    const tiers = calculateAllTiers(input.rawPrice, distribution, comps)

    // Step 8: Caveats
    const caveats: string[] = []
    if (reliability.score !== 'high') {
      caveats.push('Surface defects may not be fully visible in current photos. Re-photograph with raking light for higher confidence.')
    }
    if (!centering.front.psa10Eligible) {
      const lr = centering.front.leftRight
      const tb = centering.front.topBottom
      caveats.push(`Front centering (${lr}/${100 - lr} L/R, ${tb}/${100 - tb} T/B) exceeds PSA 10 threshold of 55/45. PSA 10 is unlikely.`)
    }
    if (!centering.back.psa10Eligible) {
      caveats.push(`Back centering exceeds the 75/25 PSA 10 threshold.`)
    }
    if (surfaceData && surfaceData.front.defectsFound.length > 0) {
      caveats.push(`Potential surface defects detected: ${surfaceData.front.defectsFound.join(', ')}.`)
    }
    if (referenceImages.length < 5) {
      caveats.push('Limited reference images available. Grade comparison accuracy may be reduced.')
    }

    const regularTier     = tiers.find((t) => t.name === 'regular')!
    const expressTier     = tiers.find((t) => t.name === 'express')!
    const superExpressTier = tiers.find((t) => t.name === 'superExpress')!

    await updateRow({
      status: 'complete',
      card_key: identity.cardKey,
      card_type: identity.cardType,

      centering_front_lr: centering.front.leftRight,
      centering_front_tb: centering.front.topBottom,
      centering_front_eligible: centering.front.psa10Eligible,
      centering_back_lr: centering.back.leftRight,
      centering_back_tb: centering.back.topBottom,
      centering_back_eligible: centering.back.psa10Eligible,

      corner_tl_assessment: cornerData?.corners.find((c) => c.position === 'top_left')?.assessment,
      corner_tr_assessment: cornerData?.corners.find((c) => c.position === 'top_right')?.assessment,
      corner_bl_assessment: cornerData?.corners.find((c) => c.position === 'bottom_left')?.assessment,
      corner_br_assessment: cornerData?.corners.find((c) => c.position === 'bottom_right')?.assessment,
      corner_worst: cornerData?.worstCorner,

      subgrade_centering: centering.front.psa10Eligible ? 10 : centering.front.leftRight <= 60 ? 9 : 8,
      subgrade_corners: cornerData?.subGrade,
      subgrade_edges: edgeData?.subGrade,
      subgrade_surface: surfaceData?.front.subGrade,

      attribute_details: attributeDetails as unknown as GradeAnalysisRow['attribute_details'],
      grade_distribution: distribution as unknown as GradeAnalysisRow['grade_distribution'],
      continuous_score: gradeScore.continuousScore,
      confidence_band: gradeScore.confidenceBand,

      pop_gem_rate: popData?.gemRate,
      pop_count_10: popData?.count10,
      pop_count_9: popData?.count9,
      pop_count_8: popData?.count8,
      pop_count_7: popData?.count7,
      pop_total: popData?.total,

      graded_comps: comps as unknown as GradeAnalysisRow['graded_comps'],
      raw_price: input.rawPrice,
      ev_regular: regularTier.ev.evGraded,
      ep_regular: regularTier.ev.expectedProfit,
      ev_express: expressTier.ev.evGraded,
      ep_express: expressTier.ev.expectedProfit,
      ev_super_express: superExpressTier.ev.evGraded,
      ep_super_express: superExpressTier.ev.expectedProfit,
      break_even_grade: regularTier.ev.breakEvenGrade ?? undefined,
      break_even_prob: regularTier.ev.breakEvenProbability,
      recommendation: regularTier.ev.recommendation,
      reliability_score: reliability.score,
      caveats: caveats as unknown as GradeAnalysisRow['caveats'],
    })
  } catch (err) {
    await updateRow({
      status: 'error',
      error_message: err instanceof Error ? err.message : 'Pipeline failed.',
    })
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/grade/pipeline.ts
git commit -m "feat: pipeline rewrite — per-attribute analysis, front/back centering, PSA pop priors, continuous score"
```

---

## Task 14: Update Analyze API Route

**Files:**
- Modify: `app/api/grade/analyze/route.ts`

- [ ] **Step 1: Accept CardImageManifest for personal mode**

```typescript
// app/api/grade/analyze/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { getUserFromRequest } from '@/lib/auth'
import { inngest } from '@/inngest/client'
import type { CardImageManifest } from '@/lib/grade/types'

export async function POST(req: NextRequest) {
  const userId = await getUserFromRequest(req)
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await req.json()) as {
    manifest?: CardImageManifest        // personal mode — structured 10-photo set
    imageUrls?: string[]               // eBay mode — unstructured
    rawPrice: number
    mode: 'ebay' | 'personal'
    ebayItemId?: string
    ebayListingTitle?: string
  }

  const hasImages = (body.manifest && Object.keys(body.manifest).length > 0) || body.imageUrls?.length
  if (!hasImages || !body.rawPrice || !body.mode) {
    return NextResponse.json({ error: 'images (manifest or imageUrls), rawPrice, and mode are required' }, { status: 400 })
  }

  const supabase = createServerClient()

  const allImageUrls = body.manifest
    ? Object.values(body.manifest)
    : (body.imageUrls ?? [])

  const { data, error } = await supabase
    .from('grade_analyses')
    .insert({
      card_key: 'pending',
      mode: body.mode,
      status: 'pending',
      user_id: userId,
      ebay_item_id: body.ebayItemId,
      image_urls: allImageUrls,
      image_manifest: body.manifest ?? null,
      raw_price: body.rawPrice,
    })
    .select('id')
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'Failed to create analysis record' }, { status: 500 })
  }

  await inngest.send({
    name: 'grade/analyze.requested',
    data: {
      analysisId: data.id,
      manifest: body.manifest,
      imageUrls: body.imageUrls,
      rawPrice: body.rawPrice,
      mode: body.mode,
      ebayListingTitle: body.ebayListingTitle,
    },
  })

  return NextResponse.json({ analysisId: data.id })
}
```

- [ ] **Step 2: Update inngest grade-analyzer to pass manifest**

In `inngest/grade-analyzer.ts`, update the `runPipeline` call:

```typescript
// inngest/grade-analyzer.ts
import { inngest } from './client'
import { runPipeline } from '@/lib/grade/pipeline'
import type { CardImageManifest } from '@/lib/grade/types'

export const gradeAnalyzer = inngest.createFunction(
  { id: 'grade-analyzer', triggers: [{ event: 'grade/analyze.requested' }] },
  async ({ event }) => {
    await runPipeline({
      analysisId: event.data.analysisId as string,
      manifest: event.data.manifest as CardImageManifest | undefined,
      imageUrls: event.data.imageUrls as string[] | undefined,
      rawPrice: event.data.rawPrice as number,
      mode: event.data.mode as 'ebay' | 'personal',
      ebayListingTitle: event.data.ebayListingTitle as string | undefined,
    })
  }
)
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add app/api/grade/analyze/route.ts inngest/grade-analyzer.ts
git commit -m "feat: analyze route and inngest handler accept CardImageManifest for personal mode"
```

---

## Task 15: Capture Protocol Component

**Files:**
- Create: `components/grade/CaptureProtocol.tsx`

- [ ] **Step 1: Create the 10-step guided capture component**

```typescript
// components/grade/CaptureProtocol.tsx
'use client'

import { useState, useRef } from 'react'
import type { CardImageManifest, CardType } from '@/lib/grade/types'

interface StepConfig {
  key: keyof CardImageManifest
  label: string
  instructions: string
  rakingRequired?: boolean
}

function getSteps(cardType: CardType): StepConfig[] {
  const surfaceInstructions =
    cardType === 'foil_chrome'
      ? 'Hold a flashlight at 45° to the card surface. Look for foil scratches and check the card center for the Prizm Dimple indentation. The raking angle reveals defects invisible under overhead light.'
      : cardType === 'dark_border'
      ? 'Hold a flashlight at 45° to the card surface. Check for surface scratches. Also check dark edges under angled light for white specks (edge whitening).'
      : 'Hold a flashlight at 45° to the card surface. Look for scratches or print defects that only show at this angle.'

  return [
    { key: 'front',             label: 'Front',              instructions: 'Lay card flat. Overhead lighting, card fills the frame. Avoid glare.' },
    { key: 'back',              label: 'Back',               instructions: 'Flip the card. Same conditions as front — flat, overhead, no glare.' },
    { key: 'cornerTopLeft',     label: 'Top-Left Corner',    instructions: 'Move close. The corner should fill most of the frame. Even lighting.' },
    { key: 'cornerTopRight',    label: 'Top-Right Corner',   instructions: 'Same — corner fills the frame.' },
    { key: 'cornerBottomLeft',  label: 'Bottom-Left Corner', instructions: 'Same — corner fills the frame.' },
    { key: 'cornerBottomRight', label: 'Bottom-Right Corner',instructions: 'Same — corner fills the frame.' },
    { key: 'rakingLight',       label: 'Raking Light Surface', instructions: surfaceInstructions, rakingRequired: true },
    { key: 'edgeTop',           label: 'Top Edge',           instructions: 'Hold the card so the top edge runs horizontally across the frame.' },
    { key: 'edgeBottom',        label: 'Bottom Edge',        instructions: 'Same for the bottom edge.' },
    { key: 'edgeSides',         label: 'Left + Right Edges', instructions: 'Hold the card vertically so both side edges are visible in one photo.' },
  ]
}

interface Props {
  cardType?: CardType
  onComplete: (manifest: CardImageManifest) => void
}

export function CaptureProtocol({ cardType = 'matte', onComplete }: Props) {
  const steps = getSteps(cardType)
  const [currentStep, setCurrentStep] = useState(0)
  const [captures, setCaptures] = useState<Partial<CardImageManifest>>({})
  const fileInputRef = useRef<HTMLInputElement>(null)

  const step = steps[currentStep]
  const isLast = currentStep === steps.length - 1

  function handleCapture(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result as string
      const updated = { ...captures, [step.key]: dataUrl }
      setCaptures(updated)

      if (isLast) {
        onComplete(updated as CardImageManifest)
      } else {
        setCurrentStep((s) => s + 1)
      }
    }
    reader.readAsDataURL(file)

    // Reset input so the same file can be re-selected if needed
    e.target.value = ''
  }

  function retakeStep(index: number) {
    setCurrentStep(index)
    // Remove this and all subsequent captures so the flow re-runs from here
    const updated = { ...captures }
    steps.slice(index).forEach((s) => delete updated[s.key])
    setCaptures(updated)
  }

  const completedSteps = steps.filter((s) => captures[s.key])

  return (
    <div className="space-y-6">
      {/* Progress */}
      <div className="space-y-1">
        <div className="flex justify-between text-xs text-slate-500">
          <span>Photo {currentStep + 1} of {steps.length}</span>
          <span>{completedSteps.length} captured</span>
        </div>
        <div className="h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-indigo-500 transition-all"
            style={{ width: `${(completedSteps.length / steps.length) * 100}%` }}
          />
        </div>
      </div>

      {/* Current step */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-6 space-y-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-indigo-500 uppercase tracking-wide">
              Step {currentStep + 1}
            </span>
            {step.rakingRequired && (
              <span className="text-xs bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 px-2 py-0.5 rounded">
                Raking light required
              </span>
            )}
          </div>
          <h3 className="text-lg font-semibold">{step.label}</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">{step.instructions}</p>
        </div>

        <button
          onClick={() => fileInputRef.current?.click()}
          className="w-full py-10 border-2 border-dashed border-indigo-300 dark:border-indigo-700 rounded-lg text-indigo-500 hover:border-indigo-500 transition-colors text-sm font-medium"
        >
          Tap to capture {step.label}
        </button>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handleCapture}
        />
      </div>

      {/* Completed steps */}
      {completedSteps.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Captured</p>
          <div className="grid grid-cols-5 gap-2">
            {steps.map((s, i) => {
              const url = captures[s.key]
              if (!url) return null
              return (
                <button
                  key={s.key}
                  onClick={() => retakeStep(i)}
                  className="relative aspect-square rounded overflow-hidden border border-slate-200 dark:border-slate-700 hover:opacity-80 transition-opacity"
                  title={`Retake ${s.label}`}
                >
                  <img src={url} alt={s.label} className="object-cover w-full h-full" />
                  <span className="absolute bottom-0 left-0 right-0 text-[9px] bg-black/60 text-white text-center py-0.5 truncate px-1">
                    {s.label}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add components/grade/CaptureProtocol.tsx
git commit -m "feat: 10-photo CaptureProtocol component with card-type-aware raking light guidance"
```

---

## Task 16: SubGradeBreakdown Component

**Files:**
- Create: `components/grade/SubGradeBreakdown.tsx`

- [ ] **Step 1: Create the component**

```typescript
// components/grade/SubGradeBreakdown.tsx
import type { GradeAnalysisRow } from '@/lib/grade/types'

const SUBGRADE_LABEL: Record<number, string> = {
  10: 'Gem Mint',
  9: 'Mint',
  8: 'NM-MT',
  7: 'NM',
  6: 'EX-MT',
}

function SubGradeBar({ label, score, notes }: { label: string; score?: number; notes?: string }) {
  if (score === undefined) return null
  const pct = ((score - 6) / 4) * 100  // map 6–10 to 0–100%
  const colour =
    score >= 10 ? 'bg-emerald-500' :
    score >= 9  ? 'bg-blue-500'    :
    score >= 8  ? 'bg-amber-500'   : 'bg-red-500'

  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className="text-slate-500">{score.toFixed(1)} — {SUBGRADE_LABEL[Math.round(score)] ?? ''}</span>
      </div>
      <div className="h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
        <div className={`h-full ${colour} rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
      {notes && <p className="text-xs text-slate-500 dark:text-slate-400">{notes}</p>}
    </div>
  )
}

interface Props {
  result: GradeAnalysisRow
}

export function SubGradeBreakdown({ result }: Props) {
  const centeringNote = result.centering_front_eligible
    ? `${result.centering_front_lr ?? 50}/${100 - (result.centering_front_lr ?? 50)} L/R — PSA 10 eligible`
    : `${result.centering_front_lr ?? 50}/${100 - (result.centering_front_lr ?? 50)} L/R — exceeds 55/45 threshold`

  const cornerWorst = result.corner_worst
    ? ` Worst: ${result.corner_worst.replace('_', ' ')}`
    : ''

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-6 space-y-5">
      <h3 className="font-semibold">Sub-Grade Breakdown</h3>

      <SubGradeBar
        label="Centering"
        score={result.subgrade_centering}
        notes={centeringNote}
      />
      <SubGradeBar
        label="Corners"
        score={result.subgrade_corners}
        notes={result.attribute_details?.find((a) => a.attribute === 'corners')?.notes + cornerWorst}
      />
      <SubGradeBar
        label="Edges"
        score={result.subgrade_edges}
        notes={result.attribute_details?.find((a) => a.attribute === 'edges')?.notes}
      />
      <SubGradeBar
        label="Surface"
        score={result.subgrade_surface}
        notes={result.attribute_details?.find((a) => a.attribute === 'surface')?.notes}
      />

      {result.continuous_score !== undefined && (
        <div className="pt-3 border-t border-slate-200 dark:border-slate-700">
          <div className="flex justify-between items-baseline">
            <span className="font-semibold text-lg">Predicted Score</span>
            <span className="text-2xl font-bold">
              {result.continuous_score.toFixed(1)}
              <span className="text-base font-normal text-slate-500 ml-1">
                ±{result.confidence_band?.toFixed(1)}
              </span>
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/grade/SubGradeBreakdown.tsx
git commit -m "feat: SubGradeBreakdown component with per-attribute bars and continuous score"
```

---

## Task 17: Submission Verdict Component

**Files:**
- Create: `components/grade/SubmissionVerdict.tsx`

- [ ] **Step 1: Create the component**

```typescript
// components/grade/SubmissionVerdict.tsx
import type { GradeAnalysisRow } from '@/lib/grade/types'

const TIER_LABEL: Record<string, string> = {
  regular: 'Regular ($25 · ~45 days)',
  express: 'Express ($150 · ~5 days)',
  superExpress: 'Super Express ($500 · ~2 days)',
}

function fmt(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
}
function fmtPct(n: number) {
  return `${Math.round(n * 100)}%`
}

interface Props {
  result: GradeAnalysisRow
  onTrack?: () => void
}

export function SubmissionVerdict({ result, onTrack }: Props) {
  const rec = result.recommendation
  const epRegular = result.ep_regular ?? 0
  const evRegular = result.ev_regular ?? 0
  const breakEvenGrade = result.break_even_grade
  const breakEvenProb  = result.break_even_prob ?? 0

  const verdictColour =
    rec === 'grade'     ? 'bg-emerald-50 border-emerald-300 dark:bg-emerald-900/20 dark:border-emerald-700' :
    rec === 'uncertain' ? 'bg-amber-50 border-amber-300 dark:bg-amber-900/20 dark:border-amber-700'         :
                          'bg-red-50 border-red-300 dark:bg-red-900/20 dark:border-red-700'
  const verdictText =
    rec === 'grade'     ? '✓ Submit' :
    rec === 'uncertain' ? '~ Borderline' : '✕ Skip'
  const verdictDesc =
    rec === 'grade'
      ? `Expected profit of ${fmt(epRegular)} at Regular tier. Break-even at PSA ${breakEvenGrade} or better (${fmtPct(breakEvenProb)} probability).`
      : rec === 'uncertain'
      ? `Marginal expected profit. Break-even at PSA ${breakEvenGrade} (${fmtPct(breakEvenProb)} probability). Consider only if you have high confidence in condition.`
      : `Expected value (${fmt(evRegular)}) does not exceed total cost after grading fees. Skip submission.`

  return (
    <div className="space-y-4">
      {/* Main verdict */}
      <div className={`rounded-xl border p-5 space-y-2 ${verdictColour}`}>
        <div className="flex items-center justify-between">
          <span className="text-xl font-bold">{verdictText}</span>
          {onTrack && rec !== 'skip' && (
            <button
              onClick={onTrack}
              className="text-sm text-indigo-500 hover:underline"
            >
              Add to portfolio
            </button>
          )}
        </div>
        <p className="text-sm text-slate-600 dark:text-slate-300">{verdictDesc}</p>
      </div>

      {/* EV table by tier */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 divide-y divide-slate-200 dark:divide-slate-700">
        {[
          { label: TIER_LABEL.regular,      ev: result.ev_regular,      ep: result.ep_regular      },
          { label: TIER_LABEL.express,      ev: result.ev_express,      ep: result.ep_express      },
          { label: TIER_LABEL.superExpress, ev: result.ev_super_express, ep: result.ep_super_express },
        ].map(({ label, ev, ep }) => (
          <div key={label} className="flex justify-between px-4 py-3 text-sm">
            <span className="text-slate-600 dark:text-slate-400">{label}</span>
            <span className={`font-medium ${(ep ?? 0) > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}`}>
              {fmt(ep ?? 0)} expected profit
            </span>
          </div>
        ))}
      </div>

      {/* PSA Population */}
      {result.pop_total !== undefined && result.pop_total > 0 && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 space-y-2">
          <p className="text-sm font-medium">PSA Population</p>
          <div className="grid grid-cols-4 gap-2 text-center">
            {([10, 9, 8, 7] as const).map((grade) => {
              const count = grade === 10 ? result.pop_count_10 :
                            grade === 9  ? result.pop_count_9  :
                            grade === 8  ? result.pop_count_8  : result.pop_count_7
              return (
                <div key={grade} className="space-y-0.5">
                  <div className="text-lg font-bold">{count ?? '—'}</div>
                  <div className="text-xs text-slate-500">PSA {grade}</div>
                </div>
              )
            })}
          </div>
          {result.pop_gem_rate !== undefined && (
            <p className="text-xs text-slate-500 text-center">
              Gem rate: {fmtPct(result.pop_gem_rate)} of {result.pop_total.toLocaleString()} submitted
            </p>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/grade/SubmissionVerdict.tsx
git commit -m "feat: SubmissionVerdict component with verdict, EV table, and PSA population panel"
```

---

## Task 18: Grade Page Integration

**Files:**
- Modify: `app/(app)/grade/page.tsx`

- [ ] **Step 1: Update the page to use CaptureProtocol and new result components**

```typescript
// app/(app)/grade/page.tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ModeToggle } from '@/components/grade/ModeToggle'
import { EbayInput } from '@/components/grade/EbayInput'
import { CaptureProtocol } from '@/components/grade/CaptureProtocol'
import { PhotoGrid } from '@/components/grade/PhotoGrid'
import { ReliabilityBanner } from '@/components/grade/ReliabilityBanner'
import { CardConfirmation } from '@/components/grade/CardConfirmation'
import { AnalysisLoader } from '@/components/grade/AnalysisLoader'
import { SubGradeBreakdown } from '@/components/grade/SubGradeBreakdown'
import { SubmissionVerdict } from '@/components/grade/SubmissionVerdict'
import { GradeDistributionChart } from '@/components/grade/GradeDistribution'
import { CaveatList } from '@/components/grade/CaveatList'
import { AnalysisHistory } from '@/components/grade/AnalysisHistory'
import type { CardImageManifest, GradeAnalysisRow } from '@/lib/grade/types'

type Stage = 'input' | 'confirm' | 'analyzing' | 'result'

export default function GradePage() {
  const router = useRouter()
  const [mode, setMode] = useState<'ebay' | 'personal'>('personal')
  const [stage, setStage] = useState<Stage>('input')
  const [manifest, setManifest] = useState<CardImageManifest | null>(null)
  const [imageUrls, setImageUrls] = useState<string[]>([])          // eBay mode
  const [ebayMeta, setEbayMeta] = useState<{ itemId: string; title: string; price: number | null } | null>(null)
  const [analysisId, setAnalysisId] = useState<string | null>(null)
  const [result, setResult] = useState<GradeAnalysisRow | null>(null)

  function reset() {
    setStage('input')
    setManifest(null)
    setImageUrls([])
    setEbayMeta(null)
    setAnalysisId(null)
    setResult(null)
  }

  async function startAnalysis(confirmedRawPrice: number) {
    setStage('analyzing')

    const body = mode === 'personal'
      ? { manifest, rawPrice: confirmedRawPrice, mode }
      : { imageUrls, rawPrice: confirmedRawPrice, mode, ebayItemId: ebayMeta?.itemId, ebayListingTitle: ebayMeta?.title }

    const res = await fetch('/api/grade/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    const { analysisId: id } = (await res.json()) as { analysisId: string }
    setAnalysisId(id)
  }

  function onAnalysisComplete(row: GradeAnalysisRow) {
    setResult(row)
    setStage('result')
  }

  const previewUrls = manifest ? Object.values(manifest) : imageUrls

  return (
    <div className="max-w-5xl mx-auto px-6 py-10 space-y-8">
      <div className="space-y-1">
        <h1 className="text-3xl font-bold">Pre-Grade</h1>
        <p className="text-slate-500 dark:text-slate-400 text-sm">
          Predict PSA grade probability and calculate expected submission profit before you submit.
        </p>
      </div>

      {stage === 'input' && (
        <div className="space-y-6">
          <ModeToggle mode={mode} onChange={(m) => { setMode(m); reset() }} />

          {mode === 'ebay' ? (
            <EbayInput
              onImagesLoaded={(urls, meta) => {
                setImageUrls(urls)
                setEbayMeta(meta)
                setStage('confirm')
              }}
            />
          ) : (
            <CaptureProtocol
              onComplete={(m) => {
                setManifest(m)
                setStage('confirm')
              }}
            />
          )}
        </div>
      )}

      {stage === 'confirm' && (
        <div className="space-y-4">
          <PhotoGrid imageUrls={previewUrls} mode={mode} />
          {mode === 'ebay' && <ReliabilityBanner imageUrls={imageUrls} />}
          <CardConfirmation
            imageUrls={previewUrls}
            listingTitle={ebayMeta?.title}
            suggestedPrice={ebayMeta?.price ?? undefined}
            onConfirm={startAnalysis}
          />
        </div>
      )}

      {stage === 'analyzing' && (
        analysisId
          ? <AnalysisLoader analysisId={analysisId} onComplete={onAnalysisComplete} />
          : <div className="flex flex-col items-center justify-center py-20 space-y-4">
              <div className="h-10 w-10 rounded-full border-4 border-indigo-500/30 border-t-indigo-500 animate-spin" />
              <p className="text-sm text-slate-400">Starting analysis…</p>
            </div>
      )}

      {stage === 'result' && result && (
        <div className="space-y-8">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">
              {result.card_key.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
            </h2>
            <button onClick={reset} className="text-sm text-indigo-500 hover:underline">
              New Analysis
            </button>
          </div>

          <SubmissionVerdict
            result={result}
            onTrack={() => {
              const params = new URLSearchParams({ addFrom: 'analysis', analysisId: result.id, player: result.card_key })
              router.push(`/portfolio?${params.toString()}`)
            }}
          />

          <SubGradeBreakdown result={result} />

          <GradeDistributionChart distribution={result.grade_distribution} comps={result.graded_comps} />

          <CaveatList caveats={result.caveats as string[]} />
        </div>
      )}

      <div className="border-t border-slate-200 dark:border-slate-800 pt-8">
        <AnalysisHistory />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Start dev server and test the flow manually**

```bash
npm run dev
```

Navigate to `/grade`. Verify:
1. Personal mode shows CaptureProtocol with 10-step flow
2. Each step shows correct instructions for the step type
3. Completing all 10 steps triggers confirmation stage
4. eBay mode still works (EbayInput → confirm → analyze)
5. After analysis, result page shows SubGradeBreakdown and SubmissionVerdict

- [ ] **Step 4: Commit**

```bash
git add app/(app)/grade/page.tsx
git commit -m "feat: grade page — CaptureProtocol flow, SubGradeBreakdown, SubmissionVerdict"
```

---

## Task 19: Post-Submission Outcome Route

**Files:**
- Create: `app/api/grade/analyses/[id]/outcome/route.ts`

- [ ] **Step 1: Create route**

```typescript
// app/api/grade/analyses/[id]/outcome/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { getUserFromRequest } from '@/lib/auth'

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const userId = await getUserFromRequest(req)
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { actualGrade } = (await req.json()) as { actualGrade: number }
  if (typeof actualGrade !== 'number' || actualGrade < 1 || actualGrade > 10) {
    return NextResponse.json({ error: 'actualGrade must be a number between 1 and 10' }, { status: 400 })
  }

  const supabase = createServerClient()

  const { error } = await supabase
    .from('grade_analyses')
    .update({
      actual_psa_grade: actualGrade,
      outcome_logged_at: new Date().toISOString(),
    })
    .eq('id', params.id)
    .eq('user_id', userId)

  if (error) return NextResponse.json({ error: 'Update failed' }, { status: 500 })

  return NextResponse.json({ success: true })
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/grade/analyses/[id]/outcome/route.ts
git commit -m "feat: PUT /api/grade/analyses/[id]/outcome — log actual PSA grade post-submission"
```

---

## Task 20: Full Test Run and Cleanup

- [ ] **Step 1: Run all tests**

```bash
npx vitest run
```

Expected: all tests pass.

- [ ] **Step 2: Full TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Delete superseded attribute-analysis.ts** (now only used as eBay fallback via dynamic import — keep the file, just note it is no longer the primary path)

The file `lib/grade/attribute-analysis.ts` is intentionally kept as an eBay-mode fallback. No deletion required.

- [ ] **Step 4: Final integration smoke test**

```bash
npm run dev
```

Submit a personal-mode card through the full 10-photo flow and verify:
- All 10 photos captured in order
- Analysis runs (Inngest processes the job)
- Result shows continuous score, sub-grade breakdown, PSA population panel, submission verdict
- eBay mode still functions end-to-end

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat: Phase 1 complete — structured capture, per-attribute analysis, PSA pop priors, submission verdict"
```

---

## Self-Review

**Spec coverage check:**
- ✅ 10-photo structured capture protocol — Task 15 (CaptureProtocol)
- ✅ Card-type-aware capture guidance — Task 15 (getSteps with cardType)
- ✅ Per-corner analysis (4 separate calls, 3× each) — Task 8
- ✅ Edge analysis with dark-border whitening detection — Task 9
- ✅ Front raking-light + back surface analysis — Task 10
- ✅ Front + back centering measured separately — Task 7
- ✅ PSA pop-seeded grade priors — Tasks 5, 11
- ✅ Multi-pass aggregation (3× per attribute) — Task 4
- ✅ Continuous grade score + confidence band — Task 12
- ✅ Four sub-grade scores with PSA language — Tasks 8–10, 16
- ✅ Full submission decision output (grade + market + pop + EV + verdict) — Task 17
- ✅ Weak-link identification — SubGradeBreakdown surfaces lowest sub-grade
- ✅ PSA API client — Task 5
- ✅ Database migration — Task 2
- ✅ Post-submission outcome logging — Task 19
- ✅ eBay mode retained with limited-accuracy fallback — Task 14 (dynamic import of attribute-analysis)
- ✅ Borderline flag — SubmissionVerdict surfaces "uncertain" recommendation with explicit language
