# CardEdge Core Improvements — Implementation Plans
**Date:** 2026-06-07  
**Status:** Ready to implement  
**Context:** These are self-contained prompts to paste into a fresh Claude session. Each sub-project can be built independently. Build in order: 1 → 2 → 3, since 2 and 3 benefit from 1 being done first.

---

## Sub-Project 1: Card-Specific Comp Engine (Foundation Fix)

### Problem
`inngest/global-deal-scanner.ts` uses the **same broad query string** for both listing search and sold comps. Example: `"PSA 10 rookie card football Prizm"` finds listings for Mahomes, Herbert, Allen, and Burrow, then calculates fair value from the blended sold average of all four players' cards. Every ROI number in the deal feed is noise.

The `identifyCardFromTitle()` function already exists in `lib/grade/card-identify.ts` but only extracts year, card number, and a rough player name — it doesn't extract grade (PSA 10, BGS 9.5, etc.) or validate whether identification succeeded well enough to trust.

### What to Build

**Step 1 — Extend `lib/grade/card-identify.ts`**

Add grade extraction to the existing `CardIdentity` type and `identifyCardFromTitle()`:

```typescript
// Add to CardIdentity interface:
grade?: { grader: 'PSA' | 'BGS' | 'SGC'; score: number }

// Add extraction to identifyCardFromTitle():
const gradeMatch = title.match(/\b(PSA|BGS|SGC)\s*(\d+(?:\.\d+)?)\b/i)
if (gradeMatch) {
  identity.grade = { grader: gradeMatch[1].toUpperCase() as 'PSA'|'BGS'|'SGC', score: parseFloat(gradeMatch[2]) }
}
```

Also add a `confidenceScore()` helper that returns 0–1 based on how many fields were extracted (year + player + cardNumber + grade = full confidence). Threshold: only trust identities with confidence ≥ 0.6.

**Step 2 — New `lib/deals/comp-resolver.ts`**

```typescript
export interface ResolvedComps {
  cardKey: string          // e.g. "mahomes-2017-prizm-#177-psa10"
  query: string            // the specific query used
  comps: Comp[]
  fairValue: FairValueResult | null
  identity: CardIdentity
  identityConfidence: number
}

export async function resolveCompsForListing(
  listing: Listing
): Promise<ResolvedComps | null>
```

Logic inside:
1. Call `identifyCardFromTitle(listing.title)` — get identity + confidence
2. If confidence < 0.6, fall back to current behavior (broad query) but flag `lowConfidence: true`
3. Build specific query: `{year} {player} {set} #{cardNumber} {grader} {grade}` — only include fields that were confidently extracted
4. Check `price_cache` table for existing comps keyed by `cardKey` fresher than 4 hours
5. If stale/missing, call `fetchSoldComps(specificQuery)`
6. Store result in `price_cache` with the specific `cardKey`
7. Return `ResolvedComps`

**Step 3 — Rewrite `scanQuery()` in `inngest/global-deal-scanner.ts`**

Replace the current parallel fetch (same query for listings + comps) with:

```typescript
async function scanQuery(supabase, query, player, sport) {
  // 1. Fetch listings with broad query (unchanged)
  const listings = await searchListings(query)
  
  // 2. For each listing, resolve card-specific comps
  const resolvedListings = await Promise.all(
    listings.map(async (listing) => {
      const resolved = await resolveCompsForListing(listing)
      if (!resolved || !resolved.fairValue) return null
      
      const roi = calculateRoiPct(listing.price, resolved.fairValue.value)
      const score = dealScore(roi, listing.endTime, listing.isGraded)
      
      return {
        ...listing,
        cardKey: resolved.cardKey,
        fairValue: resolved.fairValue.value,
        roi,
        score,
        identityConfidence: resolved.identityConfidence,
      }
    })
  )
  
  // 3. Filter out nulls and low-score deals (same as before)
  const deals = resolvedListings.filter(Boolean).filter(d => d.score >= 10)
  
  // 4. Upsert to deal_alerts (same as before)
  // ...
}
```

**Step 4 — Rate limiting**

`resolveCompsForListing()` calls `fetchSoldComps()` per listing. The global scanner processes ~13 queries × ~20 listings = ~260 listings per run (every 30 min). Add a simple in-memory rate limiter or use the existing `price_cache` 4-hour TTL to prevent hammering the eBay API. If a `cardKey` has fresh comps cached, skip the API call entirely.

