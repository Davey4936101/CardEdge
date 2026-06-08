# Submission Intelligence Engine — Phase 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the intelligence layer with PSA pop velocity tracking, a batch submission optimizer, and a post-submission accuracy loop.

**Architecture:** Three subsystems. (1) Pop velocity: a daily Inngest cron snapshots PSA populations; `lib/grade/pop-velocity.ts` computes trend signals; a `PopVelocityBadge` fetches and surfaces them on the grade result. (2) Batch optimizer: pure-TS `lib/grade/batch-optimizer.ts` ranks cards by expected ROI; `POST /api/grade/batch` accepts stored analysis IDs; `BatchOptimizer` component lets users select from history and build a ranked 25-card batch. (3) Accuracy loop: `lib/grade/accuracy.ts` computes discrepancy analysis and blind-spot identification; `GET /api/grade/accuracy` returns history; `AccuracyLog` component displays it; `AnalysisHistory` gains an inline outcome-logging button.

**Tech Stack:** Next.js App Router, TypeScript, Supabase, Inngest, Vitest, PSA Public API, Tailwind CSS.

---

## File Map

**New files:**
- `lib/grade/pop-velocity.ts` — pure computation: given `pop_snapshots` rows, returns velocity signals (growth rate, trend, pressure)
- `lib/grade/batch-optimizer.ts` — pure TS: `rankCards()` + `buildBatch()` for expected-ROI ranking
- `lib/grade/accuracy.ts` — pure TS: `analyzeAccuracyEntry()` + `computeAccuracyStats()` for discrepancy analysis
- `lib/grade/__tests__/pop-velocity.test.ts`
- `lib/grade/__tests__/batch-optimizer.test.ts`
- `lib/grade/__tests__/accuracy.test.ts`
- `inngest/pop-velocity-tracker.ts` — daily cron: snapshot all tracked card_keys into `pop_snapshots`
- `app/api/grade/pop-velocity/[cardKey]/route.ts` — GET: computes velocity from snapshots for a given card_key
- `app/api/grade/batch/route.ts` — POST: accepts array of analysis IDs, returns ranked batch
- `app/api/grade/accuracy/route.ts` — GET: returns accuracy entries for authenticated user
- `components/grade/PopVelocityBadge.tsx` — velocity summary badge for submission result page
- `components/grade/BatchOptimizer.tsx` — multi-select from history + ranked batch display
- `components/grade/AccuracyLog.tsx` — predicted vs. actual history with stats
- `app/(app)/grade/batch/page.tsx`
- `app/(app)/grade/accuracy/page.tsx`
- `supabase/migrations/20260608_grade_phase3.sql`

**Modified files:**
- `lib/grade/grade-dist-cache.ts` — save `player`, `year_val`, `set_name`, `card_number` when upserting cache entries
- `app/api/inngest/route.ts` — register `popVelocityTracker`
- `components/grade/SubmissionVerdict.tsx` — show `PopVelocityBadge` below PSA population panel
- `components/grade/AnalysisHistory.tsx` — add inline outcome logging button per row
- `app/api/grade/history/route.ts` — include `actual_psa_grade`, `continuous_score` in select

---

## Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/20260608_grade_phase3.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260608_grade_phase3.sql

-- Add card identity fields to grade_dist_cache so the pop velocity cron
-- can call the PSA API without needing to reverse-engineer the card_key slug.
ALTER TABLE grade_dist_cache
  ADD COLUMN IF NOT EXISTS player      text,
  ADD COLUMN IF NOT EXISTS year_val    integer,
  ADD COLUMN IF NOT EXISTS set_name    text,
  ADD COLUMN IF NOT EXISTS card_number text;

