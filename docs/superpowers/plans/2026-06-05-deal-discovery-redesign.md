# Deal Discovery Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace dead eBay APIs with RapidAPI scrapers and redesign the deals page so the primary job — see underpriced card → decide → buy — is immediately obvious.

**Architecture:** A single `lib/ebay/rapidapi.ts` replaces both `browse.ts` (Browse API, dead) and `finding.ts` (Finding API, deprecated Feb 2025). The deals page becomes full-width alert feed with a Sheet drawer for watchlist management. AlertCard becomes a horizontal decision surface with a prominent ROI badge and Buy button.

**Tech Stack:** Next.js 16 App Router, RapidAPI (Real-Time eBay Data + eBay Average Selling Price), Inngest, Supabase, shadcn/ui Sheet (already installed at `components/ui/sheet.tsx`, uses `@base-ui/react/dialog` under the hood), Tailwind CSS, TypeScript

---

## File Map

| File | Action |
|------|--------|
| `lib/ebay/rapidapi.ts` | **Create** — new unified API client |
| `lib/ebay/browse.ts` | **Delete** — replaced by rapidapi.ts |
| `lib/ebay/finding.ts` | **Delete** — replaced by rapidapi.ts |
| `lib/ebay/auth.ts` | **Keep** — still used by grade image features |
| `lib/grade/grade-dist-cache.ts` | **Modify** — rewrite `fetchFromEbay` to use `searchListings` from rapidapi |
| `lib/grade/graded-comps.ts` | **Modify** — update import to rapidapi |
| `inngest/deal-scanner.ts` | **Modify** — update imports; write `last_scanned_at` per watchlist |
| `supabase/migrations/004_deal_discovery_redesign.sql` | **Create** — adds `last_scanned_at` to watchlists |
| `app/api/deals/status/route.ts` | **Create** — status bar data endpoint |
| `app/(app)/deals/page.tsx` | **Modify** — 'use client', full-width layout, Sheet drawer |
| `components/deals/AlertFeed.tsx` | **Modify** — status bar, sort/filter bar, updated empty states |
| `components/deals/AlertCard.tsx` | **Modify** — ROI badge, Buy button, end-time urgency |
| `components/deals/WatchlistPanel.tsx` | **No changes** — renders inside Sheet as-is |
| `.env.local` | **Modify** — add `RAPIDAPI_KEY` |

---

## Task 1: Create `lib/ebay/rapidapi.ts`

**Files:**
- Create: `lib/ebay/rapidapi.ts`
- Modify: `.env.local`

**Context:** Two eBay APIs used by this project are dead. `lib/ebay/browse.ts` calls the eBay Browse API which requires unapproved developer access. `lib/ebay/finding.ts` calls the eBay Finding API which was deprecated February 2025. Both fail silently in production. Replace them with two RapidAPI services that work with a single `RAPIDAPI_KEY` env var. Downstream callers (`inngest/deal-scanner.ts`, `lib/grade/graded-comps.ts`) import `searchListings` and `fetchSoldComps` — the new file exports the same signatures so no callers break.

> **Before writing any code:** Read `node_modules/next/dist/docs/index.md` to orient yourself with this version of Next.js — APIs and conventions may differ from training data.

> **Verify API shapes:** Before writing the implementation, open the RapidAPI playgrounds to see actual response shapes:
> - Real-Time eBay Data: `https://rapidapi.com/openwebninjas/api/real-time-ebay-data` — test the `/search-products` endpoint
> - eBay Average Selling Price: `https://rapidapi.com/colin.djdj/api/ebay-average-selling-price` — test the `POST /findCompletedItems` endpoint
>
> Map the actual response fields to the `EbayListing` and `SoldComp` interfaces defined below.

- [ ] **Step 1: Write `lib/ebay/rapidapi.ts`**

