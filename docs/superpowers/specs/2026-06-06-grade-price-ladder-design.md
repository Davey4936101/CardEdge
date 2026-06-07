# Grade Price Ladder

**Goal:** Show PSA 10/9/8/7/raw price ladder per portfolio card with grade premium multiples so users know exactly what upside exists before/after grading.

## Data Layer

**New table: `grade_price_cache`**
```sql
card_key TEXT PRIMARY KEY, raw_price NUMERIC, psa7_price NUMERIC, psa8_price NUMERIC,
psa9_price NUMERIC, psa10_price NUMERIC, comp_counts JSONB, fetched_at TIMESTAMPTZ
```
TTL: 24h (refetch on request if stale).

**`lib/grade/grade-ladder.ts`**
- 5 parallel eBay `fetchSoldComps` queries: `"PLAYER YEAR SET PSA 10"`, `PSA 9`, `PSA 8`, `PSA 7`, `"PLAYER YEAR SET"` (raw, no grade keyword)
- Calculate `calculateFairValue` on each bucket (requires ≥3 comps)
- Premiums = psa10/raw, psa9/raw (multiples)
- Upsert result to `grade_price_cache`

## API

`GET /api/portfolio/[id]/grade-ladder`
- Auth required + verify `user_id` ownership
- Return cached result if `fetched_at` < 24h ago, else fetch live
- Derives card metadata from `portfolio_cards` row (player, year, set_name)

## UI

**`components/portfolio/GradeLadder.tsx`**
- Compact table: Raw / PSA 7 / PSA 8 / PSA 9 / PSA 10 rows
- Each row: avg price + comp count + premium multiple (e.g. `3.2×`)
- Current card grade highlighted
- "Loading" skeleton + "No data" empty state

**`DetailPanel.tsx`** — add GradeLadder lazy-loaded below sparkline.