-- Batch submission optimizer
CREATE TABLE IF NOT EXISTS submission_batches (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               uuid NOT NULL,
  batch_name            text,
  card_analysis_ids     uuid[] NOT NULL,
  total_expected_return float,
  total_cost            float,
  batch_roi             float,
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS submission_batches_user_idx
  ON submission_batches (user_id, created_at DESC);
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260608_grade_phase3.sql
git commit -m "feat: Phase 3 DB migration — grade_dist_cache identity cols + submission_batches"
```

---

## Task 2: Pop Velocity Module (TDD)

**Files:**
- Create: `lib/grade/pop-velocity.ts`
- Create: `lib/grade/__tests__/pop-velocity.test.ts`

The module is pure TS with no external dependencies — it takes an array of snapshot rows and returns velocity signals. Easy to test without any mocking.

- [ ] **Step 1: Write failing tests**

```typescript
// lib/grade/__tests__/pop-velocity.test.ts
import { describe, it, expect } from 'vitest'
import { computePopVelocity } from '../pop-velocity'

const makeSnapshot = (date: string, count10: number, total = 100) => ({
  snapshot_date: date,
  count_10: count10,
  count_9: total - count10 - 10,
  count_8: 8,
  count_7: 2,
  total,
})

describe('computePopVelocity', () => {
  it('returns null for empty snapshots', () => {
    expect(computePopVelocity([])).toBeNull()
  })

  it('detects high pop pressure (>15% growth in 30 days)', () => {
    const snapshots = [
      makeSnapshot('2026-06-08', 62),
      makeSnapshot('2026-05-08', 50),   // 30 days ago: +12 → 24% growth
      makeSnapshot('2026-03-08', 40),   // 90 days ago
    ]
    const result = computePopVelocity(snapshots)
    expect(result).not.toBeNull()
    expect(result!.popPressure).toBe('high')
    expect(result!.pop10Growth30d).toBe(12)
    expect(result!.pop10GrowthRate30d).toBeGreaterThan(0.15)
  })

  it('detects moderate pop pressure (5–15% growth)', () => {
    const snapshots = [
      makeSnapshot('2026-06-08', 55),
      makeSnapshot('2026-05-08', 50),   // 10% growth
      makeSnapshot('2026-03-08', 48),
    ]
    const result = computePopVelocity(snapshots)
    expect(result!.popPressure).toBe('moderate')
  })

  it('detects low pop pressure (<5% growth)', () => {
    const snapshots = [
      makeSnapshot('2026-06-08', 51),
      makeSnapshot('2026-05-08', 50),   // 2% growth
      makeSnapshot('2026-03-08', 50),
    ]
    const result = computePopVelocity(snapshots)
    expect(result!.popPressure).toBe('low')
  })

  it('detects rising gem rate trend', () => {
    const snapshots = [
      makeSnapshot('2026-06-08', 40, 100),  // gem rate 40%
      makeSnapshot('2026-05-08', 38, 100),
      makeSnapshot('2026-03-08', 35, 100),  // gem rate 35%
    ]
    const result = computePopVelocity(snapshots)
    expect(result!.gemRateTrend).toBe('rising')
  })

  it('includes a human-readable message', () => {
    const snapshots = [makeSnapshot('2026-06-08', 60, 150)]
    const result = computePopVelocity(snapshots)
    expect(result!.message).toContain('60')
  })
})
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
npx vitest run lib/grade/__tests__/pop-velocity.test.ts 2>&1 | tail -5
```

Expected: `Cannot find module '../pop-velocity'`

- [ ] **Step 3: Implement `lib/grade/pop-velocity.ts`**

```typescript
// lib/grade/pop-velocity.ts

export type PopTrend = 'rising' | 'stable' | 'falling'
export type PopPressure = 'high' | 'moderate' | 'low'

export interface PopSnapshot {
  snapshot_date: string
  count_10: number
  count_9: number
  count_8: number
  count_7: number
  total: number
}

export interface PopVelocityResult {
  currentPop10: number
  pop10Growth30d: number        // absolute new copies in last 30 days
  pop10GrowthRate30d: number    // fraction, e.g. 0.22 for 22%
  gemRateTrend: PopTrend
  popPressure: PopPressure
  snapshotDate: string
  message: string
}

export function computePopVelocity(snapshots: PopSnapshot[]): PopVelocityResult | null {
  if (snapshots.length === 0) return null

  // Expect snapshots sorted date DESC (newest first)
  const latest = snapshots[0]

  const thirtyDaysAgo = new Date(latest.snapshot_date)
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  const snap30 =
    snapshots.find((s) => new Date(s.snapshot_date) <= thirtyDaysAgo) ??
    snapshots[snapshots.length - 1]

  const ninetyDaysAgo = new Date(latest.snapshot_date)
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)
  const snap90 =
    snapshots.find((s) => new Date(s.snapshot_date) <= ninetyDaysAgo) ?? snap30

  const pop10Growth30d = latest.count_10 - snap30.count_10
  const pop10GrowthRate30d =
    snap30.count_10 > 0 ? pop10Growth30d / snap30.count_10 : 0

  const gemRateLatest = latest.total > 0 ? latest.count_10 / latest.total : 0
  const gemRate90 = snap90.total > 0 ? snap90.count_10 / snap90.total : 0
  const gemRateDelta = gemRateLatest - gemRate90

  const gemRateTrend: PopTrend =
    gemRateDelta > 0.02 ? 'rising' :
    gemRateDelta < -0.02 ? 'falling' : 'stable'

  const popPressure: PopPressure =
    pop10GrowthRate30d > 0.15 ? 'high' :
    pop10GrowthRate30d > 0.05 ? 'moderate' : 'low'

  const pct = Math.round(pop10GrowthRate30d * 100)
  const message =
    popPressure === 'high'
      ? `PSA 10 population: ${latest.count_10} copies. +${pop10Growth30d} in 30 days (+${pct}%). Submit soon before additional supply compresses pricing.`
      : popPressure === 'moderate'
      ? `PSA 10 population: ${latest.count_10} copies. +${pop10Growth30d} in 30 days (+${pct}%). Moderate growth — monitor before submitting.`
      : `PSA 10 population: ${latest.count_10} copies. Population stable. No near-term pricing pressure.`

  return {
    currentPop10: latest.count_10,
    pop10Growth30d,
    pop10GrowthRate30d: Math.round(pop10GrowthRate30d * 10000) / 10000,
    gemRateTrend,
    popPressure,
    snapshotDate: latest.snapshot_date,
    message,
  }
}
```

- [ ] **Step 4: Run tests — verify all pass**

```bash
npx vitest run lib/grade/__tests__/pop-velocity.test.ts 2>&1 | tail -10
```

Expected: 6 tests passing.

- [ ] **Step 5: Commit**

```bash
git add lib/grade/pop-velocity.ts lib/grade/__tests__/pop-velocity.test.ts
git commit -m "feat: pop-velocity — snapshot-based PSA 10 growth rate and pressure signals (TDD)"
```

---

## Task 3: Inngest Pop Velocity Cron + grade-dist-cache identity fields

**Files:**
- Create: `inngest/pop-velocity-tracker.ts`
- Modify: `lib/grade/grade-dist-cache.ts`
- Modify: `app/api/inngest/route.ts`

The cron runs daily at 2am UTC. It queries `grade_dist_cache` for entries that have `player` set (i.e. were added after this migration), calls `getPopData` for each, and upserts into `pop_snapshots`.

`grade-dist-cache.ts` must be updated to store identity fields when it upserts, so future pipeline runs populate the cache correctly.

- [ ] **Step 1: Update `lib/grade/grade-dist-cache.ts` — save identity fields on upsert**

Read the file first. Find both `supabase.from('grade_dist_cache').upsert(...)` calls (one in the PSA branch, one in the eBay fallback branch). In the PSA branch upsert, add `player`, `year_val`, `set_name`, `card_number` to the upsert data. Do the same in the eBay fallback branch.

PSA branch — replace the existing upsert object:
```typescript
    await supabase.from('grade_dist_cache').upsert({
      card_key: cardKey,
      player,
      year_val: year,
      set_name: set,
      card_number: cardNumber,
      grades: { 10: popData.count10, 9: popData.count9, 8: popData.count8, 7: popData.count7 },
      total: popData.total,
      last_fetched: new Date().toISOString(),
    })
```

eBay fallback branch — replace the existing upsert object:
```typescript
      await supabase.from('grade_dist_cache').upsert({
        card_key: cardKey,
        player,
        year_val: year,
        set_name: set,
        card_number: cardNumber,
        grades,
        total,
        last_fetched: new Date().toISOString(),
      })
```

- [ ] **Step 2: Create `inngest/pop-velocity-tracker.ts`**

```typescript
// inngest/pop-velocity-tracker.ts
import { inngest } from './client'
import { createServerClient } from '@/lib/supabase/server'
import { getPopData } from '@/lib/psa/api-client'

interface CacheEntry {
  card_key: string
  player: string
  year_val: number
  set_name: string
  card_number: string
}

export const popVelocityTracker = inngest.createFunction(
  { id: 'pop-velocity-tracker', triggers: [{ cron: '0 2 * * *' }] },
  async ({ step }) => {
    const supabase = createServerClient()

    const cards = await step.run('fetch-tracked-cards', async () => {
      const { data, error } = await supabase
        .from('grade_dist_cache')
        .select('card_key, player, year_val, set_name, card_number')
        .not('player', 'is', null)
        .not('year_val', 'is', null)
      if (error) throw new Error(error.message)
      return (data ?? []) as CacheEntry[]
    })

    const today = new Date().toISOString().slice(0, 10)  // YYYY-MM-DD
    let snapshotted = 0

    for (const card of cards) {
      await step.run(`snapshot-${card.card_key}`, async () => {
        const pop = await getPopData(card.player, card.year_val, card.set_name, card.card_number)
        if (!pop) return

        await supabase.from('pop_snapshots').upsert(
          {
            card_key: card.card_key,
            snapshot_date: today,
            count_10: pop.count10,
            count_9: pop.count9,
            count_8: pop.count8,
            count_7: pop.count7,
            total: pop.total,
          },
          { onConflict: 'card_key,snapshot_date' }
        )
        snapshotted++
      })
    }

    return { snapshotted, date: today }
  }
)
```

- [ ] **Step 3: Register in `app/api/inngest/route.ts`**

Read the file, then add:
```typescript
import { popVelocityTracker } from '@/inngest/pop-velocity-tracker'
```
And add `popVelocityTracker` to the `functions` array.

- [ ] **Step 4: TypeScript check**

```bash
npx tsc --noEmit 2>&1 | grep -E "pop-velocity-tracker|grade-dist-cache" | head -10
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add inngest/pop-velocity-tracker.ts lib/grade/grade-dist-cache.ts app/api/inngest/route.ts
git commit -m "feat: pop-velocity-tracker cron — daily PSA pop snapshots + save identity in dist cache"
```

---

## Task 4: Pop Velocity API Route + Badge + SubmissionVerdict Integration

**Files:**
- Create: `app/api/grade/pop-velocity/[cardKey]/route.ts`
- Create: `components/grade/PopVelocityBadge.tsx`
- Modify: `components/grade/SubmissionVerdict.tsx`

- [ ] **Step 1: Create the API route**

```bash
mkdir -p "/Users/daviddaniel/Documents/GitHub/CardEdge/app/api/grade/pop-velocity/[cardKey]"
```

```typescript
// app/api/grade/pop-velocity/[cardKey]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { computePopVelocity } from '@/lib/grade/pop-velocity'
import type { PopSnapshot } from '@/lib/grade/pop-velocity'