```ts
// lib/ebay/rapidapi.ts
export interface EbayListing {
  itemId: string
  title: string
  price: number
  imageUrl: string | null
  listingUrl: string
  endTime: string | null
}

export interface SoldComp {
  price: number
  saleDate: Date
}

function rapidApiHeaders() {
  const key = process.env.RAPIDAPI_KEY
  if (!key) throw new Error('RAPIDAPI_KEY env var is not set')
  return {
    'x-rapidapi-key': key,
    'Content-Type': 'application/json',
  }
}

// Real-Time eBay Data (OpenWeb Ninja) — active listings
// Host: real-time-ebay-data.p.rapidapi.com
// Verify exact field names against https://rapidapi.com/openwebninjas/api/real-time-ebay-data
export async function searchListings(
  query: string,
  maxPrice?: number
): Promise<EbayListing[]> {
  const params = new URLSearchParams({
    keywords: query,
    category_id: '212',
    sort_by: 'newlyListed',
    limit: '50',
  })

  const res = await fetch(
    `https://real-time-ebay-data.p.rapidapi.com/search-products?${params}`,
    {
      headers: {
        ...rapidApiHeaders(),
        'x-rapidapi-host': 'real-time-ebay-data.p.rapidapi.com',
      },
    }
  )

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`RapidAPI search ${res.status}: ${text}`)
  }

  // Adjust field names to match the actual API response from the playground
  type RawItem = {
    item_id?: string
    itemId?: string
    title?: string
    product_title?: string
    price?: number | string | { value?: string }
    product_price?: number | string
    image?: string | { imageUrl?: string }
    image_url?: string
    product_image?: string
    url?: string
    itemWebUrl?: string
    product_url?: string
    end_time?: string
    auction_end_date?: string
    itemEndDate?: string
  }

  const data = (await res.json()) as {
    products?: RawItem[]
    searchResults?: RawItem[]
    items?: RawItem[]
    itemSummaries?: RawItem[]
  }

  const items =
    data.products ??
    data.searchResults ??
    data.items ??
    data.itemSummaries ??
    []

  return items
    .map((item): EbayListing | null => {
      const id = item.item_id ?? item.itemId ?? ''
      const title = item.title ?? item.product_title ?? ''
      const rawPrice =
        item.product_price ??
        (typeof item.price === 'object' ? item.price?.value : item.price)
      const price = parseFloat(String(rawPrice ?? '0'))
      const imageUrl =
        typeof item.image === 'string'
          ? item.image
          : item.image?.imageUrl ??
            item.image_url ??
            item.product_image ??
            null
      const listingUrl = item.url ?? item.itemWebUrl ?? item.product_url ?? ''
      const endTime =
        item.end_time ?? item.auction_end_date ?? item.itemEndDate ?? null

      if (!id || !title || !listingUrl || isNaN(price) || price <= 0) return null

      return { itemId: id, title, price, imageUrl, listingUrl, endTime }
    })
    .filter((item): item is EbayListing => {
      if (item === null) return false
      if (maxPrice !== undefined && item.price > maxPrice) return false
      return true
    })
}

// eBay Average Selling Price (Colin Daniels) — sold comps
// Host: ebay-average-selling-price.p.rapidapi.com
// Verify exact field names against https://rapidapi.com/colin.djdj/api/ebay-average-selling-price
export async function fetchSoldComps(keywords: string): Promise<SoldComp[]> {
  const res = await fetch(
    'https://ebay-average-selling-price.p.rapidapi.com/findCompletedItems',
    {
      method: 'POST',
      headers: {
        ...rapidApiHeaders(),
        'x-rapidapi-host': 'ebay-average-selling-price.p.rapidapi.com',
      },
      body: JSON.stringify({
        keywords,
        max_search_results: '240',
        category_id: '212',
        remove_outliers: true,
      }),
    }
  )

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`RapidAPI sold comps ${res.status}: ${text}`)
  }

  type RawProduct = {
    sold_price?: number | string
    price?: number | string
    date_sold?: string
    end_date?: string
    sold_date?: string
  }

  const data = (await res.json()) as { products?: RawProduct[] }

  return (data.products ?? [])
    .filter((p): boolean => {
      const dateSold = p.date_sold ?? p.end_date ?? p.sold_date
      return Boolean(dateSold)
    })
    .map((p): SoldComp => ({
      price: parseFloat(String(p.sold_price ?? p.price ?? '0')),
      saleDate: new Date(p.date_sold ?? p.end_date ?? p.sold_date ?? ''),
    }))
    .filter((c) => c.price > 0 && !isNaN(c.saleDate.getTime()))
}
```

- [ ] **Step 2: Add `RAPIDAPI_KEY` to `.env.local`**

Add this line to `.env.local` (create the file if it doesn't exist):
```
RAPIDAPI_KEY=your_rapidapi_key_here
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```
Expected: no errors related to `lib/ebay/rapidapi.ts`.

- [ ] **Step 4: Commit**

```bash
git add lib/ebay/rapidapi.ts .env.local
git commit -m "feat: add lib/ebay/rapidapi.ts replacing dead eBay browse + finding APIs"
```

---

## Task 2: Update All Importers and Delete Dead Files

**Files:**
- Modify: `lib/grade/grade-dist-cache.ts`
- Modify: `lib/grade/graded-comps.ts`
- Modify: `inngest/deal-scanner.ts`
- Delete: `lib/ebay/browse.ts`
- Delete: `lib/ebay/finding.ts`
- Create: `supabase/migrations/004_deal_discovery_redesign.sql`

**Context:** Three files currently import from `browse.ts` or `finding.ts`. Update them to use `rapidapi.ts` instead, then delete the old files. The migration adds `last_scanned_at timestamptz` to watchlists — the scanner writes this after processing each watchlist.

**Important:** `lib/grade/grade-dist-cache.ts` imports `fetchSoldComps` from `finding.ts` but never calls it. The actual `fetchFromEbay` function inline-calls the Finding API directly. Both the unused import and the inline Finding API call must be replaced — use `searchListings` from rapidapi.ts since we need listing titles to parse grades.

> **Before writing any code:** Read `node_modules/next/dist/docs/index.md`.

- [ ] **Step 1: Update `lib/grade/grade-dist-cache.ts`**

Replace the entire file:

```ts
// lib/grade/grade-dist-cache.ts
import { searchListings } from '@/lib/ebay/rapidapi'
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

