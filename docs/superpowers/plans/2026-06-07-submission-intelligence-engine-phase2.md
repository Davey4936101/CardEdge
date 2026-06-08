# Submission Intelligence Engine — Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add deal scanner grade potential scoring to every raw deal result, and build a dedicated BGS → PSA crossover engine.

**Architecture:** Two independent subsystems. (1) Grade potential: a lightweight single-Claude-call quick-grade runs asynchronously via Inngest after each deal scan, enriching `alerts` rows with `grade_potential_score`, `ev_if_graded`, and `grade_upside`; the deal card and filter sidebar surface this data. (2) BGS crossover: a pure TypeScript probability model + 3-way EV comparison lives in `lib/grade/crossover.ts`, served by `POST /api/grade/crossover`, with a dedicated page at `/grade/crossover`.

**Tech Stack:** Next.js App Router, TypeScript, Supabase, Inngest, Claude Anthropic SDK (`claude-opus-4-8`), Tailwind CSS, Vitest.

---

## File Map

**New files:**
- `lib/grade/quick-grade.ts` — single-image Claude call; returns rough `GradeDistribution` + PSA 10 probability
- `lib/grade/deal-grade-potential.ts` — given a quick-grade result + fetched comps, compute `ev_if_graded` and `grade_upside`
- `lib/grade/crossover.ts` — BGS→PSA crossover probability model + 3-way EV calculation
- `lib/grade/__tests__/crossover.test.ts` — unit tests for crossover model and EV logic
- `inngest/deal-grade-enricher.ts` — Inngest function; listens for `deals/grade-potential.requested`, runs quick-grade, updates alert row
- `components/deals/GradePotentialBadge.tsx` — badge showing PSA 10% and EV; renders skeleton when null
- `components/grade/CrossoverAnalysis.tsx` — BGS crossover UI: sub-grade inputs, 3-way EV comparison, recommendation
- `app/api/grade/crossover/route.ts` — POST handler for crossover analysis
- `app/(app)/grade/crossover/page.tsx` — crossover page (linked from grade nav)
- `supabase/migrations/20260607_grade_phase2.sql` — alerts columns + `bgs_crossover_analyses` table

**Modified files:**
- `lib/deals/deal-score.ts` — add `grade_potential_score`, `ev_if_graded`, `grade_upside` to `Alert` interface; add `positiveGradingEv` to `FilterState` + `DEFAULT_FILTERS`; add `positiveGradingEv` to `applyFilters`
- `components/deals/DealCard.tsx` — render `GradePotentialBadge` in the actions column
- `components/deals/DealSidebar.tsx` — add "Positive Grading EV" checkbox filter
- `app/api/deals/scan/route.ts` — after scan completes, fire `deals/grade-potential.requested` events for new alerts
- `app/api/inngest/route.ts` — register `dealGradeEnricher` function

---

## Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/20260607_grade_phase2.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- supabase/migrations/20260607_grade_phase2.sql

-- Grade potential columns on alerts
ALTER TABLE alerts
  ADD COLUMN IF NOT EXISTS grade_potential_score float,   -- P(PSA 10), 0–1
  ADD COLUMN IF NOT EXISTS ev_if_graded float,           -- expected sale value after grading
  ADD COLUMN IF NOT EXISTS grade_upside float;           -- ev_if_graded - listed_price - Regular fee