export async function GET(
  _req: NextRequest,
  { params }: { params: { cardKey: string } }
) {
  const supabase = createServerClient()

  const { data, error } = await supabase
    .from('pop_snapshots')
    .select('snapshot_date, count_10, count_9, count_8, count_7, total')
    .eq('card_key', params.cardKey)
    .order('snapshot_date', { ascending: false })
    .limit(90)

  if (error) return NextResponse.json({ error: 'Query failed' }, { status: 500 })
  if (!data || data.length === 0) return NextResponse.json(null)

  const velocity = computePopVelocity(data as PopSnapshot[])
  return NextResponse.json(velocity)
}
```

- [ ] **Step 2: Create `components/grade/PopVelocityBadge.tsx`**

```typescript
// components/grade/PopVelocityBadge.tsx
'use client'

import { useEffect, useState } from 'react'
import type { PopVelocityResult, PopPressure } from '@/lib/grade/pop-velocity'

const PRESSURE_COLOUR: Record<PopPressure, string> = {
  high:     'border-red-500/40 bg-red-900/20 text-red-300',
  moderate: 'border-amber-500/40 bg-amber-900/20 text-amber-300',
  low:      'border-slate-700 bg-slate-800/40 text-slate-400',
}

const TREND_ICON: Record<string, string> = {
  rising:  '↑',
  stable:  '→',
  falling: '↓',
}

interface Props {
  cardKey: string
}

export function PopVelocityBadge({ cardKey }: Props) {
  const [data, setData] = useState<PopVelocityResult | null | 'loading'>('loading')

  useEffect(() => {
    fetch(`/api/grade/pop-velocity/${encodeURIComponent(cardKey)}`)
      .then((r) => r.json())
      .then((d) => setData(d as PopVelocityResult | null))
      .catch(() => setData(null))
  }, [cardKey])

  if (data === 'loading') {
    return <div className="h-10 rounded-lg bg-slate-800/40 animate-pulse border border-slate-700/40" />
  }
  if (!data) return null

  const cls = PRESSURE_COLOUR[data.popPressure]
  const trendIcon = TREND_ICON[data.gemRateTrend] ?? '→'

  return (
    <div className={`rounded-lg border px-4 py-3 space-y-1 text-sm ${cls}`}>
      <div className="flex items-center justify-between">
        <span className="font-medium">Pop Velocity</span>
        <span className="text-xs font-mono tabular-nums">
          PSA 10: {data.currentPop10} · {trendIcon} gem rate
        </span>
      </div>
      <p className="text-xs opacity-80">{data.message}</p>
    </div>
  )
}
```

- [ ] **Step 3: Update `components/grade/SubmissionVerdict.tsx`**

Read the file first. Add `PopVelocityBadge` import and render it inside the PSA population block, after the gem-rate `<p>` tag. The `result.card_key` is available from the `result` prop.

Add this import:
```typescript
import { PopVelocityBadge } from './PopVelocityBadge'
```

Inside the PSA Population section (the block guarded by `result.pop_total !== undefined && result.pop_total > 0`), add `PopVelocityBadge` after the gem rate paragraph:
```typescript
          <PopVelocityBadge cardKey={result.card_key} />
```

- [ ] **Step 4: TypeScript check**

```bash
npx tsc --noEmit 2>&1 | grep -E "PopVelocity|pop-velocity" | head -10
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add "app/api/grade/pop-velocity/[cardKey]/route.ts" components/grade/PopVelocityBadge.tsx components/grade/SubmissionVerdict.tsx
git commit -m "feat: pop velocity API route + badge surfaced on submission verdict"
```

---

## Task 5: Batch Optimizer Module (TDD)

**Files:**
- Create: `lib/grade/batch-optimizer.ts`
- Create: `lib/grade/__tests__/batch-optimizer.test.ts`

Pure TS — no external dependencies. `rankCards` computes per-card expected profit and ROI. `buildBatch` returns the top-N positive-profit cards with aggregate totals.

- [ ] **Step 1: Write failing tests**

```typescript
// lib/grade/__tests__/batch-optimizer.test.ts
import { describe, it, expect } from 'vitest'
import { rankCards, buildBatch } from '../batch-optimizer'
import type { BatchCard } from '../batch-optimizer'

const makeCard = (id: string, rawPrice: number, p10: number, comp10: number, comp9: number): BatchCard => ({
  id,
  cardKey: `card-${id}`,
  rawPrice,
  distribution: { 10: p10, 9: 1 - p10 - 0.15, 8: 0.10, 7: 0.05 },
  comps: { 10: comp10, 9: comp9 },
})

describe('rankCards', () => {
  it('sorts by expected profit descending', () => {
    const cards = [
      makeCard('a', 50, 0.4, 300, 120),   // high profit
      makeCard('b', 50, 0.05, 100, 60),   // low profit
    ]
    const ranked = rankCards(cards)
    expect(ranked[0].id).toBe('a')
    expect(ranked[1].id).toBe('b')
  })

  it('marks cards below break-even', () => {
    const cards = [makeCard('cheap', 5, 0.02, 40, 20)]  // EV < cost
    const ranked = rankCards(cards)
    expect(ranked[0].aboveBreakEven).toBe(false)
  })

  it('marks cards above break-even', () => {
    const cards = [makeCard('good', 30, 0.50, 400, 150)]
    const ranked = rankCards(cards)
    expect(ranked[0].aboveBreakEven).toBe(true)
    expect(ranked[0].expectedProfit).toBeGreaterThan(0)
  })
})

describe('buildBatch', () => {
  it('includes only above-break-even cards in recommendation', () => {
    const cards = [
      makeCard('good',  30, 0.50, 400, 150),
      makeCard('bad',    5, 0.01,  30,  15),
    ]
    const result = buildBatch(cards)
    expect(result.recommended.every((c) => c.aboveBreakEven)).toBe(true)
    expect(result.recommended.some((c) => c.id === 'bad')).toBe(false)
  })

  it('limits recommendation to batchSize', () => {
    const cards = Array.from({ length: 30 }, (_, i) =>
      makeCard(`c${i}`, 20, 0.40, 200, 80)
    )
    const result = buildBatch(cards, 10)
    expect(result.recommended.length).toBeLessThanOrEqual(10)
  })

  it('computes aggregate totals', () => {
    const cards = [makeCard('x', 50, 0.50, 400, 150)]
    const result = buildBatch(cards)
    expect(result.totalCost).toBeGreaterThan(0)
    expect(result.totalExpectedReturn).toBeGreaterThan(0)
    expect(typeof result.batchRoi).toBe('number')
  })
})
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
npx vitest run lib/grade/__tests__/batch-optimizer.test.ts 2>&1 | tail -5
```

Expected: `Cannot find module '../batch-optimizer'`

- [ ] **Step 3: Implement `lib/grade/batch-optimizer.ts`**

```typescript
// lib/grade/batch-optimizer.ts
import type { GradeDistribution, GradedComps } from './types'

