# Portfolio Tracker — Design Spec
**Date:** 2026-06-05  
**Status:** Approved  
**Feature order:** #1 of 4 (Portfolio → Sell Signals → Auth → Fair Value v2)

---

## Overview

Portfolio Tracker is the connective tissue of CardEdge. It closes the gap between the two existing features (Deal Scanner, Pre-Grade Intelligence) and the investment outcome. Without it, users can find deals and assess grading ROI but have no way to record what they actually did, track P&L, or validate their analysis against reality.

The UI aesthetic is a Bloomberg terminal for sports cards: near-black background, amber accent, green/red gain/loss color language, monospace numbers, dense tabular layout.

---

## Lifecycle Model

A card moves through four statuses in a defined state machine:

```
raw_owned ──► submitted ──► graded_owned ──► sold
raw_owned ────────────────────────────────► sold   (raw flip)
```

Each transition is a single PATCH to the `status` column plus the relevant date field. No event log is needed at this scale.

| Status | Meaning |
|--------|---------|
| `raw_owned` | Purchased raw, in hand, not yet submitted |
| `submitted` | Sent to PSA, awaiting return |
| `graded_owned` | Returned from PSA with a grade, in hand |
| `sold` | Sold; position is closed |

---

## Data Model

### New table: `portfolio_cards`

```sql
create table portfolio_cards (
  id                       uuid primary key default gen_random_uuid(),
  user_id                  uuid,  -- null in v1; populated when auth (#4) ships
  card_key                 text not null,  -- matches price_cache + grade_analyses
  player                   text not null,
  set_name                 text not null,
  year                     text,
  grade                    text,           -- null if raw
  status                   text not null default 'raw_owned'
    check (status in ('raw_owned','submitted','graded_owned','sold')),

  -- Entry point
  source                   text not null default 'manual'
    check (source in ('manual','alert','analysis')),
  alert_id                 uuid references alerts(id) on delete set null,
  analysis_id              uuid references grade_analyses(id) on delete set null,

  -- Purchase (always required; price = raw buy price OR graded buy price)
  raw_purchase_price       numeric(10,2) not null,
  raw_purchase_date        date not null,

  -- Grading submission (status flag only — no tier in v1)
  submitted_at             date,

  -- Graded card returned
  received_grade           integer,
  received_at              date,

  -- Current value
  current_value_override   numeric(10,2),   -- user-pinned manual value
  current_value_fetched    numeric(10,2),   -- auto-refreshed from price_cache
  current_value_fetched_at timestamptz,

  -- Sale
  sold_price               numeric(10,2),
  sold_at                  date,

  notes                    text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create index idx_portfolio_cards_user on portfolio_cards (user_id);
create index idx_portfolio_cards_status on portfolio_cards (status);
create index idx_portfolio_cards_card_key on portfolio_cards (card_key);
```

### Cost basis

Cost basis = `raw_purchase_price`. Grading fees are not tracked in v1 (submission tracking is a status flag only, no tier recorded). A `grading_fee` column can be added when the Submission Tracker is built.

### Buying a graded card directly

Lifecycle type D includes buying an already-graded card (e.g., purchasing a PSA 10 on eBay). In this case, the Add Position modal shows a **Raw / Graded** toggle:

- **Raw** (default): status starts as `raw_owned`, grade is optional, lifecycle begins at purchase
- **Graded**: status starts as `graded_owned`, grade (PSA 1–10) is required, `received_grade` is set to the purchased grade, `received_at` = purchase date, `submitted_at` = purchase date (submission steps are skipped in the timeline)

### card_key update on grading

`card_key` is built from player + set + grade (matching `price_cache` and `grade_analyses`). When a card transitions from `submitted` → `graded_owned` (received grade entered), the PATCH endpoint must also update `card_key` to include the received grade. This ensures the daily value refresh looks up graded-card comps (e.g., `player-set-psa-10`) rather than raw-card comps. The `grade` column is updated at the same time.

### Current value resolution

For P&L calculations, current value resolves in this priority order:
1. `current_value_override` (user-pinned) if set
2. `current_value_fetched` (auto from price_cache) if set
3. `null` — show a loading skeleton, trigger a background fetch

For sold cards, P&L always uses `sold_price`.

---

## API Layer

All routes under `/api/portfolio`.

