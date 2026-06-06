# Portfolio Tracker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Bloomberg terminal-style portfolio tracker that connects deal alerts and pre-grade analyses into a full card investment lifecycle (raw_owned → submitted → graded_owned → sold) with P&L tracking.

**Architecture:** Single `portfolio_cards` table with explicit status column. Pure P&L functions in `lib/portfolio/`. API routes follow existing watchlist/alert patterns. Portfolio page is a full-height split-panel layout (table left, detail right) with Bloomberg terminal aesthetic (slate-950 bg, amber accent, mono numbers).

**Tech Stack:** Next.js 16 App Router, Supabase, Inngest, Tailwind, Vitest, lucide-react

---

### Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/003_portfolio_tracker.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/003_portfolio_tracker.sql
create table portfolio_cards (
  id                       uuid primary key default gen_random_uuid(),
  user_id                  uuid,
  card_key                 text not null,
  player                   text not null,
  set_name                 text not null,
  year                     text,
  grade                    text,
  status                   text not null default 'raw_owned'
    check (status in ('raw_owned','submitted','graded_owned','sold')),
  source                   text not null default 'manual'
    check (source in ('manual','alert','analysis')),
  alert_id                 uuid references alerts(id) on delete set null,
  analysis_id              uuid references grade_analyses(id) on delete set null,
  raw_purchase_price       numeric(10,2) not null,
  raw_purchase_date        date not null,
  submitted_at             date,
  received_grade           integer,
  received_at              date,
  current_value_override   numeric(10,2),
  current_value_fetched    numeric(10,2),
  current_value_fetched_at timestamptz,
  sold_price               numeric(10,2),
  sold_at                  date,
  notes                    text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create index idx_portfolio_cards_user   on portfolio_cards (user_id);
create index idx_portfolio_cards_status on portfolio_cards (status);
create index idx_portfolio_cards_key    on portfolio_cards (card_key);
```

- [ ] **Step 2: Apply migration in Supabase dashboard or CLI**

```bash
npx supabase db push
# or paste SQL into Supabase SQL editor
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/003_portfolio_tracker.sql
git commit -m "feat: add portfolio_cards migration"
```

---

### Task 2: TypeScript Types + Card Key Utility

**Files:**
- Create: `lib/portfolio/types.ts`
- Create: `lib/portfolio/card-key.ts`

- [ ] **Step 1: Write types**

```ts
// lib/portfolio/types.ts
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
```

- [ ] **Step 2: Write card key utility**

```ts
// lib/portfolio/card-key.ts
export function buildPortfolioCardKey(
  player: string,
  setName: string,
  year: string | null,
  grade: string | null
): string {
  const parts = [player, setName, year, grade].filter(Boolean) as string[]
  return parts
    .map((s) => s.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''))
    .join('-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}
```

- [ ] **Step 3: Commit**

```bash
git add lib/portfolio/
git commit -m "feat: add portfolio types and card-key utility"
```

---

### Task 3: P&L Business Logic + Tests

**Files:**
- Create: `lib/portfolio/pnl.ts`
- Create: `lib/portfolio/status-machine.ts`
- Create: `lib/__tests__/portfolio/pnl.test.ts`
- Create: `lib/__tests__/portfolio/status-machine.test.ts`

- [ ] **Step 1: Write failing tests for P&L**

```ts
// lib/__tests__/portfolio/pnl.test.ts
import { describe, it, expect } from 'vitest'
import { resolveCurrentValue, unrealizedPnl, realizedPnl, summarize } from '@/lib/portfolio/pnl'
import type { PortfolioCard } from '@/lib/portfolio/types'

function makeCard(overrides: Partial<PortfolioCard> = {}): PortfolioCard {
  return {
    id: '1', user_id: null, card_key: 'test', player: 'Test', set_name: 'Set',
    year: null, grade: null, status: 'raw_owned', source: 'manual',
    alert_id: null, analysis_id: null,
    raw_purchase_price: 100, raw_purchase_date: '2026-01-01',
    submitted_at: null, received_grade: null, received_at: null,
    current_value_override: null, current_value_fetched: null,
    current_value_fetched_at: null, sold_price: null, sold_at: null,
    notes: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('resolveCurrentValue', () => {
  it('returns override when set', () => {
    expect(resolveCurrentValue(makeCard({ current_value_override: 150, current_value_fetched: 120 }))).toBe(150)
  })
  it('falls back to fetched when no override', () => {
    expect(resolveCurrentValue(makeCard({ current_value_fetched: 120 }))).toBe(120)
  })
  it('returns null when neither is set', () => {
    expect(resolveCurrentValue(makeCard())).toBeNull()
  })
  it('returns sold_price for sold cards', () => {
    expect(resolveCurrentValue(makeCard({ status: 'sold', sold_price: 200 }))).toBe(200)
  })
})

describe('unrealizedPnl', () => {
  it('returns null for sold cards', () => {
    expect(unrealizedPnl(makeCard({ status: 'sold', sold_price: 200 }))).toBeNull()
  })
  it('returns null when no current value', () => {
    expect(unrealizedPnl(makeCard())).toBeNull()
  })
  it('calculates positive P&L correctly', () => {
    const pnl = unrealizedPnl(makeCard({ current_value_fetched: 150 }))
    expect(pnl).not.toBeNull()
    expect(pnl!.amount).toBe(50)
    expect(pnl!.pct).toBeCloseTo(50, 1)
  })
  it('calculates negative P&L correctly', () => {
    const pnl = unrealizedPnl(makeCard({ current_value_fetched: 80 }))
    expect(pnl!.amount).toBe(-20)
    expect(pnl!.pct).toBeCloseTo(-20, 1)
  })
})

describe('realizedPnl', () => {
  it('returns null for non-sold cards', () => {
    expect(realizedPnl(makeCard())).toBeNull()
  })
  it('calculates realized gain', () => {
    const pnl = realizedPnl(makeCard({ status: 'sold', sold_price: 180 }))
    expect(pnl!.amount).toBe(80)
    expect(pnl!.pct).toBeCloseTo(80, 1)
  })
})

describe('summarize', () => {
  it('counts non-sold positions', () => {
    const cards = [makeCard(), makeCard({ id: '2', status: 'sold', sold_price: 120 })]
    const s = summarize(cards, 5)
    expect(s.positionCount).toBe(1)
    expect(s.activeAlertCount).toBe(5)
  })
  it('sums portfolio value from fetched prices', () => {
    const cards = [
      makeCard({ current_value_fetched: 150 }),
      makeCard({ id: '2', current_value_fetched: 200 }),
    ]
    const s = summarize(cards, 0)
    expect(s.portfolioValue).toBe(350)
    expect(s.costBasis).toBe(200)
    expect(s.unrealizedPnl).toBe(150)
    expect(s.unrealizedPnlPct).toBeCloseTo(75, 1)
  })
  it('sums realized P&L from sold cards', () => {
    const cards = [makeCard({ status: 'sold', sold_price: 130 })]
    const s = summarize(cards, 0)
    expect(s.realizedPnl).toBe(30)
  })
  it('breaks down status counts correctly', () => {
    const cards = [
      makeCard({ id: '1', status: 'raw_owned' }),
      makeCard({ id: '2', status: 'submitted' }),
      makeCard({ id: '3', status: 'graded_owned' }),
    ]
    const s = summarize(cards, 0)
    expect(s.statusBreakdown).toEqual({ raw_owned: 1, submitted: 1, graded_owned: 1 })
  })
})
```

- [ ] **Step 2: Run — expect FAIL (module not found)**

```bash
npx vitest run lib/__tests__/portfolio/pnl.test.ts
```

Expected: `Cannot find module '@/lib/portfolio/pnl'`

- [ ] **Step 3: Write pnl.ts**

```ts
// lib/portfolio/pnl.ts
import type { PortfolioCard, PortfolioSummary } from './types'

export function resolveCurrentValue(card: PortfolioCard): number | null {
  if (card.status === 'sold') return card.sold_price ?? null
  return card.current_value_override ?? card.current_value_fetched ?? null
}

export function unrealizedPnl(card: PortfolioCard): { amount: number; pct: number } | null {
  if (card.status === 'sold') return null
  const value = resolveCurrentValue(card)
  if (value === null) return null
  const amount = value - card.raw_purchase_price
  const pct = card.raw_purchase_price > 0 ? (amount / card.raw_purchase_price) * 100 : 0
  return { amount, pct }
}

export function realizedPnl(card: PortfolioCard): { amount: number; pct: number } | null {
  if (card.status !== 'sold' || card.sold_price === null) return null
  const amount = card.sold_price - card.raw_purchase_price
  const pct = card.raw_purchase_price > 0 ? (amount / card.raw_purchase_price) * 100 : 0
  return { amount, pct }
}

export function summarize(cards: PortfolioCard[], alertCount: number): PortfolioSummary {
  const nonSold = cards.filter((c) => c.status !== 'sold')
  const sold = cards.filter((c) => c.status === 'sold')
  let portfolioValue = 0
  for (const c of nonSold) {
    const v = resolveCurrentValue(c)
    if (v !== null) portfolioValue += v
  }
  const costBasis = nonSold.reduce((s, c) => s + c.raw_purchase_price, 0)
  const unrealizedPnlAmount = portfolioValue - costBasis
  const unrealizedPnlPct = costBasis > 0 ? (unrealizedPnlAmount / costBasis) * 100 : 0
  const realizedPnlAmount = sold.reduce((s, c) => {
    const r = realizedPnl(c)
    return r ? s + r.amount : s
  }, 0)
  return {
    portfolioValue,
    costBasis,
    unrealizedPnl: unrealizedPnlAmount,
    unrealizedPnlPct,
    realizedPnl: realizedPnlAmount,
    activeAlertCount: alertCount,
    positionCount: nonSold.length,
    statusBreakdown: {
      raw_owned: nonSold.filter((c) => c.status === 'raw_owned').length,
      submitted: nonSold.filter((c) => c.status === 'submitted').length,
      graded_owned: nonSold.filter((c) => c.status === 'graded_owned').length,
    },
  }
}
```

- [ ] **Step 4: Run — expect PASS**

```bash
npx vitest run lib/__tests__/portfolio/pnl.test.ts
```

Expected: all tests pass

- [ ] **Step 5: Write failing status machine tests**

```ts
// lib/__tests__/portfolio/status-machine.test.ts
import { describe, it, expect } from 'vitest'
import { canTransition } from '@/lib/portfolio/status-machine'

describe('canTransition', () => {
  it('raw_owned → submitted: valid', () => expect(canTransition('raw_owned', 'submitted')).toBe(true))
  it('raw_owned → sold: valid (raw flip)', () => expect(canTransition('raw_owned', 'sold')).toBe(true))
  it('raw_owned → graded_owned: invalid', () => expect(canTransition('raw_owned', 'graded_owned')).toBe(false))
  it('submitted → graded_owned: valid', () => expect(canTransition('submitted', 'graded_owned')).toBe(true))
  it('submitted → sold: invalid', () => expect(canTransition('submitted', 'sold')).toBe(false))
  it('graded_owned → sold: valid', () => expect(canTransition('graded_owned', 'sold')).toBe(true))
  it('sold has no valid transitions', () => {
    expect(canTransition('sold', 'raw_owned')).toBe(false)
    expect(canTransition('sold', 'submitted')).toBe(false)
  })
})
```

- [ ] **Step 6: Run — expect FAIL**

```bash
npx vitest run lib/__tests__/portfolio/status-machine.test.ts
```

- [ ] **Step 7: Write status-machine.ts**

```ts
// lib/portfolio/status-machine.ts
import type { PortfolioStatus } from './types'

const VALID: Record<PortfolioStatus, PortfolioStatus[]> = {
  raw_owned:    ['submitted', 'sold'],
  submitted:    ['graded_owned'],
  graded_owned: ['sold'],
  sold:         [],
}

export function canTransition(from: PortfolioStatus, to: PortfolioStatus): boolean {
  return VALID[from].includes(to)
}
```

- [ ] **Step 8: Run all portfolio tests — expect PASS**

```bash
npx vitest run lib/__tests__/portfolio/
```

- [ ] **Step 9: Commit**

```bash
git add lib/portfolio/ lib/__tests__/portfolio/
git commit -m "feat: add portfolio P&L logic and status machine"
```

---

### Task 4: API — List + Add

**Files:**
- Create: `app/api/portfolio/route.ts`

- [ ] **Step 1: Write route**

```ts
// app/api/portfolio/route.ts
import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { buildPortfolioCardKey } from '@/lib/portfolio/card-key'
import type { AddCardPayload } from '@/lib/portfolio/types'

export async function GET() {
  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('portfolio_cards')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: Request) {
  const supabase = createServerClient()
  const body = (await req.json()) as AddCardPayload

  const grade = body.grade && !['raw', 'RAW', 'Any'].includes(body.grade) ? body.grade : null
  const cardKey = buildPortfolioCardKey(body.player, body.set_name, body.year, grade)
  const isGraded = grade !== null
  const gradeNum = isGraded ? parseInt(grade.replace(/[^0-9]/g, ''), 10) : null

  const { data, error } = await supabase
    .from('portfolio_cards')
    .insert({
      card_key: cardKey,
      player: body.player,
      set_name: body.set_name,
      year: body.year,
      grade,
      status: isGraded ? 'graded_owned' : 'raw_owned',
      source: body.source,
      alert_id: body.alert_id,
      analysis_id: body.analysis_id,
      raw_purchase_price: body.raw_purchase_price,
      raw_purchase_date: body.raw_purchase_date,
      received_grade: gradeNum,
      received_at: isGraded ? body.raw_purchase_date : null,
      submitted_at: isGraded ? body.raw_purchase_date : null,
      notes: body.notes,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
```

- [ ] **Step 2: Smoke-test in browser**

Start dev server (`npm run dev`). POST to `/api/portfolio` with a test payload via the browser console or curl:

```bash
curl -X POST http://localhost:3000/api/portfolio \
  -H "Content-Type: application/json" \
  -d '{"player":"Test Player","set_name":"2020 Prizm","year":"2020","grade":null,"raw_purchase_price":50,"raw_purchase_date":"2026-06-01","notes":null,"source":"manual","alert_id":null,"analysis_id":null}'
```

Expected: `201` with the created row

- [ ] **Step 3: Commit**

```bash
git add app/api/portfolio/route.ts
git commit -m "feat: add GET/POST /api/portfolio"
```

---

### Task 5: API — Update + Delete

**Files:**
- Create: `app/api/portfolio/[id]/route.ts`

- [ ] **Step 1: Write route**

```ts
// app/api/portfolio/[id]/route.ts
import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { buildPortfolioCardKey } from '@/lib/portfolio/card-key'
import { canTransition } from '@/lib/portfolio/status-machine'
import type { PortfolioStatus } from '@/lib/portfolio/types'

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = createServerClient()
  const body = (await req.json()) as Record<string, unknown>

  const { data: current, error: fetchErr } = await supabase
    .from('portfolio_cards')
    .select('status, player, set_name, year')
    .eq('id', id)
    .single()

  if (fetchErr || !current) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }

  if (body.status) {
    const next = body.status as PortfolioStatus
    if (!canTransition(current.status as PortfolioStatus, next)) {
      return NextResponse.json(
        { error: `Cannot transition from ${current.status} to ${next}` },
        { status: 422 }
      )
    }
    updates.status = next
    if (next === 'submitted') {
      updates.submitted_at = body.submitted_at ?? new Date().toISOString().slice(0, 10)
    }
    if (next === 'graded_owned') {
      const gradeNum = body.received_grade as number
      const gradeLabel = `PSA ${gradeNum}`
      updates.received_grade = gradeNum
      updates.received_at = body.received_at ?? new Date().toISOString().slice(0, 10)
      updates.grade = gradeLabel
      updates.card_key = buildPortfolioCardKey(
        current.player as string,
        current.set_name as string,
        current.year as string | null,
        gradeLabel
      )
    }
    if (next === 'sold') {
      updates.sold_price = body.sold_price
      updates.sold_at = body.sold_at ?? new Date().toISOString().slice(0, 10)
    }
  }

  if ('current_value_override' in body) updates.current_value_override = body.current_value_override
  if ('notes' in body) updates.notes = body.notes

  const { data, error } = await supabase
    .from('portfolio_cards')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(
  _: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = createServerClient()
  const { error } = await supabase.from('portfolio_cards').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return new NextResponse(null, { status: 204 })
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/portfolio/[id]/route.ts
git commit -m "feat: add PATCH/DELETE /api/portfolio/[id]"
```

---

### Task 6: API — Summary + Price History

**Files:**
- Create: `app/api/portfolio/summary/route.ts`
- Create: `app/api/portfolio/[id]/price-history/route.ts`

- [ ] **Step 1: Write summary route**

```ts
// app/api/portfolio/summary/route.ts
import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { summarize } from '@/lib/portfolio/pnl'
import type { PortfolioCard } from '@/lib/portfolio/types'

export async function GET() {
  const supabase = createServerClient()
  const [cardsRes, alertsRes] = await Promise.all([
    supabase.from('portfolio_cards').select('*'),
    supabase.from('alerts').select('id', { count: 'exact', head: true }).eq('is_read', false),
  ])
  if (cardsRes.error) return NextResponse.json({ error: cardsRes.error.message }, { status: 500 })
  return NextResponse.json(summarize((cardsRes.data ?? []) as PortfolioCard[], alertsRes.count ?? 0))
}
```

- [ ] **Step 2: Write price-history route**

```ts
// app/api/portfolio/[id]/price-history/route.ts
import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

export async function GET(
  _: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = createServerClient()

  const { data: card, error: cardErr } = await supabase
    .from('portfolio_cards')
    .select('card_key')
    .eq('id', id)
    .single()

  if (cardErr || !card) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const ninetyDaysAgo = new Date()
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)

  const { data, error } = await supabase
    .from('price_cache')
    .select('sale_price, sale_date')
    .eq('card_key', card.card_key)
    .gte('sale_date', ninetyDaysAgo.toISOString())
    .order('sale_date', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json((data ?? []).map((r) => ({ price: r.sale_price, date: r.sale_date })))
}
```

- [ ] **Step 3: Commit**

```bash
git add app/api/portfolio/summary/route.ts app/api/portfolio/[id]/price-history/route.ts
git commit -m "feat: add portfolio summary and price-history API routes"
```

---

### Task 7: Inngest Value Refresh Cron

**Files:**
- Create: `inngest/portfolio-value-refresh.ts`
- Modify: `app/api/inngest/route.ts`

- [ ] **Step 1: Write Inngest function**

```ts
// inngest/portfolio-value-refresh.ts
import { inngest } from './client'
import { createServerClient } from '@/lib/supabase/server'
import { calculateFairValue } from '@/lib/fair-value'

export const portfolioValueRefresh = inngest.createFunction(
  { id: 'portfolio-value-refresh', triggers: [{ cron: '0 8 * * *' }] },
  async ({ step }) => {
    const supabase = createServerClient()

    const cards = await step.run('fetch-stale-cards', async () => {
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
      const { data, error } = await supabase
        .from('portfolio_cards')
        .select('id, card_key')
        .in('status', ['raw_owned', 'graded_owned'])
        .is('current_value_override', null)
        .or(`current_value_fetched_at.is.null,current_value_fetched_at.lt.${oneDayAgo}`)
      if (error) throw new Error(error.message)
      return data ?? []
    })

    let refreshed = 0
    for (const card of cards) {
      await step.run(`refresh-${card.id as string}`, async () => {
        const ninetyDaysAgo = new Date()
        ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)
        const { data: comps } = await supabase
          .from('price_cache')
          .select('sale_price, sale_date')
          .eq('card_key', card.card_key as string)
          .gte('sale_date', ninetyDaysAgo.toISOString())
          .order('sale_date', { ascending: false })

        if (!comps || comps.length < 3) return
        const result = calculateFairValue(
          comps.map((c) => ({ price: c.sale_price as number, saleDate: new Date(c.sale_date as string) }))
        )
        if (!result) return
        await supabase
          .from('portfolio_cards')
          .update({
            current_value_fetched: Math.round(result.fairValue * 100) / 100,
            current_value_fetched_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', card.id as string)
        refreshed++
      })
    }
    return { cardsChecked: cards.length, refreshed }
  }
)
```

- [ ] **Step 2: Register in Inngest route**

```ts
// app/api/inngest/route.ts
import { serve } from 'inngest/next'
import { inngest } from '@/inngest/client'
import { dealScanner } from '@/inngest/deal-scanner'
import { gradeAnalyzer } from '@/inngest/grade-analyzer'
import { portfolioValueRefresh } from '@/inngest/portfolio-value-refresh'

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [dealScanner, gradeAnalyzer, portfolioValueRefresh],
})
```

- [ ] **Step 3: Commit**

```bash
git add inngest/portfolio-value-refresh.ts app/api/inngest/route.ts
git commit -m "feat: add portfolio value refresh Inngest cron"
```

---

### Task 8: AddCardModal Component

**Files:**
- Create: `components/portfolio/AddCardModal.tsx`

- [ ] **Step 1: Write component**

```tsx
// components/portfolio/AddCardModal.tsx
'use client'

import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import type { PortfolioSource } from '@/lib/portfolio/types'

export interface AddCardPrefill {
  player?: string
  setName?: string
  year?: string
  grade?: string | null
  price?: number
  source: PortfolioSource
  alertId?: string
  analysisId?: string
}

interface Props {
  open: boolean
  prefill?: AddCardPrefill
  onClose: () => void
  onAdd: () => void
}

const inputCls =
  'w-full bg-slate-800 border border-slate-700 text-slate-100 text-xs font-mono px-2.5 py-1.5 rounded focus:outline-none focus:border-amber-400'

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[10px] font-mono text-slate-500 uppercase mb-1">
        {label}{required && ' *'}
      </label>
      {children}
    </div>
  )
}

export function AddCardModal({ open, prefill, onClose, onAdd }: Props) {
  const [isGraded, setIsGraded] = useState(false)
  const [player, setPlayer] = useState('')
  const [setName, setSetName] = useState('')
  const [year, setYear] = useState('')
  const [grade, setGrade] = useState('10')
  const [price, setPrice] = useState('')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) return
    setPlayer(prefill?.player ?? '')
    setSetName(prefill?.setName ?? '')
    setYear(prefill?.year ?? '')
    setPrice(prefill?.price?.toString() ?? '')
    setNotes('')
    setDate(new Date().toISOString().slice(0, 10))
    if (prefill?.grade && !['raw', 'RAW', 'Any', null, undefined].includes(prefill.grade)) {
      setIsGraded(true)
      setGrade(prefill.grade.replace(/[^0-9]/g, '') || '10')
    } else {
      setIsGraded(false)
      setGrade('10')
    }
  }, [open, prefill])

  if (!open) return null

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    await fetch('/api/portfolio', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        player: player.trim(),
        set_name: setName.trim(),
        year: year.trim() || null,
        grade: isGraded ? `PSA ${grade}` : null,
        raw_purchase_price: parseFloat(price),
        raw_purchase_date: date,
        notes: notes.trim() || null,
        source: prefill?.source ?? 'manual',
        alert_id: prefill?.alertId ?? null,
        analysis_id: prefill?.analysisId ?? null,
      }),
    })
    setSubmitting(false)
    onAdd()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative bg-slate-900 border border-slate-700 rounded-lg w-full max-w-md mx-4 p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-sm font-mono font-semibold text-slate-100 uppercase tracking-wider">
            ADD POSITION
          </h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300">
            <X className="size-4" />
          </button>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <div className="flex gap-2">
            {(['RAW', 'GRADED'] as const).map((label) => {
              const active = label === 'GRADED' ? isGraded : !isGraded
              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => setIsGraded(label === 'GRADED')}
                  className={`flex-1 text-[11px] font-mono py-1.5 rounded border transition-colors ${
                    active
                      ? 'bg-amber-400 text-slate-950 border-amber-400'
                      : 'text-slate-400 border-slate-700 hover:border-slate-500'
                  }`}
                >
                  {label}
                </button>
              )
            })}
          </div>

          <Field label="Player" required>
            <input type="text" value={player} onChange={(e) => setPlayer(e.target.value)} required className={inputCls} placeholder="e.g. Patrick Mahomes" />
          </Field>
          <Field label="Set" required>
            <input type="text" value={setName} onChange={(e) => setSetName(e.target.value)} required className={inputCls} placeholder="e.g. 2018 Panini Prizm" />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Year">
              <input type="text" value={year} onChange={(e) => setYear(e.target.value)} className={inputCls} placeholder="e.g. 2018" />
            </Field>
            {isGraded && (
              <Field label="PSA Grade" required>
                <select value={grade} onChange={(e) => setGrade(e.target.value)} className={inputCls}>
                  {[10, 9, 8, 7, 6, 5, 4, 3, 2, 1].map((g) => (
                    <option key={g} value={g}>PSA {g}</option>
                  ))}
                </select>
              </Field>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Purchase Price ($)" required>
              <input type="number" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} required className={inputCls} placeholder="0.00" />
            </Field>
            <Field label="Purchase Date" required>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required className={inputCls} />
            </Field>
          </div>

          <Field label="Notes">
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={`${inputCls} resize-none`} placeholder="Optional…" />
          </Field>

          <button
            type="submit"
            disabled={submitting}
            className="w-full text-[12px] font-mono font-semibold text-slate-950 bg-amber-400 hover:bg-amber-300 disabled:opacity-50 py-2.5 rounded transition-colors"
          >
            {submitting ? 'ADDING…' : 'ADD POSITION'}
          </button>
        </form>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/portfolio/AddCardModal.tsx
git commit -m "feat: add AddCardModal component"
```

---

### Task 9: PortfolioKpiBar Component

**Files:**
- Create: `components/portfolio/PortfolioKpiBar.tsx`

- [ ] **Step 1: Write component**

```tsx
// components/portfolio/PortfolioKpiBar.tsx
'use client'

import { useCallback, useEffect, useState } from 'react'
import type { PortfolioSummary } from '@/lib/portfolio/types'

function usd(n: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD',
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(n)
}

function pct(n: number) {
  return `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`
}

interface Props { onAdd: () => void }

export function PortfolioKpiBar({ onAdd }: Props) {
  const [summary, setSummary] = useState<PortfolioSummary | null>(null)

  const load = useCallback(async () => {
    const res = await fetch('/api/portfolio/summary')
    setSummary((await res.json()) as PortfolioSummary)
  }, [])

  useEffect(() => { void load() }, [load])

  const pnlColor = !summary || summary.unrealizedPnl >= 0 ? 'text-green-400' : 'text-red-400'

  return (
    <div className="flex items-center justify-between gap-4 px-6 py-4 bg-slate-900 border-b border-slate-800 flex-shrink-0">
      <div className="flex items-center gap-8 flex-wrap">
        <Chip label="TOTAL VALUE" value={summary ? usd(summary.portfolioValue) : '—'} />
        <Chip label="COST BASIS" value={summary ? usd(summary.costBasis) : '—'} />
        <Chip
          label="UNREALIZED P&L"
          value={summary ? `${usd(summary.unrealizedPnl)} (${pct(summary.unrealizedPnlPct)})` : '—'}
          valueClass={pnlColor}
        />
        <Chip
          label="REALIZED P&L"
          value={summary ? usd(summary.realizedPnl) : '—'}
          valueClass={summary && summary.realizedPnl >= 0 ? 'text-green-400' : 'text-red-400'}
        />
        {summary && (
          <Chip
            label="POSITIONS"
            value={`${summary.positionCount} · ${summary.statusBreakdown.submitted} sub · ${summary.statusBreakdown.graded_owned} graded`}
          />
        )}
      </div>
      <button
        onClick={onAdd}
        className="flex-shrink-0 text-xs font-mono font-semibold text-slate-950 bg-amber-400 hover:bg-amber-300 px-3 py-1.5 rounded transition-colors"
      >
        + ADD POSITION
      </button>
    </div>
  )
}

function Chip({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div>
      <p className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">{label}</p>
      <p className={`text-sm font-mono tabular-nums font-semibold text-slate-100 ${valueClass ?? ''}`}>{value}</p>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/portfolio/PortfolioKpiBar.tsx
git commit -m "feat: add PortfolioKpiBar component"
```

---

### Task 10: PriceSparkline + LifecycleTimeline

**Files:**
- Create: `components/portfolio/PriceSparkline.tsx`
- Create: `components/portfolio/LifecycleTimeline.tsx`

- [ ] **Step 1: Write PriceSparkline (pure SVG, no dependencies)**

```tsx
// components/portfolio/PriceSparkline.tsx
interface PricePoint { price: number; date: string }

interface Props { data: PricePoint[]; width?: number; height?: number }

export function PriceSparkline({ data, width = 240, height = 56 }: Props) {
  if (data.length < 2) {
    return <p className="text-xs font-mono text-slate-600">No price history yet</p>
  }
  const prices = data.map((d) => d.price)
  const min = Math.min(...prices)
  const max = Math.max(...prices)
  const range = max - min || 1
  const pad = 4
  const w = width - pad * 2
  const h = height - pad * 2
  const points = data.map((d, i) => {
    const x = pad + (i / (data.length - 1)) * w
    const y = pad + h - ((d.price - min) / range) * h
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })
  const trend = data[data.length - 1].price >= data[0].price ? '#4ade80' : '#f87171'
  return (
    <div>
      <svg width={width} height={height} className="overflow-visible">
        <polyline points={points.join(' ')} fill="none" stroke={trend} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      </svg>
      <div className="flex justify-between mt-0.5">
        <span className="text-[10px] font-mono text-slate-600">
          {new Date(data[0].date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
        </span>
        <span className="text-[10px] font-mono text-slate-600">
          {new Date(data[data.length - 1].date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
        </span>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Write LifecycleTimeline**

```tsx
// components/portfolio/LifecycleTimeline.tsx
import type { PortfolioCard } from '@/lib/portfolio/types'

const STEPS = [
  { key: 'raw_owned',    label: 'PURCHASED' },
  { key: 'submitted',   label: 'SUBMITTED' },
  { key: 'graded_owned', label: 'GRADED' },
  { key: 'sold',        label: 'SOLD' },
] as const

const ORDER: Record<string, number> = { raw_owned: 0, submitted: 1, graded_owned: 2, sold: 3 }

function stepDate(card: PortfolioCard, key: string): string | null {
  if (key === 'raw_owned') return card.raw_purchase_date
  if (key === 'submitted') return card.submitted_at
  if (key === 'graded_owned') return card.received_at
  if (key === 'sold') return card.sold_at
  return null
}

interface Props {
  card: PortfolioCard
  onAdvance: (action: 'submit' | 'grade' | 'sell') => void
}

export function LifecycleTimeline({ card, onAdvance }: Props) {
  const currentIdx = ORDER[card.status] ?? 0
  return (
    <div className="space-y-3">
      <div className="flex items-start">
        {STEPS.map((step, idx) => {
          const complete = idx < currentIdx
          const current = idx === currentIdx
          const date = stepDate(card, step.key)
          return (
            <div key={step.key} className="flex-1 flex flex-col items-center">
              <div className="flex w-full items-center">
                {idx > 0 && <div className={`flex-1 h-px ${complete || current ? 'bg-amber-400' : 'bg-slate-700'}`} />}
                <div className={`w-2.5 h-2.5 rounded-full border-2 flex-shrink-0 ${
                  complete ? 'bg-amber-400 border-amber-400'
                  : current ? 'bg-slate-900 border-amber-400'
                  : 'bg-slate-900 border-slate-700'
                }`} />
                {idx < STEPS.length - 1 && <div className={`flex-1 h-px ${complete ? 'bg-amber-400' : 'bg-slate-700'}`} />}
              </div>
              <p className="text-[10px] font-mono text-slate-500 mt-1 text-center">{step.label}</p>
              {date && (
                <p className="text-[10px] font-mono text-amber-400 text-center">
                  {new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })}
                </p>
              )}
            </div>
          )
        })}
      </div>

      {card.status === 'raw_owned' && (
        <button onClick={() => onAdvance('submit')} className="w-full text-[11px] font-mono text-amber-400 border border-amber-400/40 hover:border-amber-400 py-1.5 rounded transition-colors">
          MARK SUBMITTED →
        </button>
      )}
      {card.status === 'submitted' && (
        <button onClick={() => onAdvance('grade')} className="w-full text-[11px] font-mono text-amber-400 border border-amber-400/40 hover:border-amber-400 py-1.5 rounded transition-colors">
          ENTER RECEIVED GRADE →
        </button>
      )}
      {card.status === 'graded_owned' && (
        <button onClick={() => onAdvance('sell')} className="w-full text-[11px] font-mono text-green-400 border border-green-400/40 hover:border-green-400 py-1.5 rounded transition-colors">
          RECORD SALE →
        </button>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add components/portfolio/PriceSparkline.tsx components/portfolio/LifecycleTimeline.tsx
git commit -m "feat: add PriceSparkline and LifecycleTimeline components"
```

---

### Task 11: DetailPanel Component

**Files:**
- Create: `components/portfolio/DetailPanel.tsx`

- [ ] **Step 1: Write component**

```tsx
// components/portfolio/DetailPanel.tsx
'use client'

import { useEffect, useState } from 'react'
import { X, ExternalLink } from 'lucide-react'
import type { PortfolioCard } from '@/lib/portfolio/types'
import { resolveCurrentValue, unrealizedPnl } from '@/lib/portfolio/pnl'
import { PriceSparkline } from './PriceSparkline'
import { LifecycleTimeline } from './LifecycleTimeline'

interface PricePoint { price: number; date: string }
type AdvanceMode = null | 'submit' | 'grade' | 'sell'

interface Props {
  card: PortfolioCard
  onUpdate: (c: PortfolioCard) => void
  onDelete: (id: string) => void
  onClose: () => void
}

export function DetailPanel({ card, onUpdate, onDelete, onClose }: Props) {
  const [history, setHistory] = useState<PricePoint[]>([])
  const [advanceMode, setAdvanceMode] = useState<AdvanceMode>(null)
  const [overrideVal, setOverrideVal] = useState(card.current_value_override?.toString() ?? '')
  const [notesVal, setNotesVal] = useState(card.notes ?? '')

  useEffect(() => {
    setOverrideVal(card.current_value_override?.toString() ?? '')
    setNotesVal(card.notes ?? '')
    setAdvanceMode(null)
  }, [card.id, card.current_value_override, card.notes])

  useEffect(() => {
    void fetch(`/api/portfolio/${card.id}/price-history`)
      .then((r) => r.json())
      .then((d: unknown) => setHistory(Array.isArray(d) ? (d as PricePoint[]) : []))
  }, [card.id, card.card_key])

  const pnl = unrealizedPnl(card)
  const value = resolveCurrentValue(card)

  async function patch(body: Record<string, unknown>) {
    const res = await fetch(`/api/portfolio/${card.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    onUpdate((await res.json()) as PortfolioCard)
  }

  async function handleAdvance(mode: 'submit' | 'grade' | 'sell', payload: Record<string, unknown>) {
    if (mode === 'submit') await patch({ status: 'submitted', submitted_at: payload.date })
    if (mode === 'grade') await patch({ status: 'graded_owned', received_grade: payload.grade, received_at: payload.date })
    if (mode === 'sell') await patch({ status: 'sold', sold_price: payload.price, sold_at: payload.date })
    setAdvanceMode(null)
  }

  return (
    <div className="h-full flex flex-col bg-slate-900 border-l border-slate-800 overflow-y-auto">
      {/* Header */}
      <div className="flex items-start justify-between p-4 border-b border-slate-800">
        <div>
          <p className="text-sm font-mono font-semibold text-slate-100">{card.player}</p>
          <p className="text-xs font-mono text-slate-400">{card.set_name}{card.year ? ` · ${card.year}` : ''}</p>
          {card.grade && (
            <span className="inline-block mt-1 text-[11px] font-mono font-semibold text-amber-400 border border-amber-400/50 px-1.5 py-0.5 rounded">
              {card.grade}
            </span>
          )}
        </div>
        <button onClick={onClose} className="text-slate-500 hover:text-slate-300 mt-0.5"><X className="size-4" /></button>
      </div>

      <div className="flex-1 p-4 space-y-6 overflow-y-auto">
        {/* Value summary */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-[10px] font-mono text-slate-500 uppercase">COST BASIS</p>
            <p className="text-sm font-mono tabular-nums text-slate-100">${card.raw_purchase_price.toFixed(2)}</p>
          </div>
          <div>
            <p className="text-[10px] font-mono text-slate-500 uppercase">CURRENT VALUE</p>
            <p className="text-sm font-mono tabular-nums text-slate-100">
              {value !== null ? `$${value.toFixed(2)}` : '—'}
              {card.current_value_override !== null && <span className="text-amber-400 text-[10px] ml-1">📌</span>}
            </p>
          </div>
          {pnl && (
            <div className="col-span-2">
              <p className="text-[10px] font-mono text-slate-500 uppercase">UNREALIZED P&L</p>
              <p className={`text-sm font-mono tabular-nums font-semibold ${pnl.amount >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {pnl.amount >= 0 ? '+' : ''}${pnl.amount.toFixed(2)} ({pnl.amount >= 0 ? '+' : ''}{pnl.pct.toFixed(1)}%)
              </p>
            </div>
          )}
        </div>

        {/* Sparkline */}
        <div>
          <p className="text-[10px] font-mono text-slate-500 uppercase mb-2">MARKET PRICE · 90D</p>
          <PriceSparkline data={history} />
        </div>

        {/* Lifecycle */}
        <div>
          <p className="text-[10px] font-mono text-slate-500 uppercase mb-3">LIFECYCLE</p>
          {advanceMode === null
            ? <LifecycleTimeline card={card} onAdvance={setAdvanceMode} />
            : <AdvanceForm mode={advanceMode} onSubmit={handleAdvance} onCancel={() => setAdvanceMode(null)} />
          }
        </div>

        {/* Source */}
        {card.source !== 'manual' && (
          <div>
            <p className="text-[10px] font-mono text-slate-500 uppercase mb-1">SOURCE</p>
            <a
              href={card.source === 'alert' ? '/deals' : '/grade'}
              className="flex items-center gap-1 text-xs font-mono text-amber-400 hover:text-amber-300"
            >
              {card.source === 'alert' ? 'From Deal Alert' : 'From Pre-Grade Analysis'}
              <ExternalLink className="size-3" />
            </a>
          </div>
        )}

        {/* Value override */}
        <div>
          <p className="text-[10px] font-mono text-slate-500 uppercase mb-1">VALUE OVERRIDE</p>
          <div className="flex gap-2">
            <input
              type="number" step="0.01" value={overrideVal}
              onChange={(e) => setOverrideVal(e.target.value)}
              placeholder="Market value"
              className="flex-1 bg-slate-800 border border-slate-700 text-slate-100 text-xs font-mono px-2 py-1.5 rounded focus:outline-none focus:border-amber-400"
            />
            <button
              onClick={() => void patch({ current_value_override: overrideVal === '' ? null : parseFloat(overrideVal) })}
              className="text-[11px] font-mono text-amber-400 border border-amber-400/40 hover:border-amber-400 px-2 py-1.5 rounded"
            >
              SET
            </button>
            {card.current_value_override !== null && (
              <button
                onClick={() => { setOverrideVal(''); void patch({ current_value_override: null }) }}
                className="text-[11px] font-mono text-slate-500 hover:text-slate-300 px-2"
              >
                RESET
              </button>
            )}
          </div>
        </div>

        {/* Notes */}
        <div>
          <p className="text-[10px] font-mono text-slate-500 uppercase mb-1">NOTES</p>
          <textarea
            value={notesVal} onChange={(e) => setNotesVal(e.target.value)}
            onBlur={() => void patch({ notes: notesVal || null })}
            rows={3}
            className="w-full bg-slate-800 border border-slate-700 text-slate-100 text-xs font-mono px-2 py-1.5 rounded focus:outline-none focus:border-amber-400 resize-none"
            placeholder="Add notes…"
          />
        </div>
      </div>

      {/* Delete */}
      <div className="p-4 border-t border-slate-800 flex-shrink-0">
        <button
          onClick={() => { if (confirm('Remove this position?')) onDelete(card.id) }}
          className="w-full text-[11px] font-mono text-red-400 border border-red-400/30 hover:border-red-400 py-1.5 rounded transition-colors"
        >
          REMOVE POSITION
        </button>
      </div>
    </div>
  )
}

function AdvanceForm({ mode, onSubmit, onCancel }: {
  mode: 'submit' | 'grade' | 'sell'
  onSubmit: (mode: 'submit' | 'grade' | 'sell', payload: Record<string, unknown>) => void
  onCancel: () => void
}) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [grade, setGrade] = useState('')
  const [price, setPrice] = useState('')
  const inputCls = 'w-full bg-slate-900 border border-slate-700 text-slate-100 text-xs font-mono px-2 py-1.5 rounded focus:outline-none focus:border-amber-400'

  return (
    <div className="space-y-3 p-3 bg-slate-800 rounded border border-slate-700">
      <p className="text-[11px] font-mono text-amber-400 uppercase">
        {mode === 'submit' ? 'Mark as Submitted' : mode === 'grade' ? 'Enter Received Grade' : 'Record Sale'}
      </p>
      {mode === 'grade' && (
        <div>
          <label className="text-[10px] font-mono text-slate-500">PSA GRADE</label>
          <input type="number" min={1} max={10} value={grade} onChange={(e) => setGrade(e.target.value)} className={`mt-1 ${inputCls}`} placeholder="e.g. 9" />
        </div>
      )}
      {mode === 'sell' && (
        <div>
          <label className="text-[10px] font-mono text-slate-500">SALE PRICE ($)</label>
          <input type="number" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} className={`mt-1 ${inputCls}`} placeholder="e.g. 250.00" />
        </div>
      )}
      <div>
        <label className="text-[10px] font-mono text-slate-500">DATE</label>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={`mt-1 ${inputCls}`} />
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => {
            const p: Record<string, unknown> = { date }
            if (mode === 'grade') p.grade = parseInt(grade, 10)
            if (mode === 'sell') p.price = parseFloat(price)
            onSubmit(mode, p)
          }}
          className="flex-1 text-[11px] font-mono font-semibold text-slate-950 bg-amber-400 hover:bg-amber-300 py-1.5 rounded"
        >
          CONFIRM
        </button>
        <button onClick={onCancel} className="text-[11px] font-mono text-slate-400 hover:text-slate-200 px-3">
          CANCEL
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/portfolio/DetailPanel.tsx
git commit -m "feat: add DetailPanel component"
```

---

### Task 12: PositionsTable Component

**Files:**
- Create: `components/portfolio/PositionsTable.tsx`

- [ ] **Step 1: Write component**

```tsx
// components/portfolio/PositionsTable.tsx
'use client'

import { useState } from 'react'
import type { PortfolioCard } from '@/lib/portfolio/types'
import { resolveCurrentValue, unrealizedPnl } from '@/lib/portfolio/pnl'

const STATUS_LABEL: Record<string, string> = {
  raw_owned: 'RAW', submitted: 'SUBMITTED', graded_owned: 'GRADED', sold: 'SOLD',
}
const STATUS_COLOR: Record<string, string> = {
  raw_owned:    'text-blue-400 border-blue-400/40',
  submitted:    'text-amber-400 border-amber-400/40',
  graded_owned: 'text-green-400 border-green-400/40',
  sold:         'text-slate-500 border-slate-700',
}

type SortKey = 'player' | 'status' | 'raw_purchase_price' | 'value' | 'pnl' | 'age'

function daysHeld(d: string) {
  return Math.floor((Date.now() - new Date(d).getTime()) / 86_400_000)
}

interface Props {
  cards: PortfolioCard[]
  selectedId: string | null
  onSelect: (id: string) => void
}

export function PositionsTable({ cards, selectedId, onSelect }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('status')
  const [sortAsc, setSortAsc] = useState(true)

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortAsc((a) => !a)
    else { setSortKey(key); setSortAsc(true) }
  }

  const sorted = [...cards].sort((a, b) => {
    let av: number | string = 0, bv: number | string = 0
    if (sortKey === 'player') { av = a.player; bv = b.player }
    else if (sortKey === 'status') { av = a.status; bv = b.status }
    else if (sortKey === 'raw_purchase_price') { av = a.raw_purchase_price; bv = b.raw_purchase_price }
    else if (sortKey === 'value') { av = resolveCurrentValue(a) ?? -Infinity; bv = resolveCurrentValue(b) ?? -Infinity }
    else if (sortKey === 'pnl') { av = unrealizedPnl(a)?.pct ?? -Infinity; bv = unrealizedPnl(b)?.pct ?? -Infinity }
    else if (sortKey === 'age') { av = daysHeld(a.raw_purchase_date); bv = daysHeld(b.raw_purchase_date) }
    const cmp = typeof av === 'string' ? av.localeCompare(bv as string) : (av as number) - (bv as number)
    return sortAsc ? cmp : -cmp
  })

  if (cards.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <p className="text-sm font-mono text-slate-500">NO POSITIONS</p>
        <p className="text-xs font-mono text-slate-600 mt-1">Click + ADD POSITION to get started.</p>
      </div>
    )
  }

  function Th({ k, label }: { k: SortKey; label: string }) {
    const active = sortKey === k
    return (
      <th
        onClick={() => handleSort(k)}
        className={`text-left text-[10px] font-mono uppercase tracking-wider px-3 py-2 cursor-pointer select-none whitespace-nowrap ${active ? 'text-amber-400' : 'text-slate-500 hover:text-slate-300'}`}
      >
        {label}{active ? (sortAsc ? ' ↑' : ' ↓') : ''}
      </th>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead className="border-b border-slate-800 bg-slate-900/80 sticky top-0">
          <tr>
            <Th k="player" label="CARD" />
            <th className="text-left text-[10px] font-mono uppercase tracking-wider px-3 py-2 text-slate-500">GRADE</th>
            <Th k="status" label="STATUS" />
            <Th k="raw_purchase_price" label="COST" />
            <Th k="value" label="VALUE" />
            <Th k="pnl" label="P&L" />
            <Th k="age" label="AGE" />
          </tr>
        </thead>
        <tbody>
          {sorted.map((card) => {
            const value = resolveCurrentValue(card)
            const pnl = unrealizedPnl(card)
            const selected = card.id === selectedId
            return (
              <tr
                key={card.id}
                onClick={() => onSelect(card.id)}
                className={`border-b border-slate-800/50 cursor-pointer transition-colors ${selected ? 'bg-amber-400/5' : 'hover:bg-slate-800/40'}`}
              >
                <td className="px-3 py-2.5">
                  <p className="text-xs font-mono text-slate-100">{card.player}</p>
                  <p className="text-[10px] font-mono text-slate-500">{card.set_name}{card.year ? ` ${card.year}` : ''}</p>
                </td>
                <td className="px-3 py-2.5">
                  <span className={`text-[11px] font-mono font-semibold border px-1 py-0.5 rounded ${card.grade ? 'text-amber-400 border-amber-400/40' : 'text-slate-500 border-slate-700'}`}>
                    {card.grade ?? 'RAW'}
                  </span>
                </td>
                <td className="px-3 py-2.5">
                  <span className={`text-[10px] font-mono border px-1.5 py-0.5 rounded ${STATUS_COLOR[card.status]}`}>
                    {STATUS_LABEL[card.status]}
                  </span>
                </td>
                <td className="px-3 py-2.5 font-mono tabular-nums text-xs text-slate-300">${card.raw_purchase_price.toFixed(2)}</td>
                <td className="px-3 py-2.5 font-mono tabular-nums text-xs text-slate-300">
                  {value !== null ? `$${value.toFixed(2)}` : <span className="text-slate-600">—</span>}
                  {card.current_value_override !== null && <span className="text-amber-400 text-[9px] ml-0.5">●</span>}
                </td>
                <td className="px-3 py-2.5 font-mono tabular-nums text-xs">
                  {pnl ? (
                    <span className={pnl.amount >= 0 ? 'text-green-400' : 'text-red-400'}>
                      {pnl.amount >= 0 ? '+' : ''}{pnl.pct.toFixed(1)}%
                    </span>
                  ) : <span className="text-slate-600">—</span>}
                </td>
                <td className="px-3 py-2.5 font-mono text-xs text-slate-500">{daysHeld(card.raw_purchase_date)}d</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/portfolio/PositionsTable.tsx
git commit -m "feat: add PositionsTable component"
```

---

### Task 13: Portfolio Page Assembly

**Files:**
- Create: `components/portfolio/PortfolioClient.tsx`
- Modify: `app/(app)/portfolio/page.tsx`

- [ ] **Step 1: Write PortfolioClient (useSearchParams needs Suspense boundary)**

```tsx
// components/portfolio/PortfolioClient.tsx
'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import type { PortfolioCard } from '@/lib/portfolio/types'
import { PortfolioKpiBar } from './PortfolioKpiBar'
import { PositionsTable } from './PositionsTable'
import { DetailPanel } from './DetailPanel'
import { AddCardModal, type AddCardPrefill } from './AddCardModal'

export function PortfolioClient() {
  const [cards, setCards] = useState<PortfolioCard[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [prefill, setPrefill] = useState<AddCardPrefill | undefined>()
  const searchParams = useSearchParams()
  const router = useRouter()

  const load = useCallback(async () => {
    const res = await fetch('/api/portfolio')
    const data = (await res.json()) as PortfolioCard[]
    setCards(Array.isArray(data) ? data : [])
  }, [])

  useEffect(() => { void load() }, [load])

  // Deep-link prefill from /deals or /grade
  useEffect(() => {
    const addFrom = searchParams.get('addFrom')
    if (!addFrom) return
    if (addFrom === 'alert') {
      setPrefill({
        source: 'alert',
        alertId: searchParams.get('alertId') ?? undefined,
        player: searchParams.get('player') ?? undefined,
        setName: searchParams.get('set') ?? undefined,
        grade: searchParams.get('grade') ?? undefined,
        price: searchParams.get('price') ? parseFloat(searchParams.get('price')!) : undefined,
      })
    } else if (addFrom === 'analysis') {
      setPrefill({
        source: 'analysis',
        analysisId: searchParams.get('analysisId') ?? undefined,
        player: searchParams.get('player') ?? undefined,
        setName: searchParams.get('set') ?? undefined,
        grade: null,
      })
    }
    setModalOpen(true)
    router.replace('/portfolio')
  }, [searchParams, router])

  const selectedCard = cards.find((c) => c.id === selectedId) ?? null

  function handleUpdate(updated: PortfolioCard) {
    setCards((prev) => prev.map((c) => (c.id === updated.id ? updated : c)))
  }

  async function handleDelete(id: string) {
    await fetch(`/api/portfolio/${id}`, { method: 'DELETE' })
    setCards((prev) => prev.filter((c) => c.id !== id))
    if (selectedId === id) setSelectedId(null)
  }

  return (
    <div className="flex flex-col bg-slate-950" style={{ height: 'calc(100dvh - 56px)' }}>
      <PortfolioKpiBar onAdd={() => { setPrefill(undefined); setModalOpen(true) }} />
      <div className="flex flex-1 overflow-hidden">
        <div className={`overflow-y-auto ${selectedCard ? 'flex-1' : 'w-full'}`}>
          <PositionsTable
            cards={cards}
            selectedId={selectedId}
            onSelect={(id) => setSelectedId(selectedId === id ? null : id)}
          />
        </div>
        {selectedCard && (
          <div className="w-80 flex-shrink-0 overflow-y-auto">
            <DetailPanel
              card={selectedCard}
              onUpdate={handleUpdate}
              onDelete={(id) => void handleDelete(id)}
              onClose={() => setSelectedId(null)}
            />
          </div>
        )}
      </div>
      <AddCardModal
        open={modalOpen}
        prefill={prefill}
        onClose={() => { setModalOpen(false); setPrefill(undefined) }}
        onAdd={() => void load()}
      />
    </div>
  )
}
```

> **Note:** The `height: calc(100dvh - 56px)` assumes a 56px nav bar. If the layout doesn't look right, measure the actual AppNav height and adjust this value.

- [ ] **Step 2: Update portfolio page to wrap in Suspense**

```tsx
// app/(app)/portfolio/page.tsx
import { Suspense } from 'react'
import { PortfolioClient } from '@/components/portfolio/PortfolioClient'

export default function PortfolioPage() {
  return (
    <Suspense>
      <PortfolioClient />
    </Suspense>
  )
}
```

- [ ] **Step 3: Start dev server and verify the page loads**

```bash
npm run dev
```

Navigate to `http://localhost:3000/portfolio`. Expect:
- Dark terminal layout with KPI bar at top
- Empty "NO POSITIONS" state in the table
- "+ ADD POSITION" button works, opens modal
- Adding a position shows it in the table
- Clicking a row opens the detail panel on the right

- [ ] **Step 4: Commit**

```bash
git add components/portfolio/PortfolioClient.tsx app/(app)/portfolio/page.tsx
git commit -m "feat: assemble portfolio page with Bloomberg terminal layout"
```

---

### Task 14: AlertCard Integration

**Files:**
- Modify: `components/deals/AlertCard.tsx`

- [ ] **Step 1: Add "Mark as Purchased" button**

Add `useRouter` import and the button. The button navigates to `/portfolio` with prefill params so the modal auto-opens.

```tsx
// components/deals/AlertCard.tsx
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
        <img src={alert.image_url} alt={alert.card_title} className="w-12 h-12 object-cover rounded flex-shrink-0" />
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
```

> **Note:** `set_name` is added to the `Alert` interface — verify the `alerts` DB table has this column (it does: `set_name text`).

- [ ] **Step 2: Verify in browser**

Navigate to `/deals`. Each alert card should show a "Track Buy" button. Clicking it navigates to `/portfolio` with the modal pre-filled.

- [ ] **Step 3: Commit**

```bash
git add components/deals/AlertCard.tsx
git commit -m "feat: add Track Buy shortcut to AlertCard"
```

---

### Task 15: Recommendation Integration

**Files:**
- Modify: `components/grade/Recommendation.tsx`
- Modify: `app/(app)/grade/page.tsx`

- [ ] **Step 1: Add optional onTrack prop to Recommendation**

```tsx
// components/grade/Recommendation.tsx
import { cn } from '@/lib/utils'
import type { GradeAnalysisRow } from '@/lib/grade/types'

const CONFIG = {
  grade:    { label: 'GRADE IT',  color: 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300 border-green-300 dark:border-green-800' },
  uncertain:{ label: 'UNCERTAIN', color: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border-amber-300 dark:border-amber-800' },
  skip:     { label: 'SKIP',      color: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300 border-red-300 dark:border-red-800' },
}

interface Props {
  result: GradeAnalysisRow
  onTrack?: () => void
}

export function Recommendation({ result, onTrack }: Props) {
  if (!result.recommendation) return null
  const cfg = CONFIG[result.recommendation]
  const prob = result.break_even_prob ? (result.break_even_prob * 100).toFixed(0) : null
  const grade = result.break_even_grade

  const rationale =
    result.recommendation === 'grade'
      ? `Profitable at PSA ${grade} or above — ${prob}% probability`
      : result.recommendation === 'uncertain'
      ? `Grading may be profitable but outcome is uncertain — ${prob}% break-even probability`
      : 'Expected profit is negative at this card price and grading cost'

  return (
    <div className="space-y-2">
      <div className={cn('rounded-lg border px-6 py-4 flex items-center gap-4', cfg.color)}>
        <span className="text-lg font-bold tracking-wide">{cfg.label}</span>
        <span className="text-sm">{rationale}</span>
      </div>
      {onTrack && result.recommendation !== 'skip' && (
        <button
          onClick={onTrack}
          className="text-xs text-green-600 dark:text-green-400 hover:underline"
        >
          + Track this card in Portfolio
        </button>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Wire onTrack in grade/page.tsx**

In `app/(app)/grade/page.tsx`, add `useRouter` and pass `onTrack` to `Recommendation`:

```tsx
// Near top of GradePage component, after existing imports:
import { useRouter } from 'next/navigation'

// Inside GradePage function, add:
const router = useRouter()

// Update the Recommendation usage in the result stage:
<Recommendation
  result={result}
  onTrack={() => {
    const params = new URLSearchParams({
      addFrom: 'analysis',
      analysisId: result.id,
      player: result.card_key,
    })
    router.push(`/portfolio?${params.toString()}`)
  }}
/>
```

- [ ] **Step 3: Verify in browser**

Run a pre-grade analysis. On a GRADE IT or UNCERTAIN result, a "+ Track this card in Portfolio" link appears. Clicking it navigates to `/portfolio` with the modal open pre-filled with the card_key as the player field (user edits to clean up).

- [ ] **Step 4: Commit**

```bash
git add components/grade/Recommendation.tsx app/(app)/grade/page.tsx
git commit -m "feat: add Track this Card shortcut from Pre-Grade result"
```

---

### Task 16: Dashboard Wire-up

**Files:**
- Modify: `app/(app)/dashboard/page.tsx`

- [ ] **Step 1: Replace hardcoded KPI values with live data**

```tsx
// app/(app)/dashboard/page.tsx
'use client'

import { useEffect, useState } from 'react'
import { KpiCard } from '@/components/dashboard/KpiCard'
import { EmptyFeed } from '@/components/dashboard/EmptyFeed'
import type { PortfolioSummary } from '@/lib/portfolio/types'

export default function DashboardPage() {
  const [summary, setSummary] = useState<PortfolioSummary | null>(null)

  useEffect(() => {
    void fetch('/api/portfolio/summary')
      .then((r) => r.json())
      .then((d) => setSummary(d as PortfolioSummary))
  }, [])

  const portfolioValue = summary
    ? `$${summary.portfolioValue.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
    : '…'

  const totalRoi = summary
    ? `${summary.unrealizedPnlPct >= 0 ? '+' : ''}${summary.unrealizedPnlPct.toFixed(2)}%`
    : '…'

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
          Good morning, David.
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          {new Date().toLocaleDateString('en-US', {
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
          })}
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <KpiCard title="Portfolio Value" value={portfolioValue} />
        <KpiCard title="Active Deal Alerts" value={summary ? summary.activeAlertCount.toString() : '…'} />
        <KpiCard title="Open Sell Signals" value="0" />
        <KpiCard title="Total ROI" value={totalRoi} />
      </div>

      <div className="grid md:grid-cols-2 gap-6 mb-6">
        <div>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">Recent Deal Alerts</h2>
          <EmptyFeed title="No active deal alerts" message="Deal alerts will appear here when cards matching your criteria are found." />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">Top Sell Signals</h2>
          <EmptyFeed title="No sell signals" message="Sell signals will appear here when cards in your portfolio are ready to move." />
        </div>
      </div>

      <div>
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">Recent Activity</h2>
        <EmptyFeed title="No recent activity" message="Your activity will appear here." />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify in browser**

Navigate to `/dashboard`. Portfolio Value and Active Deal Alerts should now show live numbers (initially `$0` and the real alert count). After adding positions in Portfolio, Portfolio Value and Total ROI should update on the next dashboard visit.

- [ ] **Step 3: Run full test suite**

```bash
npx vitest run
```

Expected: all existing tests pass plus the new portfolio tests

- [ ] **Step 4: Final commit**

```bash
git add app/(app)/dashboard/page.tsx
git commit -m "feat: wire dashboard KPIs to live portfolio summary"
```