const PSA_REGULAR_FEE_TOTAL = (
  Number(process.env.PSA_REGULAR_FEE ?? 25) +
  Number(process.env.PSA_SHIPPING_COST ?? 12)
)
const DEFAULT_BATCH_SIZE = 25

export interface BatchCard {
  id: string
  cardKey: string
  rawPrice: number
  distribution: GradeDistribution
  comps: GradedComps
  continuousScore?: number
}

export interface RankedCard extends BatchCard {
  evGraded: number
  expectedProfit: number
  roi: number
  aboveBreakEven: boolean
}

export interface BatchResult {
  ranked: RankedCard[]
  recommended: RankedCard[]
  totalExpectedReturn: number
  totalCost: number
  batchRoi: number
}

function computeEv(distribution: GradeDistribution, comps: GradedComps): number {
  const grades = [10, 9, 8, 7] as const
  let ev = 0
  let covered = 0
  for (const g of grades) {
    const comp = comps[g]
    if (comp !== undefined) {
      ev += distribution[g] * comp
      covered += distribution[g]
    }
  }
  return covered > 0 ? ev / covered : 0
}

export function rankCards(cards: BatchCard[]): RankedCard[] {
  return cards
    .map((c) => {
      const evGraded = computeEv(c.distribution, c.comps)
      const expectedProfit = evGraded - c.rawPrice - PSA_REGULAR_FEE_TOTAL
      const roi =
        c.rawPrice + PSA_REGULAR_FEE_TOTAL > 0
          ? expectedProfit / (c.rawPrice + PSA_REGULAR_FEE_TOTAL)
          : 0
      return {
        ...c,
        evGraded:       Math.round(evGraded        * 100) / 100,
        expectedProfit: Math.round(expectedProfit  * 100) / 100,
        roi:            Math.round(roi             * 10000) / 10000,
        aboveBreakEven: expectedProfit > 0,
      }
    })
    .sort((a, b) => b.expectedProfit - a.expectedProfit)
}