interface GradeCount {
  grades: Partial<Record<GradeKey, number>>
  total: number
}

async function fetchFromEbay(cardKey: string, player: string, year: number, set: string): Promise<GradeCount> {
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

  return { grades, total }
}

export async function getGradeDistribution(
  cardKey: string,
  player: string,
  year: number,
  set: string
): Promise<GradeDistribution> {
  const supabase = createServerClient()

  const { data: cached } = await supabase
    .from('grade_dist_cache')
    .select('*')
    .eq('card_key', cardKey)
    .single()

  if (
    cached &&
    Date.now() - new Date(cached.last_fetched).getTime() < CACHE_TTL_MS
  ) {
    return normalizeGrades(cached.grades as Partial<Record<GradeKey, number>>, cached.total)
  }

  try {
    const { grades, total } = await fetchFromEbay(cardKey, player, year, set)

    if (total < 5) return FLAT_PRIOR

    await supabase.from('grade_dist_cache').upsert({
      card_key: cardKey,
      grades,
      total,
      last_fetched: new Date().toISOString(),
    })

    return normalizeGrades(grades, total)
  } catch {
    return FLAT_PRIOR
  }
}

function normalizeGrades(
  grades: Partial<Record<GradeKey, number>>,
  total: number
): GradeDistribution {
  if (total === 0) return FLAT_PRIOR
  return {
    10: (grades[10] ?? 0) / total,
    9: (grades[9] ?? 0) / total,
    8: (grades[8] ?? 0) / total,
    7: (grades[7] ?? 0) / total,
  }
}
```

- [ ] **Step 2: Update `lib/grade/graded-comps.ts`**

Change only the import line — rest of the file is unchanged:

```ts
// lib/grade/graded-comps.ts
import { fetchSoldComps } from '@/lib/ebay/rapidapi'
import { calculateFairValue } from '@/lib/fair-value'
import type { GradeKey, GradedComps } from './types'

const GRADES: GradeKey[] = [10, 9, 8, 7]

export async function fetchGradedComps(
  player: string,
  year: number,
  set: string,
  cardNumber: string
): Promise<GradedComps> {
  const results: GradedComps = {}

  await Promise.all(
    GRADES.map(async (grade) => {
      const keywords = `${player} ${year} ${set} #${cardNumber} PSA ${grade}`
      try {
        const comps = await fetchSoldComps(keywords)
        if (comps.length < 3) return
        const fv = calculateFairValue(comps)
        if (fv) results[grade] = Math.round(fv.fairValue * 100) / 100
      } catch {
        // skip this grade tier if fetch fails
      }
    })
  )

  return results
}
```

- [ ] **Step 3: Update `inngest/deal-scanner.ts`**

Replace the two import lines and add `last_scanned_at` write. Change the top of the file (imports + function signature is unchanged — only two things change):

1. Replace the two imports:
```ts
// REMOVE these two lines:
import { searchListings } from '@/lib/ebay/browse'
import { fetchSoldComps } from '@/lib/ebay/finding'

// REPLACE with:
import { searchListings, fetchSoldComps } from '@/lib/ebay/rapidapi'
```

2. After the `for (const watchlist of watchlists)` loop body, at the very end of the loop (after the `for (const listing of listings)` block), add:

```ts
      // Write last_scanned_at so the UI status bar can show when we last ran
      await supabase
        .from('watchlists')
        .update({ last_scanned_at: new Date().toISOString() })
        .eq('id', watchlist.id)
```

The complete updated `inngest/deal-scanner.ts`:

```ts
import { inngest } from './client'
import { createServerClient } from '@/lib/supabase/server'
import { searchListings, fetchSoldComps } from '@/lib/ebay/rapidapi'
import { calculateFairValue, calculateRoiPct } from '@/lib/fair-value'
import { sendAlertEmail } from '@/lib/resend'
import { sendPushToAll } from '@/lib/push'