### Files to Touch
- `lib/grade/card-identify.ts` — extend with grade extraction + confidence score
- `lib/deals/comp-resolver.ts` — **NEW FILE** — the specific comp resolution logic
- `inngest/global-deal-scanner.ts` — rewrite `scanQuery()` to use `resolveCompsForListing()`
- No migrations needed (uses existing `price_cache` table from `001_live_deal_scanner.sql`)

### Acceptance Criteria
- A Mahomes PSA 10 listing's ROI is calculated against Mahomes PSA 10 sold comps, not a blended population
- The `price_cache` table accumulates per-card comp history (usable for sparklines later)
- Low-confidence identifications are flagged but not dropped (degrade gracefully)
- Global scanner run time does not increase more than 2× (cache hits keep it fast)

---

## Sub-Project 2: PSA Population Report Integration

### Problem
`lib/grade/grade-distribution.ts` uses `FLAT_PRIOR = { 10: 0.08, 9: 0.50, 8: 0.30, 7: 0.12 }` for every single card. A 2017 Mahomes Prizm Silver PSA population is radically different from a 1952 Topps Mantle. The Pre-Grade EV engine gives the same grade probability to both — making EV recommendations unreliable.

PSA has a public API: `https://www.psacard.com/publicapi/` — OAuth2, 100 free calls/day on the free tier. The endpoint that matters is `/certifications/{number}/populationreport` for a specific cert, but more useful is searching by player/year/set to get population totals. The psacard.com/pop page is also scrapeable as a fallback.

### What to Build

**Step 1 — Migration `009_psa_pop_cache.sql`**

```sql
CREATE TABLE psa_pop_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  card_key text NOT NULL UNIQUE,      -- e.g. "mahomes-2017-prizm-#177"
  player_name text,
  year int,
  set_name text,
  card_number text,
  
  -- Population counts by grade
  pop_10 int DEFAULT 0,
  pop_9 int DEFAULT 0,
  pop_8 int DEFAULT 0,
  pop_7 int DEFAULT 0,
  pop_total int DEFAULT 0,
  
  -- Trend tracking (for dilution alerts)
  prev_pop_10 int,                    -- snapshot from previous fetch
  prev_pop_total int,
  trend_fetched_at timestamptz,
  
  fetched_at timestamptz DEFAULT now(),
  source text DEFAULT 'psa_api',      -- 'psa_api' | 'scrape'
  CONSTRAINT psa_pop_cache_card_key_unique UNIQUE (card_key)
);

CREATE INDEX psa_pop_cache_player ON psa_pop_cache(player_name);
CREATE INDEX psa_pop_cache_fetched ON psa_pop_cache(fetched_at);
```

**Step 2 — New `lib/grade/psa-pop.ts`**

```typescript
export interface PsaPopData {
  cardKey: string
  pop10: number
  pop9: number
  pop8: number
  pop7: number
  popTotal: number
  fetchedAt: Date
  source: 'psa_api' | 'scrape' | 'not_found'
}

export function computePriorFromPop(pop: PsaPopData): GradeDistribution {
  const total = pop.pop10 + pop.pop9 + pop.pop8 + pop.pop7
  if (total < 10) return FLAT_PRIOR  // not enough data, fall back
  return {
    10: pop.pop10 / total,
    9: pop.pop9 / total,
    8: pop.pop8 / total,
    7: pop.pop7 / total,
  }
}

export async function fetchPsaPop(
  identity: CardIdentity,
  supabase: SupabaseClient
): Promise<PsaPopData>
```