-- BGS crossover analyses table
CREATE TABLE IF NOT EXISTS bgs_crossover_analyses (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              uuid NOT NULL,
  card_key             text NOT NULL,
  input_method         text NOT NULL CHECK (input_method IN ('photo', 'manual')),
  centering_sub        numeric(3,1) NOT NULL,
  corners_sub          numeric(3,1) NOT NULL,
  edges_sub            numeric(3,1) NOT NULL,
  surface_sub          numeric(3,1) NOT NULL,
  crossover_probability float NOT NULL,
  ev_keep_bgs          float,
  ev_crossover         float,
  ev_crack_raw         float,
  recommendation       text NOT NULL CHECK (recommendation IN ('keep', 'crossover', 'crack')),
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bgs_crossover_user_idx ON bgs_crossover_analyses (user_id, created_at DESC);
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260607_grade_phase2.sql
git commit -m "feat: Phase 2 DB migration — alerts grade potential cols + bgs_crossover_analyses"
```

---

## Task 2: Quick Grade — Single-Image PSA 10 Estimate

**Files:**
- Create: `lib/grade/quick-grade.ts`

The quick grade is a single Claude call on a listing's primary image. It returns a rough `GradeDistribution` (probabilities must sum to 1) and a PSA 10 probability for display. This is intentionally lightweight — no multi-pass, no manifest.

- [ ] **Step 1: Create the module**

```typescript
// lib/grade/quick-grade.ts
import Anthropic from '@anthropic-ai/sdk'
import { toAnthropicImageSource } from './image-source'
import type { GradeDistribution } from './types'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export interface QuickGradeResult {
  distribution: GradeDistribution
  psa10Probability: number  // 0–1, same as distribution[10]
  confidence: 'high' | 'low'
}

const PROMPT = `You are a PSA card grading expert evaluating a single listing photo.
Based ONLY on what is visible in this image, estimate the probability this raw card receives each PSA grade when submitted.

Return JSON only, no prose:
{
  "p10": 0.25,
  "p9": 0.45,
  "p8": 0.20,
  "p7": 0.10,
  "confidence": "high"
}

Rules:
- p10 + p9 + p8 + p7 must equal exactly 1.0
- confidence is "low" when the image is low-quality, shows only one side, or is a stock/placeholder photo
- confidence is "high" when centering, corners, and surface are reasonably visible
- If the card appears already graded (slab visible), set confidence to "low" and distribute conservatively`

export async function quickGrade(imageUrl: string): Promise<QuickGradeResult> {
  const fallback: QuickGradeResult = {
    distribution: { 10: 0.08, 9: 0.50, 8: 0.30, 7: 0.12 },
    psa10Probability: 0.08,
    confidence: 'low',
  }

  if (!imageUrl) return fallback

  try {
    const response = await client.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 256,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: toAnthropicImageSource(imageUrl) },
          { type: 'text', text: PROMPT },
        ],
      }],
    })

    const text = response.content[0].type === 'text' ? response.content[0].text : ''
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) return fallback

    const parsed = JSON.parse(match[0]) as {
      p10?: number; p9?: number; p8?: number; p7?: number; confidence?: string
    }

    const p10 = parsed.p10 ?? 0.08
    const p9  = parsed.p9  ?? 0.50
    const p8  = parsed.p8  ?? 0.30
    const p7  = parsed.p7  ?? 0.12
    const total = p10 + p9 + p8 + p7

    if (total <= 0) return fallback

    // Normalise to sum to exactly 1
    const distribution: GradeDistribution = {
      10: p10 / total,
      9:  p9  / total,
      8:  p8  / total,
      7:  p7  / total,
    }

    return {
      distribution,
      psa10Probability: distribution[10],
      confidence: parsed.confidence === 'high' ? 'high' : 'low',
    }
  } catch {
    return fallback
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/grade/quick-grade.ts
git commit -m "feat: quick-grade — single-image PSA 10 probability estimate"
```

---

## Task 3: Deal Grade Potential — EV Calculation

**Files:**
- Create: `lib/grade/deal-grade-potential.ts`

Given a quick-grade result and fetched graded comps, compute the three deal enrichment values.

PSA Regular fee = $25, shipping = $12, total cost = $37. `ev_if_graded` = weighted average sale value. `grade_upside` = ev_if_graded − listed_price − $37.

- [ ] **Step 1: Create the module**

```typescript
// lib/grade/deal-grade-potential.ts
import { fetchGradedComps } from './graded-comps'
import type { QuickGradeResult } from './quick-grade'

const PSA_REGULAR_TOTAL_COST = (
  Number(process.env.PSA_REGULAR_FEE ?? 25) +
  Number(process.env.PSA_SHIPPING_COST ?? 12)
)

export interface GradePotential {
  gradePotentialScore: number   // P(PSA 10), 0–1
  evIfGraded: number | null     // null when no comps available
  gradeUpside: number | null    // null when no comps available
}

export async function computeGradePotential(
  quickGrade: QuickGradeResult,
  player: string,
  year: number,
  set: string,
  cardNumber: string,
  listedPrice: number
): Promise<GradePotential> {
  const comps = await fetchGradedComps(player, year, set, cardNumber)

  const grades = [10, 9, 8, 7] as const
  let evIfGraded = 0
  let coveredProb = 0

  for (const grade of grades) {
    const comp = comps[grade]
    if (comp !== undefined) {
      evIfGraded += quickGrade.distribution[grade] * comp
      coveredProb += quickGrade.distribution[grade]
    }
  }

  if (coveredProb === 0) {
    return { gradePotentialScore: quickGrade.psa10Probability, evIfGraded: null, gradeUpside: null }
  }

  // Scale EV to full probability mass
  evIfGraded = evIfGraded / coveredProb

  return {
    gradePotentialScore: quickGrade.psa10Probability,
    evIfGraded: Math.round(evIfGraded * 100) / 100,
    gradeUpside: Math.round((evIfGraded - listedPrice - PSA_REGULAR_TOTAL_COST) * 100) / 100,
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/grade/deal-grade-potential.ts
git commit -m "feat: deal-grade-potential — EV and grade upside calculator"
```

---

## Task 4: Inngest Enricher + Scan Route Integration

**Files:**
- Create: `inngest/deal-grade-enricher.ts`
- Modify: `app/api/deals/scan/route.ts`
- Modify: `app/api/inngest/route.ts`

The enricher listens for `deals/grade-potential.requested`, runs quick-grade + grade potential, then updates the alert row. The scan route fires one event per new alert after the scan completes.

- [ ] **Step 1: Create the Inngest enricher function**

```typescript
// inngest/deal-grade-enricher.ts
import { inngest } from './client'
import { createServerClient } from '@/lib/supabase/server'
import { quickGrade } from '@/lib/grade/quick-grade'
import { computeGradePotential } from '@/lib/grade/deal-grade-potential'
import { identifyCardFromTitle } from '@/lib/grade/card-identify'

export const dealGradeEnricher = inngest.createFunction(
  { id: 'deal-grade-enricher', triggers: [{ event: 'deals/grade-potential.requested' }] },
  async ({ event }) => {
    const { alertId, imageUrl, cardTitle, listedPrice } = event.data as {
      alertId: string
      imageUrl: string | null
      cardTitle: string
      listedPrice: number
    }

    if (!imageUrl) return { skipped: 'no_image' }

    const supabase = createServerClient()

    const [qg, identity] = await Promise.all([
      quickGrade(imageUrl),
      identifyCardFromTitle(cardTitle),
    ])

    if (!identity) {
      await supabase
        .from('alerts')
        .update({ grade_potential_score: qg.psa10Probability })
        .eq('id', alertId)
      return { alertId, psa10: qg.psa10Probability, ev: null }
    }

    const potential = await computeGradePotential(
      qg,
      identity.player,
      identity.year,
      identity.set,
      identity.cardNumber,
      listedPrice
    )

    await supabase
      .from('alerts')
      .update({
        grade_potential_score: potential.gradePotentialScore,
        ev_if_graded: potential.evIfGraded,
        grade_upside: potential.gradeUpside,
      })
      .eq('id', alertId)

    return { alertId, psa10: potential.gradePotentialScore, ev: potential.evIfGraded }
  }
)
```

- [ ] **Step 2: Update the scan route to fire enrichment events after scan**

Read `app/api/deals/scan/route.ts` first, then apply this change — after `await load()` or the scan call resolves, query newly created alerts and fire events. Replace the return statement inside the try block:

```typescript
// app/api/deals/scan/route.ts  (inside the try block, after newDeals is known)
// Fire grade-potential enrichment for new alerts (best-effort, non-blocking)
if (newDeals > 0) {
  const { data: freshAlerts } = await supabase
    .from('alerts')
    .select('id, image_url, card_title, listed_price')
    .order('created_at', { ascending: false })
    .limit(newDeals)

  if (freshAlerts && freshAlerts.length > 0) {
    const { inngest: inngestClient } = await import('@/inngest/client')
    await inngestClient.send(
      freshAlerts.map((a: { id: string; image_url: string | null; card_title: string; listed_price: number }) => ({
        name: 'deals/grade-potential.requested' as const,
        data: {
          alertId: a.id,
          imageUrl: a.image_url,
          cardTitle: a.card_title,
          listedPrice: Number(a.listed_price),
        },
      }))
    )
  }
}
```

The full updated return block (replace existing `return NextResponse.json({ newDeals, queriesScanned: slice.length })`):

```typescript
    // Fire grade-potential enrichment for new alerts (best-effort, non-blocking)
    if (newDeals > 0) {
      const { data: freshAlerts } = await supabase
        .from('alerts')
        .select('id, image_url, card_title, listed_price')
        .order('created_at', { ascending: false })
        .limit(newDeals)

      if (freshAlerts && freshAlerts.length > 0) {
        const { inngest: inngestClient } = await import('@/inngest/client')
        await inngestClient.send(
          (freshAlerts as Array<{ id: string; image_url: string | null; card_title: string; listed_price: number }>).map((a) => ({
            name: 'deals/grade-potential.requested' as const,
            data: {
              alertId: a.id,
              imageUrl: a.image_url,
              cardTitle: a.card_title,
              listedPrice: Number(a.listed_price),
            },
          }))
        )
      }
    }

    return NextResponse.json({ newDeals, queriesScanned: slice.length })
```

- [ ] **Step 3: Register dealGradeEnricher in the Inngest serve route**

```typescript
// app/api/inngest/route.ts — add import and register
import { dealGradeEnricher } from '@/inngest/deal-grade-enricher'

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [gradeAnalyzer, portfolioValueRefresh, playerIntelScanner, bidWatchScanner, dealGradeEnricher],
})
```

- [ ] **Step 4: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep -E "deal-grade|grade-enricher|scan/route" | head -20
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add inngest/deal-grade-enricher.ts app/api/deals/scan/route.ts app/api/inngest/route.ts
git commit -m "feat: Inngest deal-grade-enricher — async grade potential enrichment after scan"
```

---

## Task 5: Deal UI — Grade Potential Badge, Filter, and DealCard Update

**Files:**
- Create: `components/deals/GradePotentialBadge.tsx`
- Modify: `lib/deals/deal-score.ts`
- Modify: `components/deals/DealCard.tsx`
- Modify: `components/deals/DealSidebar.tsx`

- [ ] **Step 1: Add new fields to Alert interface and FilterState**

In `lib/deals/deal-score.ts`, update:

```typescript
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
  buying_format: string | null
  sport: string | null
  is_read: boolean
  created_at: string
  watchlists: { name: string } | null
  // Phase 2 grade potential (nullable — enriched asynchronously)
  grade_potential_score: number | null
  ev_if_graded: number | null
  grade_upside: number | null
}
```

Update `FilterState` by adding:
```typescript
  positiveGradingEv: boolean
```

Update `DEFAULT_FILTERS` by adding:
```typescript
  positiveGradingEv: false,
```

Update `applyFilters` — add at the end of the filter chain:
```typescript
  if (f.positiveGradingEv) {
    result = result.filter((a) => (a.grade_upside ?? -Infinity) > 0)
  }
```

- [ ] **Step 2: Create GradePotentialBadge component**

```typescript
// components/deals/GradePotentialBadge.tsx
interface Props {
  psa10Prob: number | null
  gradeUpside: number | null
}

function fmt(n: number) {
  const sign = n >= 0 ? '+' : ''
  return `${sign}$${Math.abs(Math.round(n))}`
}

export function GradePotentialBadge({ psa10Prob, gradeUpside }: Props) {
  if (psa10Prob === null) {
    // Skeleton — enrichment still in progress
    return (
      <div className="h-8 w-[80px] rounded-md bg-slate-800/60 animate-pulse border border-slate-700/40" />
    )
  }

  const pct = Math.round(psa10Prob * 100)
  const positive = (gradeUpside ?? 0) > 0
  const colour = positive
    ? 'bg-violet-500/15 text-violet-300 border-violet-500/30'
    : 'bg-slate-700/40 text-slate-500 border-slate-700/60'

  return (
    <div
      className={`flex flex-col items-center justify-center rounded-md border px-2 py-1 min-w-[72px] text-center ${colour}`}
      title={gradeUpside !== null ? `Grade upside: ${fmt(gradeUpside)} after PSA Regular fees` : undefined}
    >
      <span className="text-[11px] font-bold tabular-nums leading-none">PSA 10: {pct}%</span>
      {gradeUpside !== null && (
        <span className="text-[9px] tabular-nums mt-0.5 opacity-80">{fmt(gradeUpside)} EV</span>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Render GradePotentialBadge in DealCard**

In `components/deals/DealCard.tsx`, add to the actions column (after the RoiBadge and before the eBay link):

```typescript
import { GradePotentialBadge } from './GradePotentialBadge'

// Inside the JSX actions column, after <RoiBadge roi={alert.roi_pct} />:
<GradePotentialBadge
  psa10Prob={alert.grade_potential_score}
  gradeUpside={alert.grade_upside}
/>
```

- [ ] **Step 4: Add "Positive Grading EV" filter checkbox to DealSidebar**

In `components/deals/DealSidebar.tsx`, add a new section after the existing "Graded Only" checkbox (before the price range inputs):

```typescript
<CheckboxRow
  checked={filters.positiveGradingEv}
  onChange={(v) => set('positiveGradingEv', v)}
>
  Positive Grading EV
</CheckboxRow>
```

Also update the `hasActiveFilters` check to include:
```typescript
filters.positiveGradingEv !== DEFAULT_FILTERS.positiveGradingEv ||
```

- [ ] **Step 5: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep -E "DealCard|DealSidebar|GradePotential|deal-score" | head -20
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add lib/deals/deal-score.ts components/deals/GradePotentialBadge.tsx components/deals/DealCard.tsx components/deals/DealSidebar.tsx
git commit -m "feat: grade potential badge and filter on deal scanner results"
```

---

## Task 6: BGS Crossover Model (TDD)

**Files:**
- Create: `lib/grade/crossover.ts`
- Create: `lib/grade/__tests__/crossover.test.ts`

The crossover probability model encodes known community data:
- All 4 sub-grades ≥ 9.5 (quad 9.5): ~50% crossover probability
- Any 9.5/9.5/9.5/9.0 pattern (three 9.5, one exactly 9.0): ~10–15% probability
- Any sub-grade < 9.0: near-zero crossover probability to PSA 10 (~2%)
- Single 9.0 + rest 9.5: ~12%

EV calculations:
- `evKeepBgs` = current BGS market value (passed in as param — caller fetches it)
- `evCrossover` = (crossoverProb × psa10Value) + ((1 - crossoverProb) × psa9Value) − crossoverFee
- `evCrackRaw` = weighted EV using same grade distribution from crossover model × market values by grade − regularFee − riskDiscount (10% of rawValue as crack-damage risk)

Crossover service fee defaults to $150 (Express tier at PSA, standard for crossover requests).

- [ ] **Step 1: Write the failing tests**

```typescript
// lib/grade/__tests__/crossover.test.ts
import { describe, it, expect } from 'vitest'
import { computeCrossoverProbability, computeCrossoverEv } from '../crossover'

describe('computeCrossoverProbability', () => {
  it('returns ~0.50 for quad 9.5', () => {
    const p = computeCrossoverProbability(9.5, 9.5, 9.5, 9.5)
    expect(p).toBeGreaterThanOrEqual(0.45)
    expect(p).toBeLessThanOrEqual(0.55)
  })

  it('returns ~0.12 for three 9.5 + one 9.0', () => {
    const p = computeCrossoverProbability(9.5, 9.5, 9.5, 9.0)
    expect(p).toBeGreaterThanOrEqual(0.08)
    expect(p).toBeLessThanOrEqual(0.18)
  })

  it('returns <0.05 when any sub-grade is below 9.0', () => {
    expect(computeCrossoverProbability(9.5, 9.5, 9.5, 8.5)).toBeLessThan(0.05)
    expect(computeCrossoverProbability(8.0, 9.5, 9.5, 9.5)).toBeLessThan(0.05)
  })

  it('probabilities are clamped to [0, 1]', () => {
    const p = computeCrossoverProbability(10, 10, 10, 10)
    expect(p).toBeGreaterThanOrEqual(0)
    expect(p).toBeLessThanOrEqual(1)
  })
})

describe('computeCrossoverEv', () => {
  it('computes three-way EV correctly', () => {
    const result = computeCrossoverEv({
      centeringSub: 9.5,
      cornersSub:   9.5,
      edgesSub:     9.5,
      surfaceSub:   9.5,
      crossoverProbability: 0.50,
      bgsSaleValue:    250,
      psa10SaleValue:  400,
      psa9SaleValue:   120,
      rawValue:        200,
    })
    // evCrossover = 0.5*400 + 0.5*120 - 150 = 260 - 150 = 110
    expect(result.evCrossover).toBeCloseTo(110, 0)
    // evKeepBgs = 250
    expect(result.evKeepBgs).toBe(250)
    // evCrackRaw: grade distribution weighted value - 37 fees - 20 risk = some positive number
    expect(typeof result.evCrackRaw).toBe('number')
    expect(['keep', 'crossover', 'crack']).toContain(result.recommendation)
  })

  it('recommends keep when BGS value beats both alternatives', () => {
    const result = computeCrossoverEv({
      centeringSub: 9.0,
      cornersSub:   9.0,
      edgesSub:     9.0,
      surfaceSub:   9.0,
      crossoverProbability: 0.02,
      bgsSaleValue:     300,
      psa10SaleValue:   350,
      psa9SaleValue:    120,
      rawValue:         220,
    })
    expect(result.recommendation).toBe('keep')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run lib/grade/__tests__/crossover.test.ts 2>&1 | tail -10
```

Expected: FAIL with "Cannot find module '../crossover'"

- [ ] **Step 3: Implement the crossover module**

```typescript
// lib/grade/crossover.ts
import type { GradeDistribution } from './types'

const PSA_REGULAR_TOTAL_COST = (
  Number(process.env.PSA_REGULAR_FEE ?? 25) +
  Number(process.env.PSA_SHIPPING_COST ?? 12)
)
const CROSSOVER_FEE = 150   // PSA Express — standard for crossover requests
const CRACK_RISK_PCT = 0.10 // 10% of raw value as cracking-damage risk discount

/**
 * Crossover probability to PSA 10, encoded from collector community data:
 * - quad 9.5 (all subs ≥ 9.5): ~50% probability
 * - one 9.0 sub with rest ≥ 9.5: ~12%
 * - any sub < 9.0: near-zero (~2%)
 *
 * Interpolation: each sub below 9.5 reduces probability multiplicatively.
 */
export function computeCrossoverProbability(
  centeringSub: number,
  cornersSub: number,
  edgesSub: number,
  surfaceSub: number
): number {
  const subs = [centeringSub, cornersSub, edgesSub, surfaceSub]
  const minSub = Math.min(...subs)

  if (minSub < 9.0) return 0.02

  // Count subs exactly at 9.0 vs ≥ 9.5
  const ninePointZeros = subs.filter((s) => s >= 9.0 && s < 9.5).length

  if (ninePointZeros === 0) {
    // Quad 9.5 or better
    return Math.min(0.50, 0.50)
  }
  if (ninePointZeros === 1) {
    return 0.12
  }
  if (ninePointZeros === 2) {
    return 0.05
  }
  // 3 or 4 nines
  return 0.02
}

/**
 * Build a grade distribution from the BGS sub-grade pattern.
 * Used for crack-and-resubmit EV calculation.
 */
function subgradesToDistribution(
  centeringSub: number,
  cornersSub: number,
  edgesSub: number,
  surfaceSub: number
): GradeDistribution {
  const minSub = Math.min(centeringSub, cornersSub, edgesSub, surfaceSub)
  const crossoverProb = computeCrossoverProbability(centeringSub, cornersSub, edgesSub, surfaceSub)

  // Rough distribution if cracked and re-evaluated as a raw card
  if (minSub >= 9.5) {
    // Quad 9.5 BGS cards are gem-mint raw; PSA grades generously
    return { 10: crossoverProb, 9: 0.55, 8: 0.30 - crossoverProb * 0.5, 7: 0.15 }
  }
  if (minSub >= 9.0) {
    return { 10: crossoverProb, 9: 0.45, 8: 0.35, 7: 0.20 - crossoverProb * 0.5 }
  }
  return { 10: 0.02, 9: 0.30, 8: 0.40, 7: 0.28 }
}

export interface CrossoverEvInput {
  centeringSub: number
  cornersSub: number
  edgesSub: number
  surfaceSub: number
  crossoverProbability: number
  bgsSaleValue: number
  psa10SaleValue: number
  psa9SaleValue: number
  rawValue: number
}

export interface CrossoverEvResult {
  evKeepBgs: number
  evCrossover: number
  evCrackRaw: number
  recommendation: 'keep' | 'crossover' | 'crack'
}

export function computeCrossoverEv(input: CrossoverEvInput): CrossoverEvResult {
  const {
    centeringSub, cornersSub, edgesSub, surfaceSub,
    crossoverProbability, bgsSaleValue, psa10SaleValue, psa9SaleValue, rawValue,
  } = input

  const evKeepBgs = bgsSaleValue

  const evCrossover =
    crossoverProbability * psa10SaleValue +
    (1 - crossoverProbability) * psa9SaleValue -
    CROSSOVER_FEE

  const dist = subgradesToDistribution(centeringSub, cornersSub, edgesSub, surfaceSub)
  const crackRawGradeEv =
    dist[10] * psa10SaleValue +
    dist[9] * psa9SaleValue +
    dist[8] * (psa9SaleValue * 0.55) +  // rough PSA 8 value estimate as % of PSA 9
    dist[7] * (psa9SaleValue * 0.35)
  const evCrackRaw = crackRawGradeEv - PSA_REGULAR_TOTAL_COST - rawValue * CRACK_RISK_PCT

  const best = Math.max(evKeepBgs, evCrossover, evCrackRaw)
  const recommendation: CrossoverEvResult['recommendation'] =
    best === evCrossover ? 'crossover' :
    best === evCrackRaw  ? 'crack'     : 'keep'

  return {
    evKeepBgs:   Math.round(evKeepBgs   * 100) / 100,
    evCrossover: Math.round(evCrossover * 100) / 100,
    evCrackRaw:  Math.round(evCrackRaw  * 100) / 100,
    recommendation,
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run lib/grade/__tests__/crossover.test.ts 2>&1 | tail -15
```

Expected: 6 tests passing.

- [ ] **Step 5: Commit**

```bash
git add lib/grade/crossover.ts lib/grade/__tests__/crossover.test.ts
git commit -m "feat: BGS crossover probability model + 3-way EV calculation (TDD)"
```

---

## Task 7: BGS Crossover API Route

**Files:**
- Create: `app/api/grade/crossover/route.ts`

The route accepts manual sub-grade entry (photo input is future work — the UI will collect sub-grades either way). It calls `computeCrossoverProbability` and `computeCrossoverEv`, stores to `bgs_crossover_analyses`, and returns the result.

Market values for the card are fetched from `fetchGradedComps`. BGS sale value is estimated as PSA 9 comp × 0.9 (BGS 9.5 trades at a slight premium to PSA 9 but below PSA 10; without BGS-specific comp data, this is the best approximation).

- [ ] **Step 1: Create the route**

```typescript
// app/api/grade/crossover/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { getUserFromRequest } from '@/lib/auth'
import { computeCrossoverProbability, computeCrossoverEv } from '@/lib/grade/crossover'
import { fetchGradedComps } from '@/lib/grade/graded-comps'
import { identifyCardFromTitle } from '@/lib/grade/card-identify'

export async function POST(req: NextRequest) {
  const userId = await getUserFromRequest(req)
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as {
    cardTitle?: string
    centeringSub?: number
    cornersSub?: number
    edgesSub?: number
    surfaceSub?: number
    bgsSaleValue?: number
  }

  const { cardTitle, centeringSub, cornersSub, edgesSub, surfaceSub, bgsSaleValue } = body

  if (
    typeof centeringSub !== 'number' || typeof cornersSub !== 'number' ||
    typeof edgesSub !== 'number'     || typeof surfaceSub !== 'number'
  ) {
    return NextResponse.json({ error: 'All four sub-grades are required' }, { status: 400 })
  }

  const subs = [centeringSub, cornersSub, edgesSub, surfaceSub]
  if (subs.some((s) => s < 1 || s > 10)) {
    return NextResponse.json({ error: 'Sub-grades must be between 1 and 10' }, { status: 400 })
  }

  const crossoverProbability = computeCrossoverProbability(centeringSub, cornersSub, edgesSub, surfaceSub)

  // Identify card and fetch comps
  const identity = cardTitle ? await identifyCardFromTitle(cardTitle) : null
  let comps: Awaited<ReturnType<typeof fetchGradedComps>> = {}

  if (identity) {
    comps = await fetchGradedComps(identity.player, identity.year, identity.set, identity.cardNumber)
  }

  const psa10Value = comps[10] ?? 0
  const psa9Value  = comps[9]  ?? 0
  const rawValue   = bgsSaleValue ?? psa9Value * 0.9  // BGS slab approximation

  const ev = computeCrossoverEv({
    centeringSub,
    cornersSub,
    edgesSub,
    surfaceSub,
    crossoverProbability,
    bgsSaleValue: rawValue,
    psa10SaleValue: psa10Value,
    psa9SaleValue: psa9Value,
    rawValue,
  })

  // Store result
  const supabase = createServerClient()
  const { data: stored } = await supabase
    .from('bgs_crossover_analyses')
    .insert({
      user_id: userId,
      card_key: identity?.cardKey ?? 'unknown',
      input_method: 'manual',
      centering_sub: centeringSub,
      corners_sub: cornersSub,
      edges_sub: edgesSub,
      surface_sub: surfaceSub,
      crossover_probability: crossoverProbability,
      ev_keep_bgs:   ev.evKeepBgs,
      ev_crossover:  ev.evCrossover,
      ev_crack_raw:  ev.evCrackRaw,
      recommendation: ev.recommendation,
    })
    .select('id')
    .single()

  return NextResponse.json({
    id: stored?.id,
    crossoverProbability,
    evKeepBgs:   ev.evKeepBgs,
    evCrossover: ev.evCrossover,
    evCrackRaw:  ev.evCrackRaw,
    recommendation: ev.recommendation,
    comps: { psa10: psa10Value, psa9: psa9Value },
    cardKey: identity?.cardKey,
  })
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep "crossover/route" | head -10
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/api/grade/crossover/route.ts
git commit -m "feat: POST /api/grade/crossover — BGS crossover analysis route"
```

---

## Task 8: CrossoverAnalysis Component

**Files:**
- Create: `components/grade/CrossoverAnalysis.tsx`

The component has two sections: sub-grade input form (4 number inputs, each 7–10 in 0.5 steps) and results panel (crossover probability, 3-way EV table, recommendation). Results appear after the user submits.

- [ ] **Step 1: Create the component**

```typescript
// components/grade/CrossoverAnalysis.tsx
'use client'

import { useState } from 'react'

interface SubGrades {
  centering: number
  corners: number
  edges: number
  surface: number
}

interface CrossoverResult {
  crossoverProbability: number
  evKeepBgs: number
  evCrossover: number
  evCrackRaw: number
  recommendation: 'keep' | 'crossover' | 'crack'
  comps: { psa10: number; psa9: number }
}

const REC_LABEL: Record<CrossoverResult['recommendation'], string> = {
  keep:       '→ Keep the BGS slab',
  crossover:  '→ Submit for PSA crossover',
  crack:      '→ Crack and resubmit raw to PSA',
}

const REC_COLOUR: Record<CrossoverResult['recommendation'], string> = {
  keep:      'bg-slate-800/60 border-slate-700',
  crossover: 'bg-emerald-900/30 border-emerald-700',
  crack:     'bg-amber-900/20 border-amber-700',
}

function fmt(n: number) {
  if (n === 0) return '—'
  const sign = n >= 0 ? '+' : ''
  return `${sign}$${Math.abs(Math.round(n))}`
}

function SubInput({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (v: number) => void
}) {
  return (
    <div className="space-y-1">
      <label className="block text-xs font-medium text-slate-400">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
      >
        {[10, 9.5, 9, 8.5, 8, 7.5, 7].map((v) => (
          <option key={v} value={v}>{v}</option>
        ))}
      </select>
    </div>
  )
}

interface Props {
  initialCardTitle?: string
}

export function CrossoverAnalysis({ initialCardTitle }: Props) {
  const [cardTitle, setCardTitle] = useState(initialCardTitle ?? '')
  const [subs, setSubs] = useState<SubGrades>({ centering: 9.5, corners: 9.5, edges: 9.5, surface: 9.5 })
  const [bgsSaleValue, setBgsSaleValue] = useState('')
  const [result, setResult] = useState<CrossoverResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function setSub(key: keyof SubGrades, value: number) {
    setSubs((prev) => ({ ...prev, [key]: value }))
  }

  async function analyze() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/grade/crossover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cardTitle: cardTitle || undefined,
          centeringSub: subs.centering,
          cornersSub:   subs.corners,
          edgesSub:     subs.edges,
          surfaceSub:   subs.surface,
          bgsSaleValue: bgsSaleValue ? Number(bgsSaleValue) : undefined,
        }),
      })
      const data = (await res.json()) as CrossoverResult & { error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Analysis failed')
      setResult(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analysis failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Input form */}
      <div className="rounded-xl border border-slate-700 p-6 space-y-5">
        <h2 className="font-semibold text-slate-100">BGS Sub-Grades</h2>

        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1">Card (optional — for market comps)</label>
          <input
            type="text"
            value={cardTitle}
            onChange={(e) => setCardTitle(e.target.value)}
            placeholder="e.g. 2018 Panini Prizm Patrick Mahomes #168"
            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <SubInput label="Centering" value={subs.centering} onChange={(v) => setSub('centering', v)} />
          <SubInput label="Corners"   value={subs.corners}   onChange={(v) => setSub('corners',   v)} />
          <SubInput label="Edges"     value={subs.edges}     onChange={(v) => setSub('edges',     v)} />
          <SubInput label="Surface"   value={subs.surface}   onChange={(v) => setSub('surface',   v)} />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1">Current BGS sale value (optional)</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">$</span>
            <input
              type="number"
              value={bgsSaleValue}
              onChange={(e) => setBgsSaleValue(e.target.value)}
              placeholder="e.g. 250"
              className="w-full pl-7 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
        </div>

        <button
          onClick={() => void analyze()}
          disabled={loading}
          className="w-full py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-900 text-white text-sm font-semibold transition-colors"
        >
          {loading ? 'Analyzing…' : 'Analyze Crossover'}
        </button>

        {error && <p className="text-sm text-red-400">{error}</p>}
      </div>

      {/* Results */}
      {result && (
        <div className="space-y-4">
          {/* Crossover probability */}
          <div className="flex items-center justify-between rounded-xl border border-slate-700 p-4">
            <span className="text-sm font-medium text-slate-300">PSA 10 Crossover Probability</span>
            <span className="text-2xl font-bold text-slate-100">
              {Math.round(result.crossoverProbability * 100)}%
            </span>
          </div>

          {/* 3-way EV table */}
          <div className="rounded-xl border border-slate-700 divide-y divide-slate-700">
            {[
              { label: 'Keep BGS slab',           ev: result.evKeepBgs,   key: 'keep'      as const },
              { label: 'PSA crossover (Express)', ev: result.evCrossover, key: 'crossover' as const },
              { label: 'Crack + resubmit raw',    ev: result.evCrackRaw,  key: 'crack'     as const },
            ].map(({ label, ev, key }) => (
              <div
                key={key}
                className={`flex justify-between items-center px-4 py-3 text-sm ${result.recommendation === key ? 'bg-indigo-900/20' : ''}`}
              >
                <span className="text-slate-300">{label}</span>
                <span className={`font-bold tabular-nums ${ev > 0 ? 'text-emerald-400' : ev < 0 ? 'text-red-400' : 'text-slate-400'}`}>
                  {fmt(ev)}
                </span>
              </div>
            ))}
          </div>

          {/* Recommendation */}
          <div className={`rounded-xl border p-4 ${REC_COLOUR[result.recommendation]}`}>
            <p className="font-semibold text-slate-100">{REC_LABEL[result.recommendation]}</p>
            {result.comps.psa10 > 0 && (
              <p className="text-xs text-slate-400 mt-1">
                Market comps: PSA 10 ${result.comps.psa10.toFixed(0)} · PSA 9 ${result.comps.psa9.toFixed(0)}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep "CrossoverAnalysis" | head -10
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/grade/CrossoverAnalysis.tsx
git commit -m "feat: CrossoverAnalysis component — BGS sub-grade inputs + 3-way EV comparison"
```

---

## Task 9: Crossover Page

**Files:**
- Create: `app/(app)/grade/crossover/page.tsx`

Simple page that hosts the CrossoverAnalysis component. Linked from the grade page header area.

- [ ] **Step 1: Create the page**

```typescript
// app/(app)/grade/crossover/page.tsx
import { CrossoverAnalysis } from '@/components/grade/CrossoverAnalysis'

export default function CrossoverPage() {
  return (
    <div className="max-w-2xl mx-auto px-6 py-10 space-y-6">
      <div className="space-y-1">
        <h1 className="text-3xl font-bold">BGS → PSA Crossover</h1>
        <p className="text-slate-500 dark:text-slate-400 text-sm">
          Enter your BGS sub-grades to see crossover probability and the best option: keep the slab, submit for crossover, or crack and resubmit raw.
        </p>
      </div>
      <CrossoverAnalysis />
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add app/\(app\)/grade/crossover/page.tsx
git commit -m "feat: /grade/crossover page — BGS crossover tool"
```

---

## Task 10: Full Test Run and TypeScript Check

- [ ] **Step 1: Run all tests**

```bash
npx vitest run 2>&1
```

Expected: all tests pass (includes 6 new crossover tests + all Phase 1 tests).

- [ ] **Step 2: Full TypeScript check**

```bash
npx tsc --noEmit 2>&1
```

Expected: no errors.

- [ ] **Step 3: Fix any errors**

If TypeScript errors remain, fix minimal targeted issues (wrong type, missing field, import error). Re-run to confirm.

- [ ] **Step 4: Final commit if fixes were made**

```bash
git add -A
git commit -m "fix: resolve Phase 2 TypeScript and test issues"
```

- [ ] **Step 5: Log final state**

```bash
git log --oneline -10
```

---

## Spec Coverage Check

- [x] 2.1 — Lightweight grade screen on listing primary image → `lib/grade/quick-grade.ts` (Task 2)
- [x] 2.1 — `grade_potential_score`, `ev_if_graded`, `grade_upside` computed → `lib/grade/deal-grade-potential.ts` (Task 3)
- [x] 2.1 — Async enrichment via Inngest → `inngest/deal-grade-enricher.ts` (Task 4)
- [x] 2.1 — "Grade Potential" badge in deal results → `GradePotentialBadge.tsx` + `DealCard.tsx` (Task 5)
- [x] 2.1 — "Positive grading EV" filter → `DealSidebar.tsx` + `deal-score.ts` (Task 5)
- [x] 2.2 — BGS sub-grade input (manual entry) → `CrossoverAnalysis.tsx` (Task 8)
- [x] 2.2 — Crossover probability model with community data encoded → `lib/grade/crossover.ts` (Task 6)
- [x] 2.2 — 3-way EV: keep BGS / crossover / crack raw → `computeCrossoverEv` (Task 6)
- [x] 2.2 — Recommendation action → `CrossoverEvResult.recommendation` (Task 6)
- [x] 2.2 — `POST /api/grade/crossover` route → `app/api/grade/crossover/route.ts` (Task 7)
- [x] 2.2 — `bgs_crossover_analyses` table → migration (Task 1)
- [x] 2.1 — Photo input for BGS: deferred (described in spec as "AI reads visible sub-grade labels" — requires richer image parsing; manual entry covers the functional use case and is noted in spec as an input option)