function buildCardKey(player: string, set: string, grade: string): string {
  return [player, set, grade]
    .map((s) =>
      s
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '')
    )
    .join('-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

interface WatchlistFilters {
  player: string
  set: string
  grade: string
  min_roi_pct: number
  max_price: number | null
}

interface Watchlist {
  id: string
  name: string
  filters: WatchlistFilters
}

export const dealScanner = inngest.createFunction(
  { id: 'deal-scanner', triggers: [{ cron: '*/5 * * * *' }] },
  async ({ step }) => {
    const supabase = createServerClient()

    const watchlists = await step.run('fetch-watchlists', async () => {
      const { data, error } = await supabase
        .from('watchlists')
        .select('id, name, filters')
        .eq('is_active', true)
      if (error) throw new Error(error.message)
      return (data ?? []) as Watchlist[]
    })

    // Fetch notification prefs + push subscriptions once per scan run
    const { data: prefs } = await supabase
      .from('notification_preferences')
      .select('email_enabled, email_address, push_enabled')
      .limit(1)
      .maybeSingle()

    const { data: pushSubs } = prefs?.push_enabled
      ? await supabase
          .from('push_subscriptions')
          .select('endpoint, p256dh, auth')
      : { data: [] }

    let totalAlerts = 0

    for (const watchlist of watchlists) {
      const f = watchlist.filters
      const searchQuery = [f.player, f.set, f.grade !== 'Any' ? f.grade : '']
        .filter(Boolean)
        .join(' ')
      const cardKey = buildCardKey(f.player, f.set, f.grade)

      const listings = await step.run(`browse-${watchlist.id}`, async () => {
        return searchListings(searchQuery, f.max_price ?? undefined)
      })

      if (listings.length === 0) {
        await supabase
          .from('watchlists')
          .update({ last_scanned_at: new Date().toISOString() })
          .eq('id', watchlist.id)
        continue
      }

      // Refresh comps if stale (no entry in last hour)
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
      const { data: recentCache } = await supabase
        .from('price_cache')
        .select('created_at')
        .eq('card_key', cardKey)
        .gt('created_at', oneHourAgo)
        .limit(1)
        .maybeSingle()

      if (!recentCache) {
        await step.run(`refresh-comps-${cardKey}`, async () => {
          const comps = await fetchSoldComps(searchQuery)
          if (comps.length > 0) {
            await supabase.from('price_cache').insert(
              comps.map((c) => ({
                card_key: cardKey,
                sale_price: c.price,
                sale_date: c.saleDate.toISOString(),
              }))
            )
          }
        })
      }

      // Load 90-day comps for fair value
      const ninetyDaysAgo = new Date()
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)

      const { data: cacheRows } = await supabase
        .from('price_cache')
        .select('sale_price, sale_date')
        .eq('card_key', cardKey)
        .gte('sale_date', ninetyDaysAgo.toISOString())
        .order('sale_date', { ascending: false })

      if (!cacheRows || cacheRows.length < 3) {
        await supabase
          .from('watchlists')
          .update({ last_scanned_at: new Date().toISOString() })
          .eq('id', watchlist.id)
        continue
      }

      const fairValueResult = calculateFairValue(
        cacheRows.map((r) => ({
          price: r.sale_price as number,
          saleDate: new Date(r.sale_date as string),
        }))
      )
      if (!fairValueResult) {
        await supabase
          .from('watchlists')
          .update({ last_scanned_at: new Date().toISOString() })
          .eq('id', watchlist.id)
        continue
      }

      for (const listing of listings) {
        const roiPct = calculateRoiPct(listing.price, fairValueResult.fairValue)
        if (roiPct < f.min_roi_pct) continue

        const { error } = await supabase.from('alerts').insert({
          watchlist_id: watchlist.id,
          ebay_item_id: listing.itemId,
          card_title: listing.title,
          listed_price: listing.price,
          fair_value: Math.round(fairValueResult.fairValue * 100) / 100,
          roi_pct: Math.round(roiPct * 100) / 100,
          grade: f.grade,
          player: f.player,
          set_name: f.set,
          listing_url: listing.listingUrl,
          image_url: listing.imageUrl,
          end_time: listing.endTime,
        })

        // Skip duplicate eBay items (unique constraint on ebay_item_id)
        if (error && error.code === '23505') continue
        if (error) throw new Error(error.message)

        totalAlerts++

        const notifPayload = {
          cardTitle: listing.title,
          listedPrice: listing.price,
          fairValue: Math.round(fairValueResult.fairValue * 100) / 100,
          roiPct: Math.round(roiPct * 100) / 100,
          listingUrl: listing.listingUrl,
          watchlistName: watchlist.name,
        }

        if (prefs?.email_enabled && prefs.email_address) {
          void sendAlertEmail({
            to: prefs.email_address,
            ...notifPayload,
            cardTitle: notifPayload.cardTitle,
          }).catch((err: unknown) => console.error('Email notification failed:', err))
        }

        if (prefs?.push_enabled && pushSubs && pushSubs.length > 0) {
          void sendPushToAll(pushSubs, {
            title: `Deal Alert: ${listing.title}`,
            body: `+${notifPayload.roiPct.toFixed(1)}% below market — $${listing.price.toFixed(2)} listed`,
            url: listing.listingUrl,
          }).catch((err: unknown) => console.error('Push notification failed:', err))
        }
      }

      await supabase
        .from('watchlists')
        .update({ last_scanned_at: new Date().toISOString() })
        .eq('id', watchlist.id)
    }

    return { watchlistsScanned: watchlists.length, alertsGenerated: totalAlerts }
  }
)
```

- [ ] **Step 4: Create migration `supabase/migrations/004_deal_discovery_redesign.sql`**

```sql
alter table watchlists add column if not exists last_scanned_at timestamptz;
```

- [ ] **Step 5: Delete the dead files**

```bash
rm lib/ebay/browse.ts lib/ebay/finding.ts
```

- [ ] **Step 6: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```
Expected: no errors. If there are import errors, there's a file still referencing the deleted modules — search with `grep -r "ebay/browse\|ebay/finding" --include="*.ts" --include="*.tsx" .` and fix any stragglers.