Fetch order inside `fetchPsaPop()`:
1. Check `psa_pop_cache` by `card_key` — if fresher than 24 hours, return cached
2. Try PSA Public API: `GET https://www.psacard.com/publicapi/cert/GetPopulationReport` with OAuth token (stored as `PSA_API_TOKEN` env var)
3. If API fails or no token, scrape `https://www.psacard.com/pop/search?q={player}+{year}+{set}` using `fetch()` + Cheerio (same pattern as `lib/ebay/rapidapi.ts` HTML fallback)
4. If both fail, return `source: 'not_found'` and cache that result for 6 hours (so we don't retry constantly)
5. Save to `psa_pop_cache` table

**Step 3 — Integrate into Pre-Grade pipeline (`lib/grade/pipeline.ts`)**

In Step 4 of the pipeline ("reference images + prior"), replace the FLAT_PRIOR with:

```typescript
// Current (Step 4 in pipeline.ts):
const prior = FLAT_PRIOR

// Replace with:
const popData = await fetchPsaPop(cardIdentity, supabase)
const prior = computePriorFromPop(popData)
// popData.source goes into pipeline metadata so UI can show "based on PSA pop data"
```

The rest of the Bayesian pipeline is unchanged — it just gets a better starting point.

**Step 4 — Pop monitoring Inngest function**

New file `inngest/pop-monitor.ts`:

```typescript
export const popMonitorFunction = inngest.createFunction(
  { id: 'pop-monitor', name: 'PSA Population Monitor' },
  { cron: '0 6 * * *' },  // daily at 6am
  async ({ step }) => {
    // 1. Load all cards in portfolio (from portfolio_cards table)
    // 2. For each, fetch current PSA pop via fetchPsaPop()
    // 3. Compare pop10 and popTotal to prev_pop_10 / prev_pop_total in cache
    // 4. If pop10 increased by >20% OR popTotal increased by >50%, create a dilution alert:
    //    INSERT into player_alerts (user_id, portfolio_card_id, event_type='POP_DILUTION', ...)
    //    with message like: "Mahomes Prizm PSA 10 pop jumped from 320 → 540 (+69%)"
    // 5. Update prev_pop_10 and prev_pop_total, set trend_fetched_at = now()
  }
)
```

Register the new function in `inngest/client.ts` (or wherever functions are exported).

**Step 5 — Surface pop data in UI**

In the Pre-Grade result component (wherever grade probabilities are shown):
- Show "Based on PSA pop data (2,340 graded)" when `source === 'psa_api'` or `'scrape'`
- Show "Using baseline averages" when `source === 'not_found'`
- In Portfolio, show pop count next to each holding (small gray text: "PSA 10 pop: 340")

### Files to Touch
- `supabase/migrations/009_psa_pop_cache.sql` — **NEW**
- `lib/grade/psa-pop.ts` — **NEW**
- `lib/grade/grade-distribution.ts` — export `FLAT_PRIOR` and `GradeDistribution` type (may already be exported; just ensure)
- `lib/grade/pipeline.ts` — Step 4: replace `FLAT_PRIOR` with `computePriorFromPop()`
- `inngest/pop-monitor.ts` — **NEW**
- `inngest/client.ts` (or equivalent exports file) — register `popMonitorFunction`
- Relevant Pre-Grade UI component — show pop source attribution

### Environment Variables Needed
```
PSA_API_TOKEN=<oauth token from psacard.com developer portal>
```
If this isn't available, the scrape fallback handles it. The feature degrades gracefully without the env var.

### Acceptance Criteria
- Pre-Grade EV results show different grade probabilities for a 1986 Fleer Jordan vs a 2020 Mahomes Prizm
- `psa_pop_cache` table is populated after running the Pre-Grade tool on any card with PSA pop data
- Portfolio page shows pop count for each graded card
- Daily pop monitor creates alerts for cards with dilution events
- Falls back to FLAT_PRIOR gracefully when PSA data is unavailable

---

## Sub-Project 3: The Verdict Engine

### Problem
All the signals exist — ROI vs fair value, player sentiment from `player_events`, PSA pop trend, listing urgency — but they live on separate pages and are never synthesized. A user has to cross-reference the Deals page (ROI%), the Portfolio page (sell signals), and their own knowledge of player news to make a decision. The product promises "what should you do right now and why?" but doesn't answer that question anywhere.

No existing tool in the market (Market Movers, Card Ladder, Alt, GemRate) does multi-signal synthesis into a structured verdict. This is the Bloomberg Terminal differentiator.

### What to Build

**Step 1 — New `lib/intelligence/verdict-engine.ts`**

```typescript
export type VerdictAction = 'STRONG BUY' | 'BUY' | 'WATCH' | 'HOLD' | 'SELL' | 'STRONG SELL'
export type VerdictConfidence = 'HIGH' | 'MEDIUM' | 'LOW'

export interface VerdictInput {
  // Price signal (required)
  listedPrice?: number       // for deal verdicts
  fairValue: number
  
  // Identity
  cardKey: string
  playerName: string
  
  // Optional enrichment signals
  psaPop?: PsaPopData                // from Sub-Project 2
  popTrend?: 'DILUTING' | 'STABLE' | 'SCARCE'  // derived from prev vs current pop
  playerEvents?: PlayerEvent[]        // from player_events table
  seasonalWindow?: SeasonalWindow     // draft season, playoffs, etc.
  
  // For portfolio sell verdicts
  costBasis?: number
  daysHeld?: number
  
  // Metadata
  identityConfidence?: number        // from Sub-Project 1
}

export interface Verdict {
  action: VerdictAction
  confidence: VerdictConfidence
  headline: string                   // one punchy sentence: "Strong buy — 34% below fair value with bullish player news"
  reasons: VerdictReason[]           // ordered by signal strength
  urgency?: string                   // "Ending in 2h 14m" | "PSA 10 pop spiking" | undefined
  priceTarget?: number               // suggested buy-at or sell-at price
}

export interface VerdictReason {
  signal: 'PRICE' | 'POP' | 'PLAYER' | 'SEASONAL' | 'URGENCY' | 'HOLD_TIME'
  direction: 'BULLISH' | 'BEARISH' | 'NEUTRAL'
  text: string                       // "34% below 90-day fair value ($289 vs $437 avg)"
  weight: number                     // 0–1, used for confidence calculation
}

export function generateVerdict(input: VerdictInput): Verdict
```

**Verdict logic (inside `generateVerdict()`):**

Build `VerdictReason[]` by evaluating each available signal:

```
PRICE signal:
  roi = (fairValue - listedPrice) / fairValue * 100  [or (currentValue - cost) / cost for portfolio]
  > 25%  → BULLISH, weight 1.0, text "X% below fair value"
  15-25% → BULLISH, weight 0.7
  5-15%  → NEUTRAL, weight 0.3
  < 5%   → BEARISH, weight 0.1

POP signal (if psaPop present):
  DILUTING → BEARISH, weight 0.5, text "PSA 10 pop up X% — supply expanding"
  SCARCE   → BULLISH, weight 0.4, text "Low pop count (N) — scarce inventory"
  STABLE   → NEUTRAL, weight 0.1

PLAYER signal (if playerEvents present, look at last 14 days):
  net_sentiment = sum of (severity * sentiment_multiplier) for recent events
  net > 0.5  → BULLISH, weight 0.6, text "Recent [event_type]: [description]"
  net < -0.5 → BEARISH, weight 0.6
  else       → NEUTRAL, weight 0.1

SEASONAL signal (if seasonalWindow present):
  IN_WINDOW   → BULLISH, weight 0.3, text "NFL draft window (historically +15-20%)"
  NEAR_WINDOW → NEUTRAL, weight 0.1
  OFF_SEASON  → BEARISH, weight 0.2

URGENCY signal (if listing endTime present):
  < 6h  → BULLISH, weight 0.3, text "Ending in X — act now or lose it"
  < 24h → BULLISH, weight 0.15
  else  → no urgency reason added

HOLD_TIME signal (portfolio only, if costBasis + daysHeld present):
  daysHeld >= 365 → BEARISH, weight 0.3, text "Held 1yr+ — consider tax + opportunity cost"
  daysHeld < 30  → NEUTRAL (too early), weight 0.1
```

**Action derivation:**
```
bullishWeight = sum of weights where direction === 'BULLISH'
bearishWeight = sum of weights where direction === 'BEARISH'
netScore = bullishWeight - bearishWeight

netScore >= 1.2  → STRONG BUY
netScore >= 0.6  → BUY
netScore >= 0.2  → WATCH
netScore >= -0.2 → HOLD
netScore >= -0.6 → SELL
netScore < -0.6  → STRONG SELL

confidence = HIGH if top signal weight >= 0.8, MEDIUM if >= 0.5, LOW otherwise
```

**Headline generation:**
Simple template, not LLM-powered (fast, no latency, no cost):
```typescript
const topBullish = reasons.filter(r => r.direction === 'BULLISH').sort((a,b) => b.weight - a.weight)[0]
const topBearish = reasons.filter(r => r.direction === 'BEARISH').sort((a,b) => b.weight - a.weight)[0]
// "Strong buy — 34% below fair value with bullish player news"
// "Sell — PSA 10 pop diluting and player sentiment negative"
```

**Step 2 — Wire into Deal Cards**

In the deal card component (wherever deal ROI is displayed), call `generateVerdict()` with available signals and replace the plain ROI% badge with:
- Verdict action badge (color-coded: green=buy, yellow=watch, red=sell)
- First reason text below it
- Urgency pill if present

The full `reasons[]` array goes into the deal detail sheet/modal.

**Step 3 — Wire into Portfolio Sell Signals**

Replace `computeSellSignal()` in `lib/portfolio/sell-signal.ts` with a call to `generateVerdict()`:
```typescript
export function computeSellSignal(card: PortfolioCard, pop?: PsaPopData, events?: PlayerEvent[]): Verdict {
  return generateVerdict({
    fairValue: card.currentValue,
    costBasis: card.costBasis,
    daysHeld: card.daysHeld,
    cardKey: card.cardKey,
    playerName: card.playerName,
    psaPop: pop,
    playerEvents: events,
  })
}
```

**Step 4 — Wire into Global Deal Scanner**

In `inngest/global-deal-scanner.ts`, after resolving comps (Sub-Project 1), generate a verdict:
```typescript
const verdict = generateVerdict({
  listedPrice: listing.price,
  fairValue: resolved.fairValue.value,
  cardKey: resolved.cardKey,
  playerName: identity.playerName,
  playerEvents: await getRecentPlayerEvents(supabase, identity.playerName),
})
// Store verdict.action + verdict.headline in the deal_alerts row
// Filter: only surface deals where verdict.action is 'BUY' or better
```

### Files to Touch
- `lib/intelligence/verdict-engine.ts` — **NEW FILE** (core logic, pure functions, no DB calls)
- `lib/intelligence/seasonal-windows.ts` — **NEW FILE** (static calendar: NFL draft Apr-May, NBA draft Jun, playoffs Apr-Jun, etc.)
- `lib/portfolio/sell-signal.ts` — replace `computeSellSignal()` with verdict wrapper
- `inngest/global-deal-scanner.ts` — generate + store verdict per deal (builds on Sub-Project 1)
- Deal card UI component — render verdict badge instead of plain ROI%
- Deal detail modal/sheet — render full `reasons[]` list
- Portfolio card component — render verdict instead of legacy sell signal

### No New Migrations Needed
The verdict is computed on-the-fly and optionally stored in the existing `deal_alerts` table as new columns (`verdict_action text`, `verdict_headline text`). If you want to persist it, add a migration to alter the table — but this can be deferred; the verdict renders fine without persistence.

### Acceptance Criteria
- Deal cards show a color-coded action badge (STRONG BUY / BUY / WATCH / HOLD) instead of raw ROI%
- Clicking a deal shows the full `reasons[]` breakdown
- Portfolio cards show the same verdict as the sell signal
- `generateVerdict()` runs in <1ms (pure function, no I/O)
- A deal with positive ROI but bearish player sentiment and diluting pop shows WATCH, not BUY

---

## Build Order & Dependencies

```
Sub-Project 1 (Comp Engine)    ──►  Sub-Project 2 (PSA Pop)   ──►  Sub-Project 3 (Verdict Engine)
  No dependencies                    No hard dep on #1              Best with #1 + #2 done
  Foundation for everything          Improves Pre-Grade EV          Uses all available signals
  ~1 day                             ~1-2 days                      ~1 day
```

**Sub-Project 1** can be built standalone. It fixes the most important data quality bug.  
**Sub-Project 2** can be built standalone but the Pop signal in the Verdict Engine (Sub-Project 3) is richer when #2 is done.  
**Sub-Project 3** degrades gracefully if #1 or #2 isn't done yet — it just has fewer signals to synthesize.

## Key Files for Reference (Read Before Implementing)

```
lib/grade/card-identify.ts         — existing regex-based card identity extraction
lib/grade/grade-distribution.ts   — FLAT_PRIOR definition + GradeDistribution type
lib/grade/pipeline.ts              — 8-step Pre-Grade pipeline, inject pop at step 4
lib/grade/ev-engine.ts             — PSA EV tiers and breakeven logic
lib/deals/deal-score.ts            — current dealScore() + recommendedAction() thresholds
lib/portfolio/sell-signal.ts       — current single-signal sell logic (replace in Sub-Project 3)
lib/fair-value.ts                  — calculateFairValue() + calculateRoiPct() (unchanged)
lib/ebay/rapidapi.ts               — fetchSoldComps(), searchListings(), IQR outlier removal
inngest/global-deal-scanner.ts     — GLOBAL_SCAN_QUERIES + scanQuery() (rewrite in Sub-Project 1)
supabase/migrations/001_live_deal_scanner.sql  — price_cache schema
supabase/migrations/007_player_intel_engine.sql — player_events + player_alerts schema
```