| Method | Route | Purpose |
|--------|-------|---------|
| `GET` | `/api/portfolio` | List all cards; compute current value + P&L per card |
| `GET` | `/api/portfolio/summary` | Aggregate KPIs for the dashboard |
| `POST` | `/api/portfolio` | Add a card (manual, alert, or analysis source) |
| `PATCH` | `/api/portfolio/[id]` | Advance status, edit fields, set/clear value override |
| `DELETE` | `/api/portfolio/[id]` | Remove a card |

### `/api/portfolio/summary` response shape

```ts
{
  portfolioValue: number       // sum of current_value for non-sold cards
  costBasis: number            // sum of raw_purchase_price for non-sold cards
  unrealizedPnl: number        // portfolioValue - costBasis
  unrealizedPnlPct: number     // (unrealizedPnl / costBasis) * 100
  realizedPnl: number          // sum of (sold_price - raw_purchase_price) for sold cards
  activeAlertCount: number     // COUNT of unread alerts (from alerts table)
  positionCount: number        // total non-sold cards
  statusBreakdown: {
    raw_owned: number
    submitted: number
    graded_owned: number
  }
}
```

---

## Inngest Cron: `portfolio-value-refresh`

Runs daily. For each `raw_owned` or `graded_owned` card where `current_value_override` is null and `current_value_fetched_at` is older than 24h (or null):

1. Look up `price_cache` rows by `card_key` (last 90 days)
2. Run `calculateFairValue()` from `lib/fair-value.ts` (already exists)
3. Write `current_value_fetched` + `current_value_fetched_at`

Same pattern as the deal scanner's comp refresh step. No new infrastructure needed.

---

## UI Structure

### Visual language (Bloomberg terminal)

| Token | Value |
|-------|-------|
| Page background | `slate-950` |
| Panel background | `slate-900` |
| Border | `slate-800` |
| Primary text | `slate-100` |
| Secondary text | `slate-400` |
| Accent | `amber-400` |
| Gain | `green-400` |
| Loss | `red-400` |
| Numbers | `font-mono tabular-nums` |

### Page layout: `/portfolio`

```
┌─────────────────────────────────────────────────────────────┐
│  KPI BAR  [Total Value]  [Cost Basis]  [Unrealized P&L]  [+ Add Position]  │
├──────────────────────────┬──────────────────────────────────┤
│  POSITIONS TABLE         │  DETAIL PANEL                    │
│  (click row to select)   │  (card detail or empty prompt)   │
│                          │                                  │
│  Card  Grade  Status     │  Price sparkline (90d)           │
│  Cost  Value  P&L  Age   │  Lifecycle timeline              │
│                          │  Advance status actions          │
│                          │  Linked alert / analysis badge   │
│                          │  Value override input            │
└──────────────────────────┴──────────────────────────────────┘
```

### KPI bar

Always visible at top of page. Five chips:

- **Total Value** — sum of current values, non-sold positions
- **Cost Basis** — sum of raw_purchase_price, non-sold positions  
- **Unrealized P&L** — `+$XXX (+XX.X%)` in green or `−$XXX (−XX.X%)` in red
- **Realized P&L** — from closed (sold) positions, same color logic
- **Positions** — `12 total · 3 submitted · 2 sold` breakdown

### Positions table (left panel)

Sortable by any column. Default sort: status (active first), then P&L descending.

| Column | Detail |
|--------|--------|
| Card | Player · Set · Year, two-line compact |
| Grade | `PSA 10` amber chip or `RAW` slate chip |
| Status | `raw_owned` blue · `submitted` amber · `graded_owned` green · `sold` slate |
| Cost | `$XX.XX` mono, right-aligned |
| Value | `$XX.XX` mono; `📌` icon if override active; skeleton if null |
| P&L | `+$XX (+XX%)` green or `−$XX (−XX%)` red |
| Age | `XXd` — days since raw_purchase_date |

Clicking a row loads the detail panel without a page navigation.

### Detail panel (right panel)

Shown when a row is selected. Contains:

1. **Card header** — player, set, year, grade chip
2. **Price sparkline** — 90-day price history from `price_cache` for this `card_key` (inline recharts `LineChart` via shadcn's chart primitives). If no `price_cache` rows exist for the card_key, renders an "No price history yet" empty state instead of an empty chart.
3. **Lifecycle timeline** — horizontal step indicator: Purchased → Submitted → Graded → Sold. Filled steps show the date; unfilled steps show the advance-status action button
4. **Advance status actions** — contextual to current status:
   - `raw_owned`: `Mark as Submitted` button (sets `submitted_at = today`, `status = 'submitted'`)
   - `submitted`: `Enter Received Grade` (number input + date, sets `received_grade`, `received_at`, `status = 'graded_owned'`)
   - `graded_owned`: `Record Sale` (price input + date, sets `sold_price`, `sold_at`, `status = 'sold'`)
   - `sold`: read-only, shows closed P&L summary
5. **Source badge** — `From Deal Alert` or `From Pre-Grade Analysis` with a link; hidden if `source = 'manual'`
6. **Value override** — text input pre-filled with `current_value_fetched`; saving writes `current_value_override`; a `Reset to market` link clears it
7. **Notes** — single textarea, saved on blur
8. **Delete** — small destructive button at bottom

### Add Position modal

Triggered by `+ Add Position` in the KPI bar (manual) or pre-filled from an alert or analysis. Fields:

- **Raw / Graded toggle** — determines starting status (`raw_owned` vs `graded_owned`)
- Player (text)
- Set (text)
- Year (text, optional)
- Grade — hidden when Raw; required PSA 1–10 dropdown when Graded
- Purchase Price ($)
- Purchase Date (date picker, defaults to today)
- Notes (optional textarea)

Pre-fill behavior:
- From alert: player, set, grade, price ← `listed_price`; toggle set to match grade (raw if grade = "Any")
- From analysis: player, set ← parsed from `card_key`; toggle = Raw (card was raw when analyzed)

---

## Connections to Existing Features

### Deal alerts → Portfolio

`components/deals/AlertCard.tsx` gets a secondary `Mark as Purchased` button below the existing listing CTA. Clicking opens the Add Position modal with the card fields and listed price pre-filled. On save, `alert_id` is stored on the portfolio card.

No changes to the alert data model. The FK `alert_id` on `portfolio_cards` is sufficient to show "this position came from alert X."

### Pre-grade analysis → Portfolio

`components/grade/Recommendation.tsx` gets a `Track this Card` button, shown only when `recommendation` is `'grade'` or `'uncertain'` (not `'skip'`). Clicking opens the Add Position modal pre-filled from the analysis. On save, `analysis_id` is stored.

The detail panel's source badge will then link back to the analysis history entry.

---

## Dashboard Wire-up

`app/(app)/dashboard/page.tsx` currently hardcodes all four KPI values. After this feature, it calls `GET /api/portfolio/summary` and maps:

| KPI card | Field |
|----------|-------|
| Portfolio Value | `portfolioValue` |
| Active Deal Alerts | `activeAlertCount` |
| Open Sell Signals | `0` (hardcoded until feature #3) |
| Total ROI | `unrealizedPnlPct` formatted as `+XX.XX%` |

The dashboard "Recent Deal Alerts" feed and "Top Sell Signals" feed remain as `EmptyFeed` stubs — those get wired in features #3 and the cleanup pass respectively.

---

## New Files

| Path | Purpose |
|------|---------|
| `supabase/migrations/003_portfolio_tracker.sql` | `portfolio_cards` table + indexes |
| `app/api/portfolio/route.ts` | GET list + POST add |
| `app/api/portfolio/[id]/route.ts` | PATCH update + DELETE |
| `app/api/portfolio/summary/route.ts` | Aggregate KPIs |
| `inngest/portfolio-value-refresh.ts` | Daily value refresh cron |
| `components/portfolio/PortfolioKpiBar.tsx` | Top KPI strip |
| `components/portfolio/PositionsTable.tsx` | Left-panel sortable table |
| `components/portfolio/DetailPanel.tsx` | Right-panel card detail |
| `components/portfolio/AddCardModal.tsx` | Add position form |
| `components/portfolio/LifecycleTimeline.tsx` | Step indicator in detail panel |
| `components/portfolio/PriceSparkline.tsx` | 90-day mini chart |

## Modified Files

| Path | Change |
|------|--------|
| `app/(app)/portfolio/page.tsx` | Replace empty state with Bloomberg terminal layout |
| `app/(app)/dashboard/page.tsx` | Wire KpiCards to `/api/portfolio/summary` |
| `components/deals/AlertCard.tsx` | Add `Mark as Purchased` button |
| `components/grade/Recommendation.tsx` | Add `Track this Card` button |
| `app/api/inngest/route.ts` | Register `portfolioValueRefresh` function alongside existing functions |

---

## Out of Scope (v1)

- Grading fee tracking (no tier on submission in v1)
- BGS / SGC support (PSA only throughout)
- Portfolio performance charts (time-series unrealized P&L curve) — deferred to cleanup pass
- Bulk import
- CSV export