- [ ] **Step 7: Commit**

```bash
git add lib/ebay/rapidapi.ts lib/grade/grade-dist-cache.ts lib/grade/graded-comps.ts inngest/deal-scanner.ts supabase/migrations/004_deal_discovery_redesign.sql
git rm lib/ebay/browse.ts lib/ebay/finding.ts
git commit -m "feat: wire rapidapi.ts into scanner and grade modules; add last_scanned_at migration"
```

---

## Task 3: Create `/api/deals/status` Endpoint

**Files:**
- Create: `app/api/deals/status/route.ts`

**Context:** The deals page header needs to show "Last scanned X min ago · N alerts today". This endpoint returns `lastScannedAt` (max of `last_scanned_at` across active watchlists — added by migration 004) and `alertsToday` (count of alerts created since midnight UTC). The AlertFeed polls this once on mount.

> **Before writing any code:** Read `node_modules/next/dist/docs/index.md`.

- [ ] **Step 1: Create `app/api/deals/status/route.ts`**

```ts
// app/api/deals/status/route.ts
import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

export interface DealsStatus {
  lastScannedAt: string | null
  alertsToday: number
  hasWatchlists: boolean
}

export async function GET() {
  const supabase = createServerClient()

  const todayUtc = new Date()
  todayUtc.setUTCHours(0, 0, 0, 0)

  const [watchlistsResult, alertsResult] = await Promise.all([
    supabase
      .from('watchlists')
      .select('last_scanned_at')
      .eq('is_active', true),
    supabase
      .from('alerts')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', todayUtc.toISOString()),
  ])

  if (watchlistsResult.error) {
    return NextResponse.json({ error: watchlistsResult.error.message }, { status: 500 })
  }

  const watchlists = watchlistsResult.data ?? []
  const hasWatchlists = watchlists.length > 0

  const lastScannedAt = watchlists.reduce<string | null>((latest, w) => {
    const t = w.last_scanned_at as string | null
    if (!t) return latest
    if (!latest) return t
    return new Date(t) > new Date(latest) ? t : latest
  }, null)

  const alertsToday = alertsResult.count ?? 0

  return NextResponse.json({ lastScannedAt, alertsToday, hasWatchlists } satisfies DealsStatus)
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/api/deals/status/route.ts
git commit -m "feat: add /api/deals/status endpoint for scan status bar"
```

---

## Task 4: Redesign `app/(app)/deals/page.tsx`

**Files:**
- Modify: `app/(app)/deals/page.tsx`

**Context:** Convert the deals page from a static server component to a `'use client'` component. Layout changes: full-width alert feed (no right column), Sheet drawer for watchlists triggered by a "Manage Watchlists" button in the header. AlertFeed receives an `onManageWatchlists` callback so the "Set up your first watchlist →" empty-state link can open the drawer. `WatchlistPanel` is unchanged — it just moves inside the Sheet.

The Sheet component is at `components/ui/sheet.tsx`. It's based on `@base-ui/react/dialog`. The uncontrolled Sheet usage: `Sheet > SheetTrigger + SheetContent > SheetHeader + SheetTitle + content`.

