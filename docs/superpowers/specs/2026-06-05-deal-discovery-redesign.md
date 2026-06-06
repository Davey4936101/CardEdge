# Deal Discovery Redesign — Design Spec
**Date:** 2026-06-05  
**Status:** Approved  

---

## Overview

Two problems to solve in one pass:

1. **Data source** — Both eBay APIs the scanner used are dead. The Finding API was deprecated February 2025; the Browse API requires developer approval that hasn't come through. Replace both with RapidAPI-based eBay wrappers that need only a single `RAPIDAPI_KEY` env var.

2. **UX** — The current page leaves users asking "okay, now what?" The main job of this feature is: *see an underpriced card → decide if you want it → buy it*. Everything else (watchlists, scanner config) is setup, not the destination. The redesign surfaces the decision surface immediately and moves setup out of the way.

---

## Data Layer

### Two RapidAPI services, one key

Both services are subscribed to via a single RapidAPI account. One env var: `RAPIDAPI_KEY`.

| Purpose | Service | RapidAPI host |
|---------|---------|---------------|
| Active listings (replaces `browse.ts`) | Real-Time eBay Data (OpenWeb Ninja) | `real-time-ebay-data.p.rapidapi.com` |
| Sold comps (replaces `finding.ts`) | eBay Average Selling Price (Colin Daniels) | `ebay-average-selling-price.p.rapidapi.com` |

### New file: `lib/ebay/rapidapi.ts`

Replaces `lib/ebay/browse.ts` and `lib/ebay/finding.ts` for deal-scanning purposes. Exports the same two function signatures the scanner already calls:

```ts
export async function searchListings(query: string, maxPrice?: number): Promise<EbayListing[]>
export async function fetchSoldComps(keywords: string): Promise<SoldComp[]>
```

**`searchListings`** — GET `https://real-time-ebay-data.p.rapidapi.com/search-products` with `query`, `category_id=212` (Sports Trading Cards), `sort=newlyListed`. Returns items mapped to `EbayListing` shape: `{ itemId, title, price, imageUrl, listingUrl, endTime }`.

**`fetchSoldComps`** — POST `https://ebay-average-selling-price.p.rapidapi.com/findCompletedItems` with body `{ keywords, max_search_results: "240", category_id: "212", remove_outliers: true }`. Returns the `products` array mapped to `SoldComp` shape: `{ price, saleDate }`. Filters to items with a valid `date_sold` (completed/sold, not just ended).

Both functions throw on non-200 so the Inngest step surfaces errors cleanly.

### Scanner changes: `inngest/deal-scanner.ts`

- Change two imports to one: `import { searchListings, fetchSoldComps } from '@/lib/ebay/rapidapi'`
- After processing each watchlist, write `last_scanned_at = now()` to that watchlist row (enables the status bar in the UI)
- No other logic changes

### Grade feature fixup

`lib/ebay/finding.ts` (the eBay Finding API) was deprecated February 2025 — it's dead. Two grade modules import it silently:

- `lib/grade/grade-dist-cache.ts` — update import to `@/lib/ebay/rapidapi`
- `lib/grade/graded-comps.ts` — update import to `@/lib/ebay/rapidapi`

Same `fetchSoldComps` signature, no other changes needed. `lib/ebay/auth.ts` is kept — it's still used by `app/api/grade/ebay-images/route.ts` and `lib/grade/reference-images.ts` (image fetching via eBay Browse API; those require eBay OAuth and are separately gated on approval).

### Migration: `supabase/migrations/004_deal_discovery_redesign.sql`

```sql
alter table watchlists add column if not exists last_scanned_at timestamptz;
```

One line. The status bar queries `max(last_scanned_at)` across active watchlists.

### Environment variable

Add to `.env.local` and document in `.env.example`:
```
RAPIDAPI_KEY=your_key_here
```

---

## UI Redesign

### Page layout: `/deals`

**Before:** Two-column grid — alerts left, watchlists right (competing for attention).  
**After:** Full-width alert feed. Watchlists in a `Sheet` drawer (shadcn, already installed) behind a "Manage Watchlists" button in the page header.