export function buildBatch(cards: BatchCard[], batchSize = DEFAULT_BATCH_SIZE): BatchResult {
  const ranked = rankCards(cards)
  const recommended = ranked.filter((c) => c.aboveBreakEven).slice(0, batchSize)

  const totalExpectedReturn = recommended.reduce((s, c) => s + c.evGraded, 0)
  const totalCost = recommended.reduce((s, c) => s + c.rawPrice + PSA_REGULAR_FEE_TOTAL, 0)
  const batchRoi = totalCost > 0 ? (totalExpectedReturn - totalCost) / totalCost : 0

  return {
    ranked,
    recommended,
    totalExpectedReturn: Math.round(totalExpectedReturn * 100) / 100,
    totalCost:           Math.round(totalCost           * 100) / 100,
    batchRoi:            Math.round(batchRoi            * 10000) / 10000,
  }
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
npx vitest run lib/grade/__tests__/batch-optimizer.test.ts 2>&1 | tail -10
```

Expected: 6 tests passing.

- [ ] **Step 5: Commit**

```bash
git add lib/grade/batch-optimizer.ts lib/grade/__tests__/batch-optimizer.test.ts
git commit -m "feat: batch-optimizer — expected-ROI ranking and 25-card batch selection (TDD)"
```

---

## Task 6: POST /api/grade/batch Route

**Files:**
- Create: `app/api/grade/batch/route.ts`

Accepts an array of analysis IDs (from existing completed analyses). Fetches `grade_distribution`, `graded_comps`, `raw_price`, `card_key`, `continuous_score` from `grade_analyses`. Runs `buildBatch`. Stores result to `submission_batches`. Returns full `BatchResult`.

- [ ] **Step 1: Create the route**

```bash
mkdir -p "/Users/daviddaniel/Documents/GitHub/CardEdge/app/api/grade/batch"
```

```typescript
// app/api/grade/batch/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { getUserFromRequest } from '@/lib/auth'
import { buildBatch } from '@/lib/grade/batch-optimizer'
import type { BatchCard } from '@/lib/grade/batch-optimizer'
import type { GradeDistribution, GradedComps } from '@/lib/grade/types'

export async function POST(req: NextRequest) {
  const userId = await getUserFromRequest(req)
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as { analysisIds?: unknown; batchSize?: unknown; batchName?: unknown }
  const { analysisIds, batchSize, batchName } = body

  if (!Array.isArray(analysisIds) || analysisIds.length === 0) {
    return NextResponse.json({ error: 'analysisIds must be a non-empty array' }, { status: 400 })
  }

  const supabase = createServerClient()

  const { data, error } = await supabase
    .from('grade_analyses')
    .select('id, card_key, raw_price, grade_distribution, graded_comps, continuous_score')
    .in('id', analysisIds as string[])
    .eq('user_id', userId)
    .eq('status', 'complete')

  if (error) return NextResponse.json({ error: 'Fetch failed' }, { status: 500 })
  if (!data || data.length === 0) {
    return NextResponse.json({ error: 'No valid analyses found' }, { status: 404 })
  }

  const cards: BatchCard[] = data.map((row) => ({
    id:             row.id as string,
    cardKey:        row.card_key as string,
    rawPrice:       Number(row.raw_price ?? 0),
    distribution:   row.grade_distribution as GradeDistribution,
    comps:          row.graded_comps as GradedComps,
    continuousScore: row.continuous_score as number | undefined,
  }))

  const batchSizeNum = typeof batchSize === 'number' ? batchSize : 25
  const result = buildBatch(cards, batchSizeNum)

  // Persist batch
  await supabase.from('submission_batches').insert({
    user_id:               userId,
    batch_name:            typeof batchName === 'string' ? batchName : null,
    card_analysis_ids:     result.recommended.map((c) => c.id),
    total_expected_return: result.totalExpectedReturn,
    total_cost:            result.totalCost,
    batch_roi:             result.batchRoi,
  })

  return NextResponse.json(result)
}
```

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit 2>&1 | grep "batch/route" | head -10
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/api/grade/batch/route.ts
git commit -m "feat: POST /api/grade/batch — batch optimizer route"
```

---

## Task 7: BatchOptimizer Component + Page

**Files:**
- Create: `components/grade/BatchOptimizer.tsx`
- Create: `app/(app)/grade/batch/page.tsx`

The component loads completed analyses from `GET /api/grade/history` (which returns card_key, ep_regular, etc.), lets the user multi-select, then calls `POST /api/grade/batch` and renders the ranked result.

- [ ] **Step 1: Update `app/api/grade/history/route.ts` to include fields needed for batch**

Read the file, then change the `.select(...)` string to include `continuous_score`:

```typescript
    .select('id, card_key, mode, status, recommendation, reliability_score, raw_price, ep_regular, continuous_score, actual_psa_grade, created_at')
```

- [ ] **Step 2: Create `components/grade/BatchOptimizer.tsx`**

```typescript
// components/grade/BatchOptimizer.tsx
'use client'

import { useEffect, useState } from 'react'
import type { BatchResult } from '@/lib/grade/batch-optimizer'

interface HistoryRow {
  id: string
  card_key: string
  raw_price: number | null
  ep_regular: number | null
  created_at: string
}

function fmt(n: number) {
  const sign = n >= 0 ? '+' : ''
  return `${sign}$${Math.abs(Math.round(n))}`
}

export function BatchOptimizer() {
  const [history, setHistory]     = useState<HistoryRow[]>([])
  const [selected, setSelected]   = useState<Set<string>>(new Set())
  const [result, setResult]       = useState<BatchResult | null>(null)
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState<string | null>(null)
  const [histLoading, setHistLoading] = useState(true)

  useEffect(() => {
    fetch('/api/grade/history')
      .then((r) => r.json())
      .then((d) => { setHistory(d as HistoryRow[]); setHistLoading(false) })
      .catch(() => setHistLoading(false))
  }, [])

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  async function optimize() {
    if (selected.size === 0) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/grade/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ analysisIds: Array.from(selected) }),
      })
      const data = (await res.json()) as BatchResult & { error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Optimization failed')
      setResult(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Optimization failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Card selection */}
      <div className="rounded-xl border border-slate-700 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-slate-100">Select Cards to Batch</h2>
          <span className="text-xs text-slate-500">{selected.size} selected</span>
        </div>

        {histLoading ? (
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-12 rounded-lg bg-slate-800/40 animate-pulse border border-slate-800" />
            ))}
          </div>
        ) : history.length === 0 ? (
          <p className="text-sm text-slate-500">No completed analyses yet. Run a grade analysis first.</p>
        ) : (
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {history.map((row) => (
              <label
                key={row.id}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg border cursor-pointer transition-colors ${
                  selected.has(row.id)
                    ? 'border-indigo-500/60 bg-indigo-900/20'
                    : 'border-slate-700 hover:border-slate-600'
                }`}
              >
                <input
                  type="checkbox"
                  checked={selected.has(row.id)}
                  onChange={() => toggle(row.id)}
                  className="accent-indigo-500"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-200 truncate capitalize">
                    {row.card_key.replace(/-/g, ' ')}
                  </p>
                  <p className="text-xs text-slate-500">
                    ${row.raw_price?.toFixed(0) ?? '—'} raw · {new Date(row.created_at).toLocaleDateString()}
                  </p>
                </div>
                {row.ep_regular !== null && (
                  <span className={`text-xs font-mono ${(row.ep_regular ?? 0) > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {fmt(row.ep_regular)}
                  </span>
                )}
              </label>
            ))}
          </div>
        )}

        <button
          onClick={() => void optimize()}
          disabled={loading || selected.size === 0}
          className="w-full py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-900 text-white text-sm font-semibold transition-colors"
        >
          {loading ? 'Optimizing…' : `Build Batch (${selected.size} cards)`}
        </button>
        {error && <p className="text-sm text-red-400">{error}</p>}
      </div>

      {/* Result */}
      {result && (
        <div className="space-y-4">
          {/* Summary */}
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: 'Recommended',   value: `${result.recommended.length} cards` },
              { label: 'Expected Return', value: `$${Math.round(result.totalExpectedReturn)}` },
              { label: 'Batch ROI',     value: `${Math.round(result.batchRoi * 100)}%` },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-xl border border-slate-700 p-4 text-center">
                <p className="text-xs text-slate-500 mb-1">{label}</p>
                <p className="text-xl font-bold text-slate-100">{value}</p>
              </div>
            ))}
          </div>

          {/* Ranked list */}
          <div className="rounded-xl border border-slate-700 divide-y divide-slate-700">
            <div className="px-4 py-2 text-xs font-semibold text-slate-500 uppercase flex justify-between">
              <span>Card</span>
              <span>Expected Profit</span>
            </div>
            {result.ranked.map((card, i) => (
              <div
                key={card.id}
                className={`flex items-center justify-between px-4 py-3 text-sm ${
                  result.recommended.some((r) => r.id === card.id) ? '' : 'opacity-40'
                }`}
              >
                <div>
                  <span className="text-slate-400 font-mono mr-2">{i + 1}.</span>
                  <span className="text-slate-200 capitalize">{card.cardKey.replace(/-/g, ' ')}</span>
                  {!card.aboveBreakEven && (
                    <span className="ml-2 text-[10px] text-red-400 border border-red-500/30 px-1 py-0.5 rounded">
                      below break-even
                    </span>
                  )}
                </div>
                <span className={`font-mono font-bold tabular-nums ${card.aboveBreakEven ? 'text-emerald-400' : 'text-red-400'}`}>
                  {fmt(card.expectedProfit)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Create `app/(app)/grade/batch/page.tsx`**

```bash
mkdir -p "/Users/daviddaniel/Documents/GitHub/CardEdge/app/(app)/grade/batch"
```

```typescript
// app/(app)/grade/batch/page.tsx
import { BatchOptimizer } from '@/components/grade/BatchOptimizer'

export default function BatchPage() {
  return (
    <div className="max-w-3xl mx-auto px-6 py-10 space-y-6">
      <div className="space-y-1">
        <h1 className="text-3xl font-bold">Batch Optimizer</h1>
        <p className="text-slate-500 dark:text-slate-400 text-sm">
          Select cards from your analysis history to rank by expected ROI and build the optimal PSA submission batch.
        </p>
      </div>
      <BatchOptimizer />
    </div>
  )
}
```

- [ ] **Step 4: TypeScript check**

```bash
npx tsc --noEmit 2>&1 | grep -E "BatchOptimizer|batch/page|batch/route" | head -10
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add components/grade/BatchOptimizer.tsx "app/(app)/grade/batch/page.tsx" app/api/grade/history/route.ts
git commit -m "feat: BatchOptimizer component + /grade/batch page + history route enhancements"
```

---

## Task 8: Accuracy Module (TDD)

**Files:**
- Create: `lib/grade/accuracy.ts`
- Create: `lib/grade/__tests__/accuracy.test.ts`

Pure TS. `analyzeAccuracyEntry` takes a single prediction/actual pair and produces a structured entry with discrepancy, blind spot, and plain-English summary. `computeAccuracyStats` aggregates entries into overall stats.

- [ ] **Step 1: Write failing tests**

```typescript
// lib/grade/__tests__/accuracy.test.ts
import { describe, it, expect } from 'vitest'
import { analyzeAccuracyEntry, computeAccuracyStats } from '../accuracy'

describe('analyzeAccuracyEntry', () => {
  it('marks within-half-grade correctly', () => {
    const e = analyzeAccuracyEntry('id1', 'card-a', 9.3, 9, { corners: 9.0, edges: 9.5, surface: 9.5 })
    expect(e.isWithinHalfGrade).toBe(true)
    expect(e.isWithinOneGrade).toBe(true)
    expect(e.discrepancy).toBeCloseTo(-0.3, 1)
  })

  it('identifies dominant blind spot when overestimated', () => {
    // Predicted 9.5 but got PSA 8 → overestimated by 1.5; lowest sub is corners at 7.0
    const e = analyzeAccuracyEntry('id2', 'card-b', 9.5, 8, {
      centering: 9.5,
      corners:   7.0,
      edges:     9.0,
      surface:   9.0,
    })
    expect(e.dominantBlindSpot).toBe('corners')
    expect(e.isWithinOneGrade).toBe(false)
  })

  it('returns null blind spot when actual >= predicted', () => {
    const e = analyzeAccuracyEntry('id3', 'card-c', 8.5, 10, {})
    expect(e.dominantBlindSpot).toBeNull()
  })

  it('generates a summary string', () => {
    const e = analyzeAccuracyEntry('id4', 'card-d', 9.2, 9, {})
    expect(typeof e.summary).toBe('string')
    expect(e.summary.length).toBeGreaterThan(0)
  })
})

describe('computeAccuracyStats', () => {
  it('returns zero stats for empty array', () => {
    const stats = computeAccuracyStats([])
    expect(stats.totalPredictions).toBe(0)
    expect(stats.withinHalfGradePct).toBe(0)
  })

  it('computes correct pct and mean discrepancy', () => {
    const entries = [
      analyzeAccuracyEntry('a', 'k', 9.0, 9, {}),   // exact
      analyzeAccuracyEntry('b', 'k', 9.5, 9, {}),   // -0.5
      analyzeAccuracyEntry('c', 'k', 9.0, 8, {}),   // -1.0
    ]
    const stats = computeAccuracyStats(entries)
    expect(stats.totalPredictions).toBe(3)
    expect(stats.withinHalfGrade).toBe(2)   // a and b
    expect(stats.withinOneGrade).toBe(3)    // all within 1
  })

  it('tallies blind spots', () => {
    const entries = [
      analyzeAccuracyEntry('a', 'k', 9.5, 8, { corners: 7.0, edges: 9.0 }),
      analyzeAccuracyEntry('b', 'k', 9.5, 8, { corners: 7.0, edges: 9.5 }),
    ]
    const stats = computeAccuracyStats(entries)
    expect(stats.blindSpots.corners).toBe(2)
  })
})
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
npx vitest run lib/grade/__tests__/accuracy.test.ts 2>&1 | tail -5
```

Expected: `Cannot find module '../accuracy'`

- [ ] **Step 3: Implement `lib/grade/accuracy.ts`**

```typescript
// lib/grade/accuracy.ts

export interface AccuracySubgrades {
  centering?: number
  corners?: number
  edges?: number
  surface?: number
}

export interface AccuracyEntry {
  analysisId: string
  cardKey: string
  predictedScore: number
  actualGrade: number
  discrepancy: number           // actual - predicted
  isWithinHalfGrade: boolean
  isWithinOneGrade: boolean
  subgrades: AccuracySubgrades
  dominantBlindSpot: 'centering' | 'corners' | 'edges' | 'surface' | null
  summary: string
}

export interface AccuracyStats {
  totalPredictions: number
  withinHalfGrade: number
  withinOneGrade: number
  withinHalfGradePct: number
  withinOneGradePct: number
  meanDiscrepancy: number
  blindSpots: Record<'centering' | 'corners' | 'edges' | 'surface', number>
}

const ATTRS = ['centering', 'corners', 'edges', 'surface'] as const

function findDominantBlindSpot(
  predictedScore: number,
  actualGrade: number,
  subgrades: AccuracySubgrades
): AccuracyEntry['dominantBlindSpot'] {
  if (predictedScore <= actualGrade) return null
  let lowest: typeof ATTRS[number] | null = null
  let lowestVal = Infinity
  for (const attr of ATTRS) {
    const v = subgrades[attr]
    if (v !== undefined && v < lowestVal) {
      lowestVal = v
      lowest = attr
    }
  }
  return lowest
}

export function analyzeAccuracyEntry(
  analysisId: string,
  cardKey: string,
  predictedScore: number,
  actualGrade: number,
  subgrades: AccuracySubgrades
): AccuracyEntry {
  const discrepancy = actualGrade - predictedScore
  const absDiff = Math.abs(discrepancy)
  const dominantBlindSpot = findDominantBlindSpot(predictedScore, actualGrade, subgrades)
  const direction = discrepancy >= 0 ? 'above' : 'below'

  const summary =
    absDiff <= 0.5
      ? `Predicted ${predictedScore.toFixed(1)}, received PSA ${actualGrade}. Excellent accuracy.`
      : dominantBlindSpot
      ? `Predicted ${predictedScore.toFixed(1)}, received PSA ${actualGrade}. ${(Math.round(absDiff * 10) / 10).toFixed(1)} grade ${direction} prediction. ${dominantBlindSpot.charAt(0).toUpperCase() + dominantBlindSpot.slice(1)} sub-grade was lowest (${subgrades[dominantBlindSpot]?.toFixed(1)}) — consider more careful ${dominantBlindSpot} evaluation next time.`
      : `Predicted ${predictedScore.toFixed(1)}, received PSA ${actualGrade}. ${(Math.round(absDiff * 10) / 10).toFixed(1)} grade ${direction} prediction.`

  return {
    analysisId,
    cardKey,
    predictedScore: Math.round(predictedScore * 10) / 10,
    actualGrade,
    discrepancy: Math.round(discrepancy * 10) / 10,
    isWithinHalfGrade: absDiff <= 0.5,
    isWithinOneGrade:  absDiff <= 1.0,
    subgrades,
    dominantBlindSpot,
    summary,
  }
}

export function computeAccuracyStats(entries: AccuracyEntry[]): AccuracyStats {
  const blindSpots: AccuracyStats['blindSpots'] = { centering: 0, corners: 0, edges: 0, surface: 0 }
  if (entries.length === 0) {
    return { totalPredictions: 0, withinHalfGrade: 0, withinOneGrade: 0, withinHalfGradePct: 0, withinOneGradePct: 0, meanDiscrepancy: 0, blindSpots }
  }

  const withinHalf = entries.filter((e) => e.isWithinHalfGrade).length
  const withinOne  = entries.filter((e) => e.isWithinOneGrade).length
  const meanDisc   = entries.reduce((s, e) => s + e.discrepancy, 0) / entries.length

  for (const e of entries) {
    if (e.dominantBlindSpot) blindSpots[e.dominantBlindSpot]++
  }

  return {
    totalPredictions:  entries.length,
    withinHalfGrade:   withinHalf,
    withinOneGrade:    withinOne,
    withinHalfGradePct: Math.round(withinHalf / entries.length * 1000) / 1000,
    withinOneGradePct:  Math.round(withinOne  / entries.length * 1000) / 1000,
    meanDiscrepancy:    Math.round(meanDisc   * 10) / 10,
    blindSpots,
  }
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
npx vitest run lib/grade/__tests__/accuracy.test.ts 2>&1 | tail -10
```

Expected: 7 tests passing.

- [ ] **Step 5: Commit**

```bash
git add lib/grade/accuracy.ts lib/grade/__tests__/accuracy.test.ts
git commit -m "feat: accuracy — discrepancy analysis and blind-spot identification (TDD)"
```

---

## Task 9: Accuracy API Route + AccuracyLog Component + Accuracy Page

**Files:**
- Create: `app/api/grade/accuracy/route.ts`
- Create: `components/grade/AccuracyLog.tsx`
- Create: `app/(app)/grade/accuracy/page.tsx`

- [ ] **Step 1: Create `app/api/grade/accuracy/route.ts`**

```bash
mkdir -p "/Users/daviddaniel/Documents/GitHub/CardEdge/app/api/grade/accuracy"
```

```typescript
// app/api/grade/accuracy/route.ts
import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { getUserFromRequest } from '@/lib/auth'
import { analyzeAccuracyEntry, computeAccuracyStats } from '@/lib/grade/accuracy'
import type { AccuracySubgrades } from '@/lib/grade/accuracy'

export async function GET(req: Request) {
  const userId = await getUserFromRequest(req)
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerClient()

  const { data, error } = await supabase
    .from('grade_analyses')
    .select('id, card_key, continuous_score, actual_psa_grade, outcome_logged_at, subgrade_centering, subgrade_corners, subgrade_edges, subgrade_surface')
    .eq('user_id', userId)
    .not('actual_psa_grade', 'is', null)
    .not('continuous_score', 'is', null)
    .order('outcome_logged_at', { ascending: false })
    .limit(100)

  if (error) return NextResponse.json({ error: 'Fetch failed' }, { status: 500 })

  const entries = (data ?? []).map((row) => {
    const subgrades: AccuracySubgrades = {
      centering: row.subgrade_centering as number | undefined,
      corners:   row.subgrade_corners  as number | undefined,
      edges:     row.subgrade_edges    as number | undefined,
      surface:   row.subgrade_surface  as number | undefined,
    }
    return analyzeAccuracyEntry(
      row.id as string,
      row.card_key as string,
      Number(row.continuous_score),
      Number(row.actual_psa_grade),
      subgrades
    )
  })

  const stats = computeAccuracyStats(entries)

  return NextResponse.json({ entries, stats })
}
```

- [ ] **Step 2: Create `components/grade/AccuracyLog.tsx`**

```typescript
// components/grade/AccuracyLog.tsx
'use client'

import { useEffect, useState } from 'react'
import type { AccuracyEntry, AccuracyStats } from '@/lib/grade/accuracy'

interface AccuracyData {
  entries: AccuracyEntry[]
  stats: AccuracyStats
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-700 p-4 text-center">
      <p className="text-xs text-slate-500 mb-1">{label}</p>
      <p className="text-xl font-bold text-slate-100">{value}</p>
    </div>
  )
}

export function AccuracyLog() {
  const [data, setData] = useState<AccuracyData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/grade/accuracy')
      .then((r) => r.json())
      .then((d) => { setData(d as AccuracyData); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="space-y-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-16 rounded-xl bg-slate-800/40 animate-pulse border border-slate-800" />
        ))}
      </div>
    )
  }

  if (!data || data.entries.length === 0) {
    return (
      <div className="text-center py-16 border border-dashed border-slate-800 rounded-xl">
        <p className="text-sm text-slate-500">No outcomes logged yet.</p>
        <p className="text-xs text-slate-600 mt-1">
          After receiving cards back from PSA, log the actual grade from the Pre-Grade history.
        </p>
      </div>
    )
  }

  const { entries, stats } = data

  // Find worst blind spot
  const blindSpotEntries = Object.entries(stats.blindSpots) as [string, number][]
  const worstBlindSpot = blindSpotEntries.sort((a, b) => b[1] - a[1])[0]

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Predictions" value={String(stats.totalPredictions)} />
        <Stat label="Within ½ Grade" value={`${Math.round(stats.withinHalfGradePct * 100)}%`} />
        <Stat label="Within 1 Grade" value={`${Math.round(stats.withinOneGradePct * 100)}%`} />
        <Stat label="Mean Δ" value={`${stats.meanDiscrepancy > 0 ? '+' : ''}${stats.meanDiscrepancy.toFixed(1)}`} />
      </div>

      {/* Blind spot callout */}
      {worstBlindSpot && worstBlindSpot[1] > 0 && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-900/10 px-4 py-3">
          <p className="text-sm text-amber-300 font-medium">
            Systematic blind spot: <span className="capitalize">{worstBlindSpot[0]}</span>
          </p>
          <p className="text-xs text-amber-400/70 mt-0.5">
            {worstBlindSpot[1]}× this attribute was the lowest sub-grade when you overestimated. Evaluate {worstBlindSpot[0]} more carefully.
          </p>
        </div>
      )}

      {/* Entry list */}
      <div className="rounded-xl border border-slate-700 divide-y divide-slate-700">
        {entries.map((e) => (
          <div key={e.analysisId} className="px-4 py-4 space-y-1">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-slate-200 capitalize">
                {e.cardKey.replace(/-/g, ' ')}
              </p>
              <span className={`text-xs font-mono font-bold ${
                e.isWithinHalfGrade ? 'text-emerald-400' :
                e.isWithinOneGrade  ? 'text-amber-400' : 'text-red-400'
              }`}>
                {e.predictedScore.toFixed(1)} → PSA {e.actualGrade}
              </span>
            </div>
            <p className="text-xs text-slate-500">{e.summary}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Create `app/(app)/grade/accuracy/page.tsx`**

```bash
mkdir -p "/Users/daviddaniel/Documents/GitHub/CardEdge/app/(app)/grade/accuracy"
```

```typescript
// app/(app)/grade/accuracy/page.tsx
import { AccuracyLog } from '@/components/grade/AccuracyLog'

export default function AccuracyPage() {
  return (
    <div className="max-w-3xl mx-auto px-6 py-10 space-y-6">
      <div className="space-y-1">
        <h1 className="text-3xl font-bold">Accuracy Log</h1>
        <p className="text-slate-500 dark:text-slate-400 text-sm">
          Track your prediction accuracy over time and identify systematic blind spots.
        </p>
      </div>
      <AccuracyLog />
    </div>
  )
}
```

- [ ] **Step 4: TypeScript check**

```bash
npx tsc --noEmit 2>&1 | grep -E "AccuracyLog|accuracy/route|accuracy/page" | head -10
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add app/api/grade/accuracy/route.ts components/grade/AccuracyLog.tsx "app/(app)/grade/accuracy/page.tsx"
git commit -m "feat: accuracy log — GET route, AccuracyLog component, /grade/accuracy page"
```

---

## Task 10: AnalysisHistory — Inline Outcome Logging

**Files:**
- Modify: `components/grade/AnalysisHistory.tsx`

Each history row gets an "Add outcome" button (shown when `actual_psa_grade` is null). Clicking it reveals a small inline `<select>` for PSA grade (1–10 in 0.5 steps) + confirm button. On submit, calls `PUT /api/grade/analyses/[id]/outcome` and updates the row in local state.

- [ ] **Step 1: Read `components/grade/AnalysisHistory.tsx` in full**

- [ ] **Step 2: Update the `HistoryRow` interface to include new fields**

The history route now returns `actual_psa_grade` and `continuous_score` (updated in Task 7 Step 1). Add to the interface:

```typescript
interface HistoryRow {
  id: string
  card_key: string
  mode: string
  recommendation: string | null
  reliability_score: string | null
  raw_price: number | null
  ep_regular: number | null
  continuous_score: number | null
  actual_psa_grade: number | null
  created_at: string
}
```

- [ ] **Step 3: Replace the component body with the updated version**

```typescript
'use client'

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

interface HistoryRow {
  id: string
  card_key: string
  mode: string
  recommendation: string | null
  reliability_score: string | null
  raw_price: number | null
  ep_regular: number | null
  continuous_score: number | null
  actual_psa_grade: number | null
  created_at: string
}

const REC_STYLE = {
  grade:     'text-green-600 dark:text-green-400',
  uncertain: 'text-amber-600 dark:text-amber-400',
  skip:      'text-red-500',
}

const PSA_GRADES = [10, 9.5, 9, 8.5, 8, 7.5, 7, 6.5, 6, 5, 4, 3, 2, 1]

export function AnalysisHistory() {
  const [rows, setRows]               = useState<HistoryRow[]>([])
  const [logging, setLogging]         = useState<string | null>(null)   // analysisId being logged
  const [gradeInput, setGradeInput]   = useState<number>(9)
  const [saving, setSaving]           = useState(false)

  useEffect(() => {
    fetch('/api/grade/history')
      .then((r) => r.json())
      .then((data) => setRows(data as HistoryRow[]))
      .catch(() => {})
  }, [])

  async function logOutcome(id: string) {
    setSaving(true)
    try {
      const res = await fetch(`/api/grade/analyses/${id}/outcome`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actualGrade: gradeInput }),
      })
      if (res.ok) {
        setRows((prev) =>
          prev.map((r) => r.id === id ? { ...r, actual_psa_grade: gradeInput } : r)
        )
        setLogging(null)
      }
    } finally {
      setSaving(false)
    }
  }

  if (!rows.length) return null

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">Recent Analyses</h3>
      <div className="space-y-2">
        {rows.map((row) => (
          <div
            key={row.id}
            className="rounded-lg border border-slate-200 dark:border-slate-800 px-4 py-3 space-y-2"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium capitalize">
                  {row.card_key.replace(/-/g, ' ')}
                </p>
                <p className="text-xs text-slate-400">
                  {new Date(row.created_at).toLocaleDateString()} · {row.mode === 'ebay' ? 'eBay' : 'My Card'}
                  {row.raw_price ? ` · $${row.raw_price}` : ''}
                  {row.continuous_score ? ` · Pred: ${row.continuous_score.toFixed(1)}` : ''}
                </p>
              </div>
              <div className="text-right">
                {row.recommendation && (
                  <p className={cn('text-xs font-semibold uppercase', REC_STYLE[row.recommendation as keyof typeof REC_STYLE])}>
                    {row.recommendation === 'grade' ? 'Grade It' : row.recommendation === 'uncertain' ? 'Uncertain' : 'Skip'}
                  </p>
                )}
                {row.ep_regular !== null && (
                  <p className={cn('text-xs font-mono', (row.ep_regular ?? 0) > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500')}>
                    {(row.ep_regular ?? 0) >= 0 ? '+' : ''}${row.ep_regular?.toFixed(0)} EP
                  </p>
                )}
              </div>
            </div>

            {/* Outcome section */}
            {row.actual_psa_grade !== null ? (
              <p className="text-xs text-slate-500">
                Actual: <span className="font-semibold text-slate-300">PSA {row.actual_psa_grade}</span>
                {row.continuous_score && (
                  <span className={cn('ml-2', Math.abs(row.actual_psa_grade - row.continuous_score) <= 0.5 ? 'text-emerald-500' : 'text-amber-500')}>
                    ({row.actual_psa_grade >= row.continuous_score ? '+' : ''}{(row.actual_psa_grade - row.continuous_score).toFixed(1)})
                  </span>
                )}
              </p>
            ) : logging === row.id ? (
              <div className="flex items-center gap-2">
                <select
                  value={gradeInput}
                  onChange={(e) => setGradeInput(Number(e.target.value))}
                  className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-200 focus:outline-none"
                >
                  {PSA_GRADES.map((g) => (
                    <option key={g} value={g}>PSA {g}</option>
                  ))}
                </select>
                <button
                  onClick={() => void logOutcome(row.id)}
                  disabled={saving}
                  className="text-xs bg-indigo-600 hover:bg-indigo-500 text-white px-2.5 py-1 rounded transition-colors disabled:opacity-50"
                >
                  {saving ? '…' : 'Save'}
                </button>
                <button
                  onClick={() => setLogging(null)}
                  className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => { setLogging(row.id); setGradeInput(9) }}
                className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
              >
                + Log actual PSA grade
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: TypeScript check**

```bash
npx tsc --noEmit 2>&1 | grep "AnalysisHistory" | head -10
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add components/grade/AnalysisHistory.tsx
git commit -m "feat: AnalysisHistory — inline outcome logging with predicted vs. actual display"
```

---

## Task 11: Full Test Run and TypeScript Check

- [ ] **Step 1: Run all tests**

```bash
npx vitest run 2>&1
```

Expected: all tests pass (includes new pop-velocity, batch-optimizer, accuracy tests).

- [ ] **Step 2: Full TypeScript check**

```bash
npx tsc --noEmit 2>&1
```

Expected: no errors.

- [ ] **Step 3: Fix any errors** (minimal targeted fixes only — no refactoring)

- [ ] **Step 4: Final commit if fixes made**

```bash
git add -A
git commit -m "fix: resolve Phase 3 TypeScript and test errors"
```

- [ ] **Step 5: Print final log**

```bash
git log --oneline -15
```

---

## Spec Coverage Check

- [x] 3.1 Daily cron snapshots PSA populations → `inngest/pop-velocity-tracker.ts` (Task 3)
- [x] 3.1 Snapshots stored in `pop_snapshots` → table already existed from Phase 1; cron upserts daily rows (Task 3)
- [x] 3.1 Computed signals: 30-day growth rate, gem rate trend, pop pressure → `lib/grade/pop-velocity.ts` (Task 2)
- [x] 3.1 Surfaced on submission decision → `PopVelocityBadge` in `SubmissionVerdict` (Task 4)
- [x] 3.1 Alert system: deferred — out of scope for Phase 3 implementation (requires notification infrastructure beyond current scope)
- [x] 3.2 Per-card expected ROI scoring → `rankCards()` in `batch-optimizer.ts` (Task 5)
- [x] 3.2 Recommended 25-card batch → `buildBatch()` (Task 5)
- [x] 3.2 Batch route → `POST /api/grade/batch` (Task 6)
- [x] 3.2 `submission_batches` table → migration (Task 1)
- [x] 3.2 Batch UI with ROI ranking → `BatchOptimizer` component + `/grade/batch` page (Task 7)
- [x] 3.3 Actual PSA grade logging → `PUT /api/grade/analyses/[id]/outcome` already built Phase 1; inline button in `AnalysisHistory` (Task 10)
- [x] 3.3 Predicted vs. actual comparison → `analyzeAccuracyEntry()` (Task 8)
- [x] 3.3 Discrepancy analysis with blind spot → `dominantBlindSpot` + `summary` field (Task 8)
- [x] 3.3 Personal accuracy log → `AccuracyLog` component + `/grade/accuracy` page (Task 9)
- [x] 3.3 Systematic blind spot identification → `computeAccuracyStats().blindSpots` (Task 8)