Since we need `onManageWatchlists` to flow to AlertFeed (for the empty state button), the page tracks `sheetOpen` state and passes a callback.

> **Before writing any code:** Read `node_modules/next/dist/docs/index.md`.

- [ ] **Step 1: Write the new `app/(app)/deals/page.tsx`**

```tsx
// app/(app)/deals/page.tsx
'use client'

import { useState } from 'react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { AlertFeed } from '@/components/deals/AlertFeed'
import { WatchlistPanel } from '@/components/deals/WatchlistPanel'

export default function DealsPage() {
  const [sheetOpen, setSheetOpen] = useState(false)

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <div className="flex items-start justify-between mb-1">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
          Deal Discovery
        </h1>
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetTrigger
            className="text-sm font-medium text-indigo-500 hover:text-indigo-400 transition-colors mt-1"
          >
            Manage Watchlists ›
          </SheetTrigger>
          <SheetContent side="right" className="w-[400px] overflow-y-auto p-0">
            <SheetHeader className="px-6 py-4 border-b border-slate-200 dark:border-slate-800">
              <SheetTitle>Watchlists</SheetTitle>
            </SheetHeader>
            <div className="px-6 py-4">
              <WatchlistPanel />
            </div>
          </SheetContent>
        </Sheet>
      </div>
      <AlertFeed onManageWatchlists={() => setSheetOpen(true)} />
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```
Expected: error about `onManageWatchlists` prop on `AlertFeed` — that's expected; it's fixed in Task 5.

- [ ] **Step 3: Commit once Task 5 is also done**

Hold the commit until AlertFeed accepts `onManageWatchlists`. Skip this commit; it happens in Task 5.

---

## Task 5: Redesign `components/deals/AlertFeed.tsx`

**Files:**
- Modify: `components/deals/AlertFeed.tsx`

**Context:** AlertFeed gains three new features:
1. **Status bar** — fetches `/api/deals/status` on mount, shows "Last scanned X min ago · N alerts today". Hidden if no watchlists exist; shows "Not yet scanned." if watchlists exist but scanner hasn't run.
2. **Sort/filter bar** — sort by ROI (desc, default) · Newest · Price (asc); filter All · Unread only; "Mark all read" ghost button only when unread count > 0.
3. **Updated empty states** — "No watchlists set up yet" (with button that calls `onManageWatchlists`) vs "No alerts yet" (scanner running).
4. **`onManageWatchlists` prop** — passed from the deals page, used by the empty state button.

Sort and filter state is local `useState` — not persisted. Default: ROI desc, All.

> **Before writing any code:** Read `node_modules/next/dist/docs/index.md`.

- [ ] **Step 1: Write the new `components/deals/AlertFeed.tsx`**