```
┌─────────────────────────────────────────────────────────┐
│  Deal Discovery              [Manage Watchlists ▸]      │
│  Last scanned 3 min ago · 12 alerts today               │
│  ─────────────────────────────────────────────────────  │
│  Sort: [ROI ▼] [Newest] [Price]    Filter: [All] [New]  │
│  ─────────────────────────────────────────────────────  │
│  ┌──────────────────────────────────────────────────┐   │
│  │  +34% ROI  │  Mahomes 2018 Prizm · PSA 10        │   │
│  │            │  $52 listed  ·  $78 fair value       │   │
│  │            │  Ends in 4h 12m                      │   │
│  │            │  [BUY ON EBAY]  [Track Buy]          │   │
│  └──────────────────────────────────────────────────┘   │
│  ...                                                     │
└─────────────────────────────────────────────────────────┘
```

### Scanner status bar

Sits directly below the page header, above the sort/filter row. Computed from:
- `max(last_scanned_at)` across active watchlists → "Last scanned X min ago"
- `COUNT(*) WHERE created_at > today` from alerts → "N alerts today"

If no watchlists exist: hidden. If watchlists exist but never scanned: "Not yet scanned."

### Alert card redesign: `components/deals/AlertCard.tsx`

The card is a horizontal layout, optimised as a decision surface:

**Left column — ROI badge**  
Large, colour-coded chip: green ≥15%, amber 10–14%, red <10% (though scanner filters to min_roi anyway — this handles edge cases). Example: `+34%`.

**Middle column — Card info**  
- Title (truncated to 2 lines)  
- Grade chip (amber) if not "Any"  
- `$52 listed · $78 fair value` on one line, both values in mono font  
- Watchlist name + time ago (`Mahomes PSA 10 · 12 min ago`)

**Right column — Actions**  
- **Buy on eBay** — primary button (`bg-indigo-600 text-white`), opens listing URL in new tab  
- **Track Buy** — secondary ghost button (already implemented, routes to `/portfolio`)  
- Auction end time — if `end_time` exists: `Ends in 4h 12m` with red text when < 6h remaining

Clicking anywhere else on the card (outside the buttons) marks it as read (existing behaviour preserved).

### Sort and filter bar

Replaces the "Mark all read" button in the current header. Persistent in the UI above the feed:

- **Sort:** ROI % (default, desc) · Newest · Price (asc)
- **Filter:** All · Unread only
- **Mark all read** — moved to a ghost text button on the far right of this row, only shown when unread count > 0

All sort/filter state is local (useState) — no URL params needed.

Default: sort by ROI desc, show all. User's sort/filter selection is not persisted across page loads (YAGNI).

### Empty states

**No watchlists:**
```
No watchlists set up yet
Cards matching your criteria will appear here once you create a watchlist.
[Set up your first watchlist →]   ← opens the Watchlists drawer
```

**Watchlists exist, no alerts yet:**
```
No alerts yet
The scanner runs every 5 minutes. Check back shortly.
```

### Watchlist drawer

A `Sheet` (right side) containing the existing `WatchlistPanel` content unchanged. Triggered by the "Manage Watchlists" button in the page header. The drawer title is "Watchlists."

No changes to `WatchlistCard` or `WatchlistForm` — just moved inside a drawer instead of a page column.

---

## Files Changed

| File | Action |
|------|--------|
| `lib/ebay/rapidapi.ts` | Create — new data source |
| `lib/ebay/browse.ts` | Delete (replaced by rapidapi.ts) |
| `lib/ebay/finding.ts` | Delete (replaced by rapidapi.ts; all importers updated first) |
| `lib/ebay/auth.ts` | Keep — still used by grade image features |
| `lib/grade/grade-dist-cache.ts` | Modify — update import to rapidapi.ts |
| `lib/grade/graded-comps.ts` | Modify — update import to rapidapi.ts |
| `supabase/migrations/004_deal_discovery_redesign.sql` | Create |
| `inngest/deal-scanner.ts` | Modify — new import, write `last_scanned_at` |
| `app/(app)/deals/page.tsx` | Modify — full-width layout, drawer trigger |
| `components/deals/AlertFeed.tsx` | Modify — status bar, sort/filter, empty states |
| `components/deals/AlertCard.tsx` | Modify — ROI badge, Buy button, end time urgency |
| `components/deals/WatchlistPanel.tsx` | Modify — now renders inside Sheet drawer |
| `.env.local` | Modify — add `RAPIDAPI_KEY` |

---

## Out of Scope

- Pagination on alerts (100-item limit is fine for now)
- Persisting sort/filter preference
- Per-watchlist alert counts on WatchlistCard
- Multiple RapidAPI fallback providers
- Alert archiving/dismissal beyond existing read/unread