```tsx
// components/deals/AlertFeed.tsx
'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { supabase } from '@/lib/supabase/client'
import { AlertCard, type Alert } from './AlertCard'
import type { DealsStatus } from '@/app/api/deals/status/route'

type SortKey = 'roi' | 'newest' | 'price'
type FilterKey = 'all' | 'unread'

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (seconds < 60) return `${Math.floor(seconds)}s ago`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}

function sortAlerts(alerts: Alert[], key: SortKey): Alert[] {
  return [...alerts].sort((a, b) => {
    if (key === 'roi') return b.roi_pct - a.roi_pct
    if (key === 'price') return a.listed_price - b.listed_price
    // newest
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  })
}

interface AlertFeedProps {
  onManageWatchlists: () => void
}

export function AlertFeed({ onManageWatchlists }: AlertFeedProps) {
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [status, setStatus] = useState<DealsStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [sortKey, setSortKey] = useState<SortKey>('roi')
  const [filterKey, setFilterKey] = useState<FilterKey>('all')

  const load = useCallback(async () => {
    const [alertsRes, statusRes] = await Promise.all([
      fetch('/api/alerts'),
      fetch('/api/deals/status'),
    ])
    const alertsData = (await alertsRes.json()) as Alert[]
    setAlerts(Array.isArray(alertsData) ? alertsData : [])
    if (statusRes.ok) setStatus((await statusRes.json()) as DealsStatus)
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()

    const channel = supabase
      .channel('alerts-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'alerts' },
        () => { void load() }
      )
      .subscribe()

    return () => { void supabase.removeChannel(channel) }
  }, [load])

  async function handleRead(id: string) {
    await fetch(`/api/alerts/${id}`, { method: 'PATCH' })
    setAlerts((prev) => prev.map((a) => (a.id === id ? { ...a, is_read: true } : a)))
  }

  async function handleMarkAllRead() {
    await fetch('/api/alerts/mark-all-read', { method: 'POST' })
    setAlerts((prev) => prev.map((a) => ({ ...a, is_read: true })))
  }

  const unreadCount = alerts.filter((a) => !a.is_read).length
  const visible = sortAlerts(
    filterKey === 'unread' ? alerts.filter((a) => !a.is_read) : alerts,
    sortKey
  )

  if (loading) return <p className="text-sm text-slate-400 py-8">Loading…</p>

  // Empty state: no watchlists
  if (!status?.hasWatchlists) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-lg gap-3">
        <p className="text-sm font-medium text-slate-500">No watchlists set up yet</p>
        <p className="text-xs text-slate-400">
          Cards matching your criteria will appear here once you create a watchlist.
        </p>
        <button
          onClick={onManageWatchlists}
          className="text-sm text-indigo-500 hover:text-indigo-400 transition-colors"
        >
          Set up your first watchlist →
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-0">
      {/* Status bar */}
      {status && (
        <p className="text-xs text-slate-400 mb-4">
          {status.lastScannedAt
            ? `Last scanned ${timeAgo(status.lastScannedAt)} · ${status.alertsToday} alert${status.alertsToday !== 1 ? 's' : ''} today`
            : 'Not yet scanned.'}
        </p>
      )}

      {/* Sort / filter bar */}
      <div className="flex items-center gap-4 mb-4 flex-wrap">
        <div className="flex items-center gap-1 text-xs">
          <span className="text-slate-500 mr-1">Sort:</span>
          {(['roi', 'newest', 'price'] as SortKey[]).map((key) => (
            <button
              key={key}
              onClick={() => setSortKey(key)}
              className={`px-2 py-1 rounded transition-colors ${
                sortKey === key
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              {key === 'roi' ? 'ROI %' : key === 'newest' ? 'Newest' : 'Price'}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 text-xs">
          <span className="text-slate-500 mr-1">Filter:</span>
          {(['all', 'unread'] as FilterKey[]).map((key) => (
            <button
              key={key}
              onClick={() => setFilterKey(key)}
              className={`px-2 py-1 rounded transition-colors ${
                filterKey === key
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              {key === 'all' ? 'All' : 'Unread'}
            </button>
          ))}
        </div>
        {unreadCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto text-xs text-slate-400 hover:text-slate-200"
            onClick={() => void handleMarkAllRead()}
          >
            Mark all read
          </Button>
        )}
      </div>

      {/* Empty state: watchlists exist but no alerts yet */}
      {visible.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-lg">
          <p className="text-sm font-medium text-slate-500">No alerts yet</p>
          <p className="text-xs text-slate-400 mt-1">
            The scanner runs every 5 minutes. Check back shortly.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((a) => (
            <AlertCard key={a.id} alert={a} onRead={(id) => void handleRead(id)} />
          ))}
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
Expected: no errors.

- [ ] **Step 3: Commit (includes Task 4's page.tsx change)**

```bash
git add app/\(app\)/deals/page.tsx components/deals/AlertFeed.tsx
git commit -m "feat: redesign deals page — full-width feed, Sheet drawer, sort/filter, status bar"
```

---

## Task 6: Redesign `components/deals/AlertCard.tsx`

**Files:**
- Modify: `components/deals/AlertCard.tsx`

**Context:** The current card is a simple stacked layout. The new design is a horizontal decision surface:
- **Left** — large colour-coded ROI badge (green ≥15%, amber 10–14%, red <10%)
- **Middle** — card title (2-line clamp), grade chip, `$52 listed · $78 FV` in mono, watchlist + time ago
- **Right** — primary "Buy on eBay" button (indigo, opens in new tab), secondary "Track Buy" ghost button, end-time urgency (`Ends in 4h 12m` in red when < 6h remaining)

Clicking anywhere outside the buttons marks the card as read (existing behaviour). The `Alert` interface and `handleMarkPurchased` logic are unchanged.

> **Before writing any code:** Read `node_modules/next/dist/docs/index.md`.

- [ ] **Step 1: Write the new `components/deals/AlertCard.tsx`**

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

function timeUntil(dateStr: string): string | null {
  const ms = new Date(dateStr).getTime() - Date.now()
  if (ms <= 0) return null
  const totalMins = Math.floor(ms / 60_000)
  if (totalMins < 60) return `Ends in ${totalMins}m`
  const h = Math.floor(totalMins / 60)
  const m = totalMins % 60
  return `Ends in ${h}h ${m}m`
}

function RoiBadge({ roi }: { roi: number }) {
  const color =
    roi >= 15
      ? 'bg-green-500/20 text-green-400 border-green-500/30'
      : roi >= 10
      ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
      : 'bg-red-500/20 text-red-400 border-red-500/30'

  return (
    <div
      className={`flex-shrink-0 w-16 flex items-center justify-center rounded-lg border font-mono font-bold text-base tabular-nums ${color}`}
      style={{ minHeight: '72px' }}
    >
      +{roi.toFixed(0)}%
    </div>
  )
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

  const endTimeLabel = alert.end_time ? timeUntil(alert.end_time) : null
  const endingSoon = alert.end_time
    ? new Date(alert.end_time).getTime() - Date.now() < 6 * 60 * 60 * 1000
    : false

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => { if (!alert.is_read) onRead(alert.id) }}
      onKeyDown={(e) => { if (e.key === 'Enter' && !alert.is_read) onRead(alert.id) }}
      className={`relative flex gap-3 p-4 rounded-lg border transition-colors cursor-pointer items-center ${
        alert.is_read
          ? 'border-slate-200 dark:border-slate-800'
          : 'border-indigo-200 dark:border-indigo-900 bg-indigo-50/30 dark:bg-indigo-950/20'
      }`}
    >
      {!alert.is_read && (
        <span className="absolute top-3 right-3 w-2 h-2 rounded-full bg-indigo-500" />
      )}

      {/* Left: ROI badge */}
      <RoiBadge roi={alert.roi_pct} />

      {/* Middle: Card info */}
      <div className="flex-1 min-w-0 space-y-1">
        <p className="text-sm font-medium text-slate-900 dark:text-slate-100 leading-snug line-clamp-2">
          {alert.card_title}
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          {alert.grade && alert.grade !== 'Any' && (
            <span className="text-xs bg-amber-500/20 text-amber-400 border border-amber-500/30 px-1.5 py-0.5 rounded font-mono">
              {alert.grade}
            </span>
          )}
          <span className="text-xs font-mono tabular-nums text-slate-300">
            ${alert.listed_price.toFixed(2)} listed
            <span className="text-slate-500"> · ${alert.fair_value.toFixed(2)} FV</span>
          </span>
        </div>
        <p className="text-xs text-slate-500">
          {alert.watchlists?.name} · {timeAgo(alert.created_at)}
        </p>
      </div>

      {/* Right: Actions */}
      <div className="flex-shrink-0 flex flex-col items-end gap-2">
        <a
          href={alert.listing_url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="flex items-center gap-1.5 text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded transition-colors"
        >
          Buy on eBay <ExternalLink className="size-3" />
        </a>
        <button
          onClick={handleMarkPurchased}
          className="flex items-center gap-1 text-xs text-slate-400 hover:text-green-400 transition-colors"
        >
          <ShoppingCart className="size-3" /> Track Buy
        </button>
        {endTimeLabel && (
          <span
            className={`text-xs font-mono tabular-nums ${
              endingSoon ? 'text-red-400' : 'text-slate-500'
            }`}
          >
            {endTimeLabel}
          </span>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/deals/AlertCard.tsx
git commit -m "feat: redesign AlertCard — ROI badge, Buy on eBay button, end-time urgency"
```

---

## Self-Review

**Spec coverage check:**

| Requirement | Task |
|-------------|------|
| Replace browse.ts with rapidapi.ts | Task 1 + Task 2 |
| Replace finding.ts with rapidapi.ts | Task 1 + Task 2 |
| Single RAPIDAPI_KEY env var | Task 1 |
| fetchSoldComps for graded-comps | Task 2 |
| searchListings for grade-dist-cache | Task 2 |
| Write last_scanned_at per watchlist | Task 2 |
| Migration 004 | Task 2 |
| /api/deals/status endpoint | Task 3 |
| Full-width alert feed | Task 4 |
| Watchlists in Sheet drawer | Task 4 |
| "Manage Watchlists" button | Task 4 |
| Scanner status bar | Task 5 |
| Sort by ROI desc (default) | Task 5 |
| Sort by Newest, Price | Task 5 |
| Filter All / Unread | Task 5 |
| Mark all read → ghost button | Task 5 |
| Empty state: no watchlists | Task 5 |
| Empty state: watchlists, no alerts | Task 5 |
| "Set up your first watchlist →" opens drawer | Task 5 |
| ROI badge (green/amber/red) | Task 6 |
| Buy on eBay primary button | Task 6 |
| Track Buy secondary button | Task 6 |
| End-time urgency (red < 6h) | Task 6 |
| Click body marks as read | Task 6 |

**Placeholder scan:** None.

**Type consistency:** `DealsStatus` defined in `app/api/deals/status/route.ts` and imported in `AlertFeed.tsx` — consistent. `Alert` interface defined in `AlertCard.tsx` and imported in `AlertFeed.tsx` — consistent (unchanged from current code). `onManageWatchlists: () => void` defined in Task 4 page and consumed in Task 5 AlertFeed — consistent.
