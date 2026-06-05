# Live Deal Scanner — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Live Deal Scanner that polls eBay every 5 minutes via an Inngest cron job, computes recency-weighted fair values from 90-day sold comps, writes matching alerts to Supabase, and delivers them instantly in-app (realtime subscription), via email (Resend), and via browser push (Web Push API).

**Architecture:** Next.js API routes handle CRUD for watchlists, alerts, and notification preferences. An Inngest scheduled function scans eBay Browse API for live listings, refreshes sold comps from eBay Finding API into a price_cache table, computes fair value, and inserts alerts. Supabase Realtime fires new alert rows to the browser as they land. Resend and web-push send email and browser push notifications when preferences are enabled.

**Tech Stack:** `@supabase/supabase-js`, `inngest`, `resend`, `web-push`, `vitest`, eBay Browse API, eBay Finding API, Next.js 16.2.7 App Router, Tailwind CSS, lucide-react

---

## File Map

**New files:**
```
lib/
  supabase/client.ts                    # Browser Supabase singleton + realtime
  supabase/server.ts                    # Server-side client (service role)
  ebay/auth.ts                          # eBay OAuth2 token management
  ebay/browse.ts                        # Browse API — live listings
  ebay/finding.ts                       # Finding API — sold comps
  fair-value.ts                         # Recency-weighted fair value engine
  push.ts                               # Web Push notification sender
  resend.ts                             # Resend email sender
  __tests__/fair-value.test.ts          # Unit tests for fair value engine

inngest/
  client.ts                             # Inngest client init
  deal-scanner.ts                       # Cron job — scan every 5 min

supabase/
  migrations/001_live_deal_scanner.sql  # Schema + realtime config

app/api/
  watchlists/route.ts                   # GET, POST
  watchlists/[id]/route.ts              # PATCH, DELETE
  watchlists/[id]/toggle/route.ts       # PATCH active toggle
  alerts/route.ts                       # GET (paginated)
  alerts/[id]/route.ts                  # PATCH mark read
  alerts/mark-all-read/route.ts         # POST mark all read
  notifications/preferences/route.ts   # GET, PATCH
  notifications/subscribe/route.ts     # POST, DELETE
  inngest/route.ts                      # Inngest webhook

components/deals/
  WatchlistForm.tsx
  WatchlistCard.tsx
  WatchlistPanel.tsx
  AlertCard.tsx
  AlertFeed.tsx

components/notifications/
  PushPermissionBanner.tsx

components/settings/
  NotificationPreferences.tsx

public/
  sw.js                                 # Service worker (browser push)

vitest.config.ts
.env.local.example
```

**Modified files:**
```
app/(app)/deals/page.tsx                # Replace Coming Soon with two-panel layout
app/(app)/settings/page.tsx            # Replace Notifications placeholder
package.json                           # (via npm install — no manual edit needed)
```

---

## Phase 1 — Foundation

### Task 1: Install packages and configure environment

**Files:**
- Create: `.env.local.example`
- Create: `vitest.config.ts`
- Modify: `package.json` (add test script)

- [ ] **Step 1: Install runtime dependencies**

```bash
cd /Users/daviddaniel/Documents/GitHub/CardEdge
npm install @supabase/supabase-js inngest resend web-push
```

Expected: packages added to `node_modules` and `package.json` dependencies section.

- [ ] **Step 2: Install dev dependencies**

```bash
npm install -D @types/web-push vitest @vitejs/plugin-react
```

Expected: packages added to `devDependencies`.

- [ ] **Step 3: Add test script to package.json**

Open `package.json`, change the `scripts` section to:

```json
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "eslint",
  "test": "vitest run",
  "test:watch": "vitest"
},
```

- [ ] **Step 4: Create vitest.config.ts**

```typescript
import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  test: {
    environment: 'node',
  },
})
```

- [ ] **Step 5: Create .env.local.example**

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# eBay API (register at developer.ebay.com)
EBAY_CLIENT_ID=your-client-id
EBAY_CLIENT_SECRET=your-client-secret
EBAY_ENVIRONMENT=sandbox

# Resend (register at resend.com)
RESEND_API_KEY=re_your-api-key

# Inngest (register at inngest.com)
INNGEST_EVENT_KEY=your-event-key
INNGEST_SIGNING_KEY=your-signing-key

# Web Push VAPID (generate: npx web-push generate-vapid-keys)
NEXT_PUBLIC_VAPID_PUBLIC_KEY=your-public-key
VAPID_PRIVATE_KEY=your-private-key
VAPID_SUBJECT=mailto:david_daniel@college.harvard.edu
```

- [ ] **Step 6: Copy to .env.local and fill in real values**

```bash
cp .env.local.example .env.local
```

Then open `.env.local` and fill in:
- Supabase: create project at supabase.com → Settings → API
- eBay: register at developer.ebay.com → create application → start with sandbox
- Resend: register at resend.com → API Keys
- Inngest: register at inngest.com → create app → Event Keys
- VAPID: run `npx web-push generate-vapid-keys` and copy both keys

- [ ] **Step 7: Verify TypeScript compiles**

```bash
npm run build 2>&1 | head -30
```

Expected: build succeeds (or only pre-existing errors — none from new files since we haven't created them yet).

- [ ] **Step 8: Commit**

```bash
git add vitest.config.ts .env.local.example package.json package-lock.json
git commit -m "feat: add scanner dependencies, vitest config, env template"
```

---

### Task 2: Supabase schema migration

**Files:**
- Create: `supabase/migrations/001_live_deal_scanner.sql`

- [ ] **Step 1: Create migrations directory and SQL file**

```bash
mkdir -p /Users/daviddaniel/Documents/GitHub/CardEdge/supabase/migrations
```

Create `supabase/migrations/001_live_deal_scanner.sql`:

```sql
-- Watchlists: user-defined scan filters
create table if not exists watchlists (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid,
  name         text not null,
  filters      jsonb not null default '{}',
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Alerts: deal matches found by the scanner
create table if not exists alerts (
  id              uuid primary key default gen_random_uuid(),
  watchlist_id    uuid references watchlists(id) on delete cascade,
  ebay_item_id    text unique not null,
  card_title      text not null,
  listed_price    numeric(10,2) not null,
  fair_value      numeric(10,2) not null,
  roi_pct         numeric(5,2) not null,
  grade           text,
  player          text,
  set_name        text,
  listing_url     text not null,
  image_url       text,
  end_time        timestamptz,
  is_read         boolean not null default false,
  created_at      timestamptz not null default now()
);

-- Price cache: sold comps from eBay Finding API
create table if not exists price_cache (
  id          uuid primary key default gen_random_uuid(),
  card_key    text not null,
  sale_price  numeric(10,2) not null,
  sale_date   timestamptz not null,
  source      text not null default 'ebay',
  created_at  timestamptz not null default now()
);

create index if not exists idx_price_cache_key_date
  on price_cache (card_key, sale_date desc);

-- Notification preferences (single-user placeholder)
create table if not exists notification_preferences (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid unique,
  email_enabled   boolean not null default false,
  email_address   text,
  push_enabled    boolean not null default false,
  in_app_enabled  boolean not null default true,
  updated_at      timestamptz not null default now()
);

-- Push subscriptions (browser push endpoints)
create table if not exists push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid,
  endpoint    text unique not null,
  p256dh      text not null,
  auth        text not null,
  created_at  timestamptz not null default now()
);

-- Enable realtime for alerts table so browser gets instant notifications
alter publication supabase_realtime add table alerts;
```

- [ ] **Step 2: Run the SQL in Supabase**

Go to your Supabase project → SQL Editor → paste the entire SQL above → Run.

Expected: "Success. No rows returned." All 5 tables visible in Table Editor.

Verify: click Table Editor → confirm `watchlists`, `alerts`, `price_cache`, `notification_preferences`, `push_subscriptions` all exist.

- [ ] **Step 3: Enable Realtime for alerts in Supabase dashboard**

In Supabase: Database → Replication → enable the `alerts` table for realtime (the `ALTER PUBLICATION` above does this via SQL, but confirm it shows up in the Replication UI).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/001_live_deal_scanner.sql
git commit -m "feat: add supabase schema migration for deal scanner"
```

---

### Task 3: Supabase client modules

**Files:**
- Create: `lib/supabase/client.ts`
- Create: `lib/supabase/server.ts`

- [ ] **Step 1: Create lib/supabase/client.ts**

```typescript
import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)
```

- [ ] **Step 2: Create lib/supabase/server.ts**

```typescript
import { createClient } from '@supabase/supabase-js'

export function createServerClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}
```

- [ ] **Step 3: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep -E "supabase|error" | head -20
```

Expected: no errors on the new files.

- [ ] **Step 4: Commit**

```bash
git add lib/supabase/client.ts lib/supabase/server.ts
git commit -m "feat: add supabase browser and server clients"
```

---

### Task 4: eBay authentication module

**Files:**
- Create: `lib/ebay/auth.ts`

- [ ] **Step 1: Create lib/ebay/auth.ts**

```typescript
let cachedToken: { value: string; expiresAt: number } | null = null

export async function getEbayToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) {
    return cachedToken.value
  }

  const credentials = Buffer.from(
    `${process.env.EBAY_CLIENT_ID}:${process.env.EBAY_CLIENT_SECRET}`
  ).toString('base64')

  const base =
    process.env.EBAY_ENVIRONMENT === 'sandbox'
      ? 'https://api.sandbox.ebay.com'
      : 'https://api.ebay.com'

  const res = await fetch(`${base}/identity/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials&scope=https%3A%2F%2Fapi.ebay.com%2Foauth%2Fapi_scope',
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`eBay auth failed ${res.status}: ${text}`)
  }

  const data = (await res.json()) as { access_token: string; expires_in: number }
  cachedToken = {
    value: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  }
  return cachedToken.value
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep "lib/ebay" | head -10
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/ebay/auth.ts
git commit -m "feat: add eBay OAuth2 token client"
```

---

### Task 5: eBay Browse API (live listings)

**Files:**
- Create: `lib/ebay/browse.ts`

- [ ] **Step 1: Create lib/ebay/browse.ts**

```typescript
import { getEbayToken } from './auth'

export interface EbayListing {
  itemId: string
  title: string
  price: number
  imageUrl: string | null
  listingUrl: string
  endTime: string | null
}

export async function searchListings(
  query: string,
  maxPrice?: number
): Promise<EbayListing[]> {
  const token = await getEbayToken()
  const base =
    process.env.EBAY_ENVIRONMENT === 'sandbox'
      ? 'https://api.sandbox.ebay.com'
      : 'https://api.ebay.com'

  const params = new URLSearchParams({
    q: query,
    category_ids: '212',
    sort: 'newlyListed',
    limit: '50',
  })
  if (maxPrice) {
    params.set('filter', `price:[0..${maxPrice}]`)
  }

  const res = await fetch(
    `${base}/buy/browse/v1/item_summary/search?${params}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US',
        'X-EBAY-C-ENDUSERCTX': 'contextualLocation=country=US',
      },
    }
  )

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`eBay Browse API ${res.status}: ${text}`)
  }

  const data = (await res.json()) as {
    itemSummaries?: Array<{
      itemId: string
      title: string
      price: { value: string }
      image?: { imageUrl: string }
      itemWebUrl: string
      itemEndDate?: string
    }>
  }

  return (data.itemSummaries ?? []).map((item) => ({
    itemId: item.itemId,
    title: item.title,
    price: parseFloat(item.price.value),
    imageUrl: item.image?.imageUrl ?? null,
    listingUrl: item.itemWebUrl,
    endTime: item.itemEndDate ?? null,
  }))
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep "lib/ebay/browse" | head -10
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/ebay/browse.ts
git commit -m "feat: add eBay Browse API client for live listings"
```

---

### Task 6: eBay Finding API (sold comps)

**Files:**
- Create: `lib/ebay/finding.ts`

- [ ] **Step 1: Create lib/ebay/finding.ts**

```typescript
export interface SoldComp {
  price: number
  saleDate: Date
}

export async function fetchSoldComps(keywords: string): Promise<SoldComp[]> {
  const base =
    process.env.EBAY_ENVIRONMENT === 'sandbox'
      ? 'https://svcs.sandbox.ebay.com'
      : 'https://svcs.ebay.com'

  const ninetyDaysAgo = new Date()
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)

  const params = new URLSearchParams()
  params.set('OPERATION-NAME', 'findCompletedItems')
  params.set('SERVICE-VERSION', '1.0.0')
  params.set('SECURITY-APPNAME', process.env.EBAY_CLIENT_ID!)
  params.set('RESPONSE-DATA-FORMAT', 'JSON')
  params.set('REST-PAYLOAD', 'true')
  params.set('keywords', keywords)
  params.set('categoryId', '212')
  params.set('itemFilter(0).name', 'SoldItemsOnly')
  params.set('itemFilter(0).value', 'true')
  params.set('itemFilter(1).name', 'TimeFrom')
  params.set('itemFilter(1).value', ninetyDaysAgo.toISOString())
  params.set('paginationInput.entriesPerPage', '100')

  const res = await fetch(
    `${base}/services/search/FindingService/v1?${params}`
  )

  if (!res.ok) {
    throw new Error(`eBay Finding API ${res.status}`)
  }

  type FindingItem = {
    sellingStatus: Array<{
      currentPrice: Array<{ __value__: string }>
      endTime: string[]
    }>
  }

  const data = (await res.json()) as {
    findCompletedItemsResponse?: Array<{
      searchResult?: Array<{ item?: FindingItem[] }>
    }>
  }

  const items =
    data.findCompletedItemsResponse?.[0]?.searchResult?.[0]?.item ?? []

  return items
    .filter(
      (item) => item.sellingStatus?.[0]?.currentPrice?.[0]?.__value__
    )
    .map((item) => ({
      price: parseFloat(item.sellingStatus[0].currentPrice[0].__value__),
      saleDate: new Date(item.sellingStatus[0].endTime[0]),
    }))
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep "lib/ebay/finding" | head -10
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/ebay/finding.ts
git commit -m "feat: add eBay Finding API client for sold comps"
```

---

### Task 7: Fair value engine with unit tests (TDD)

**Files:**
- Create: `lib/__tests__/fair-value.test.ts`
- Create: `lib/fair-value.ts`

- [ ] **Step 1: Create the test file first**

Create `lib/__tests__/fair-value.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { calculateFairValue, calculateRoiPct } from '../fair-value'

describe('calculateFairValue', () => {
  it('returns null for empty array', () => {
    expect(calculateFairValue([])).toBeNull()
  })

  it('returns null when fewer than 3 comps', () => {
    const now = new Date()
    expect(
      calculateFairValue([
        { price: 100, saleDate: now },
        { price: 200, saleDate: now },
      ])
    ).toBeNull()
  })

  it('returns a result with 3 or more comps', () => {
    const now = new Date()
    const result = calculateFairValue([
      { price: 100, saleDate: now },
      { price: 200, saleDate: now },
      { price: 300, saleDate: now },
    ])
    expect(result).not.toBeNull()
    expect(result!.compCount).toBe(3)
  })

  it('gives higher weight to more recent sales', () => {
    const today = new Date()
    const daysAgo1 = new Date(today.getTime() - 1 * 86_400_000)
    const daysAgo60 = new Date(today.getTime() - 60 * 86_400_000)
    const daysAgo89 = new Date(today.getTime() - 89 * 86_400_000)

    const result = calculateFairValue([
      { price: 500, saleDate: daysAgo1 },   // recent, high price
      { price: 100, saleDate: daysAgo60 },  // old, low price
      { price: 100, saleDate: daysAgo89 },  // oldest, low price
    ])
    expect(result).not.toBeNull()
    // Recency weighting should pull fair value much closer to 500 than to 100
    expect(result!.fairValue).toBeGreaterThan(400)
  })

  it('with equal-age comps produces simple weighted average', () => {
    const now = new Date()
    const result = calculateFairValue([
      { price: 100, saleDate: now },
      { price: 200, saleDate: now },
      { price: 300, saleDate: now },
    ])
    // All same age → equal weights → simple mean = 200
    expect(result!.fairValue).toBeCloseTo(200, 0)
  })
})

describe('calculateRoiPct', () => {
  it('returns ~22.1% when listed at $180 vs $231 FV', () => {
    expect(calculateRoiPct(180, 231)).toBeCloseTo(22.08, 1)
  })

  it('returns 0 when listed at fair value', () => {
    expect(calculateRoiPct(100, 100)).toBe(0)
  })

  it('returns negative when listed above fair value', () => {
    expect(calculateRoiPct(200, 100)).toBeLessThan(0)
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail (no implementation yet)**

```bash
npm test
```

Expected: FAIL — `Cannot find module '../fair-value'`

- [ ] **Step 3: Create lib/fair-value.ts**

```typescript
export interface Comp {
  price: number
  saleDate: Date
}

export interface FairValueResult {
  fairValue: number
  compCount: number
  oldestComp: Date
  newestComp: Date
}

export function calculateFairValue(comps: Comp[]): FairValueResult | null {
  if (comps.length < 3) return null

  const now = new Date()
  let weightedSum = 0
  let weightSum = 0
  let oldest = comps[0].saleDate
  let newest = comps[0].saleDate

  for (const comp of comps) {
    const daysAgo =
      (now.getTime() - comp.saleDate.getTime()) / (1000 * 60 * 60 * 24)
    const weight = 1 / (daysAgo + 1)
    weightedSum += comp.price * weight
    weightSum += weight
    if (comp.saleDate < oldest) oldest = comp.saleDate
    if (comp.saleDate > newest) newest = comp.saleDate
  }

  return {
    fairValue: weightedSum / weightSum,
    compCount: comps.length,
    oldestComp: oldest,
    newestComp: newest,
  }
}

export function calculateRoiPct(listedPrice: number, fairValue: number): number {
  return ((fairValue - listedPrice) / fairValue) * 100
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npm test
```

Expected output:
```
✓ lib/__tests__/fair-value.test.ts (7)
  ✓ calculateFairValue > returns null for empty array
  ✓ calculateFairValue > returns null when fewer than 3 comps
  ✓ calculateFairValue > returns a result with 3 or more comps
  ✓ calculateFairValue > gives higher weight to more recent sales
  ✓ calculateFairValue > with equal-age comps produces simple weighted average
  ✓ calculateRoiPct > returns ~22.1% when listed at $180 vs $231 FV
  ✓ calculateRoiPct > returns 0 when listed at fair value
  ✓ calculateRoiPct > returns negative when listed above fair value

Test Files  1 passed (1)
Tests  8 passed (8)
```

- [ ] **Step 5: Commit**

```bash
git add lib/fair-value.ts lib/__tests__/fair-value.test.ts
git commit -m "feat: add recency-weighted fair value engine with unit tests"
```

---

### Task 8: Inngest client

**Files:**
- Create: `inngest/client.ts`

- [ ] **Step 1: Create inngest/client.ts**

```typescript
import { Inngest } from 'inngest'

export const inngest = new Inngest({ id: 'cardedge' })
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep "inngest/client" | head -5
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add inngest/client.ts
git commit -m "feat: add Inngest client"
```

---

## Phase 2 — Watchlist Management

### Task 9: Watchlist API routes

**Files:**
- Create: `app/api/watchlists/route.ts`
- Create: `app/api/watchlists/[id]/route.ts`
- Create: `app/api/watchlists/[id]/toggle/route.ts`

> **Note:** This project uses Next.js 16.2.7. Before writing route handlers, read `node_modules/next/dist/docs/` for the current `params` API. In Next.js 15+, `params` in dynamic routes is a `Promise`. Use `const { id } = await params` as shown below.

- [ ] **Step 1: Create app/api/watchlists/route.ts**

```typescript
import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('watchlists')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: Request) {
  const supabase = createServerClient()
  const body = (await req.json()) as {
    name: string
    player: string
    set?: string
    grade?: string
    min_roi_pct?: string
    max_price?: string
  }

  const { data, error } = await supabase
    .from('watchlists')
    .insert({
      name: body.name,
      filters: {
        player: body.player,
        set: body.set ?? '',
        grade: body.grade ?? 'Any',
        min_roi_pct: Number(body.min_roi_pct ?? 15),
        max_price: body.max_price ? Number(body.max_price) : null,
      },
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
```

- [ ] **Step 2: Create app/api/watchlists/[id]/route.ts**

```typescript
import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = createServerClient()
  const body = (await req.json()) as {
    name: string
    player: string
    set?: string
    grade?: string
    min_roi_pct?: string
    max_price?: string
  }

  const { data, error } = await supabase
    .from('watchlists')
    .update({
      name: body.name,
      filters: {
        player: body.player,
        set: body.set ?? '',
        grade: body.grade ?? 'Any',
        min_roi_pct: Number(body.min_roi_pct ?? 15),
        max_price: body.max_price ? Number(body.max_price) : null,
      },
      updated_at: new Date().toISOString(),
    })
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
  const { error } = await supabase.from('watchlists').delete().eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return new NextResponse(null, { status: 204 })
}
```

- [ ] **Step 3: Create app/api/watchlists/[id]/toggle/route.ts**

```typescript
import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

export async function PATCH(
  _: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = createServerClient()

  const { data: current, error: fetchError } = await supabase
    .from('watchlists')
    .select('is_active')
    .eq('id', id)
    .single()

  if (fetchError)
    return NextResponse.json({ error: fetchError.message }, { status: 500 })

  const { data, error } = await supabase
    .from('watchlists')
    .update({ is_active: !current.is_active, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
```

- [ ] **Step 4: Start dev server and smoke-test with curl**

In one terminal:
```bash
npm run dev
```

In another terminal (wait for server to be ready):
```bash
# Create a watchlist
curl -s -X POST http://localhost:3000/api/watchlists \
  -H "Content-Type: application/json" \
  -d '{"name":"Mahomes Prizms","player":"Patrick Mahomes","set":"Prizm","grade":"PSA 10","min_roi_pct":"15"}' | jq .
```

Expected: JSON response with a new watchlist including an `id` UUID.

```bash
# List watchlists
curl -s http://localhost:3000/api/watchlists | jq .
```

Expected: array containing the watchlist just created.

Save the returned `id` for the next test:
```bash
# Toggle active (replace ID with actual UUID from above)
curl -s -X PATCH http://localhost:3000/api/watchlists/REPLACE_WITH_ID/toggle | jq .is_active
```

Expected: `false` (toggled off from default `true`).

```bash
# Toggle back
curl -s -X PATCH http://localhost:3000/api/watchlists/REPLACE_WITH_ID/toggle | jq .is_active
```

Expected: `true`.

- [ ] **Step 5: Commit**

```bash
git add app/api/watchlists/
git commit -m "feat: add watchlist CRUD API routes"
```

---

### Task 10: WatchlistForm component

**Files:**
- Create: `components/deals/WatchlistForm.tsx`

- [ ] **Step 1: Create components/deals/WatchlistForm.tsx**

```typescript
'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'

const GRADES = ['Any', 'Raw', 'PSA 9', 'PSA 10', 'BGS 9.5', 'BGS 10', 'SGC 10']

interface WatchlistFormInitial {
  id?: string
  name: string
  player: string
  set: string
  grade: string
  min_roi_pct: number
  max_price: number | null
}

interface WatchlistFormProps {
  initial?: WatchlistFormInitial
  onSave: () => void
  onCancel: () => void
}

export function WatchlistForm({ initial, onSave, onCancel }: WatchlistFormProps) {
  const [name, setName] = useState(initial?.name ?? '')
  const [player, setPlayer] = useState(initial?.player ?? '')
  const [set, setSet] = useState(initial?.set ?? '')
  const [grade, setGrade] = useState(initial?.grade ?? 'Any')
  const [minRoi, setMinRoi] = useState(String(initial?.min_roi_pct ?? 15))
  const [maxPrice, setMaxPrice] = useState(
    initial?.max_price != null ? String(initial.max_price) : ''
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setError('Name is required'); return }
    if (!player.trim()) { setError('Player is required'); return }
    setSaving(true)
    setError('')

    const url = initial?.id ? `/api/watchlists/${initial.id}` : '/api/watchlists'
    const method = initial?.id ? 'PATCH' : 'POST'
    const body = { name, player, set, grade, min_roi_pct: minRoi, max_price: maxPrice }

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const data = (await res.json()) as { error?: string }
      setError(data.error ?? 'Save failed')
      setSaving(false)
      return
    }

    onSave()
  }

  const inputCls =
    'w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500'
  const labelCls = 'block text-xs font-medium text-slate-500 mb-1'

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className={labelCls}>Watchlist Name *</label>
        <input
          className={inputCls}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Mahomes Prizms"
        />
      </div>
      <div>
        <label className={labelCls}>Player *</label>
        <input
          className={inputCls}
          value={player}
          onChange={(e) => setPlayer(e.target.value)}
          placeholder="e.g. Patrick Mahomes"
        />
      </div>
      <div>
        <label className={labelCls}>Set</label>
        <input
          className={inputCls}
          value={set}
          onChange={(e) => setSet(e.target.value)}
          placeholder="e.g. Prizm"
        />
      </div>
      <div>
        <label className={labelCls}>Grade</label>
        <select
          className={inputCls}
          value={grade}
          onChange={(e) => setGrade(e.target.value)}
        >
          {GRADES.map((g) => (
            <option key={g}>{g}</option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Min ROI %</label>
          <input
            className={inputCls}
            type="number"
            min="0"
            value={minRoi}
            onChange={(e) => setMinRoi(e.target.value)}
          />
        </div>
        <div>
          <label className={labelCls}>Max Price ($)</label>
          <input
            className={inputCls}
            type="number"
            min="0"
            value={maxPrice}
            onChange={(e) => setMaxPrice(e.target.value)}
            placeholder="No limit"
          />
        </div>
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
      <div className="flex gap-2 justify-end">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </form>
  )
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep "WatchlistForm" | head -10
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/deals/WatchlistForm.tsx
git commit -m "feat: add WatchlistForm component"
```

---

### Task 11: WatchlistCard and WatchlistPanel components

**Files:**
- Create: `components/deals/WatchlistCard.tsx`
- Create: `components/deals/WatchlistPanel.tsx`

- [ ] **Step 1: Create components/deals/WatchlistCard.tsx**

```typescript
'use client'

import { useState } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { WatchlistForm } from './WatchlistForm'

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
  is_active: boolean
}

interface WatchlistCardProps {
  watchlist: Watchlist
  onUpdate: () => void
}

export function WatchlistCard({ watchlist, onUpdate }: WatchlistCardProps) {
  const [editing, setEditing] = useState(false)
  const [toggling, setToggling] = useState(false)

  const f = watchlist.filters
  const summary = [
    f.player,
    f.set,
    f.grade !== 'Any' ? f.grade : '',
    `≥${f.min_roi_pct}% ROI`,
    f.max_price ? `≤$${f.max_price}` : '',
  ]
    .filter(Boolean)
    .join(' · ')

  async function handleToggle() {
    setToggling(true)
    await fetch(`/api/watchlists/${watchlist.id}/toggle`, { method: 'PATCH' })
    onUpdate()
    setToggling(false)
  }

  async function handleDelete() {
    if (!confirm(`Delete "${watchlist.name}"?`)) return
    await fetch(`/api/watchlists/${watchlist.id}`, { method: 'DELETE' })
    onUpdate()
  }

  if (editing) {
    return (
      <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-4">
        <WatchlistForm
          initial={{
            id: watchlist.id,
            name: watchlist.name,
            ...f,
          }}
          onSave={() => {
            setEditing(false)
            onUpdate()
          }}
          onCancel={() => setEditing(false)}
        />
      </div>
    )
  }

  return (
    <div className="flex items-start gap-3 border border-slate-200 dark:border-slate-700 rounded-lg p-4">
      {/* Active toggle */}
      <button
        onClick={handleToggle}
        disabled={toggling}
        aria-label={watchlist.is_active ? 'Deactivate' : 'Activate'}
        className={`mt-0.5 w-9 h-5 rounded-full transition-colors flex-shrink-0 ${
          watchlist.is_active
            ? 'bg-indigo-500'
            : 'bg-slate-300 dark:bg-slate-600'
        }`}
      >
        <span
          className={`block w-4 h-4 rounded-full bg-white shadow transition-transform mx-0.5 ${
            watchlist.is_active ? 'translate-x-4' : 'translate-x-0'
          }`}
        />
      </button>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
          {watchlist.name}
        </p>
        <p className="text-xs text-slate-400 truncate">{summary}</p>
      </div>
      <div className="flex gap-1">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => setEditing(true)}
          aria-label="Edit watchlist"
        >
          <Pencil />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={handleDelete}
          aria-label="Delete watchlist"
        >
          <Trash2 />
        </Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create components/deals/WatchlistPanel.tsx**

```typescript
'use client'

import { useCallback, useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { WatchlistCard } from './WatchlistCard'
import { WatchlistForm } from './WatchlistForm'

interface Watchlist {
  id: string
  name: string
  filters: {
    player: string
    set: string
    grade: string
    min_roi_pct: number
    max_price: number | null
  }
  is_active: boolean
}

export function WatchlistPanel() {
  const [watchlists, setWatchlists] = useState<Watchlist[]>([])
  const [creating, setCreating] = useState(false)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const res = await fetch('/api/watchlists')
    const data = (await res.json()) as Watchlist[]
    setWatchlists(Array.isArray(data) ? data : [])
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
          Watchlists
        </h2>
        <Button size="sm" onClick={() => setCreating(true)} disabled={creating}>
          <Plus /> New
        </Button>
      </div>

      {creating && (
        <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-4">
          <WatchlistForm
            onSave={() => {
              setCreating(false)
              void load()
            }}
            onCancel={() => setCreating(false)}
          />
        </div>
      )}

      {loading ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : watchlists.length === 0 && !creating ? (
        <p className="text-sm text-slate-400">
          No watchlists yet. Create one to start scanning.
        </p>
      ) : (
        <div className="space-y-3">
          {watchlists.map((w) => (
            <WatchlistCard key={w.id} watchlist={w} onUpdate={() => void load()} />
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep -E "WatchlistCard|WatchlistPanel" | head -10
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add components/deals/WatchlistCard.tsx components/deals/WatchlistPanel.tsx
git commit -m "feat: add WatchlistCard and WatchlistPanel UI components"
```

---

### Task 12: Update /deals page — two-panel layout

**Files:**
- Modify: `app/(app)/deals/page.tsx`

- [ ] **Step 1: Replace deals page with two-panel layout**

Open `app/(app)/deals/page.tsx` and replace the entire content with:

```typescript
import { WatchlistPanel } from '@/components/deals/WatchlistPanel'

export default function DealsPage() {
  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
          Deal Discovery
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          Live scanning across eBay for cards priced below fair value.
        </p>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
        {/* Alert feed placeholder — replaced in Phase 4 */}
        <div className="flex flex-col items-center justify-center min-h-[300px] border border-dashed border-slate-200 dark:border-slate-800 rounded-lg">
          <p className="text-sm font-medium text-slate-500">Live Alerts</p>
          <p className="text-xs text-slate-400 mt-1">
            Alerts will appear here once the scanner is running.
          </p>
        </div>
        <WatchlistPanel />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Open browser and verify the page loads**

With dev server running at `http://localhost:3000`, navigate to `http://localhost:3000/deals`.

Expected: Two-column layout — placeholder on the left, WatchlistPanel on the right. "New" button visible. Try creating a watchlist: click "New", fill in Name and Player, click Save. Should appear in the list. Toggle the active switch — should toggle. Click Edit — form should appear inline. Click Delete — confirm dialog → watchlist removed.

- [ ] **Step 3: Commit**

```bash
git add app/\(app\)/deals/page.tsx
git commit -m "feat: update /deals page with two-panel layout and WatchlistPanel"
```

---

## Phase 3 — Scanner Engine

### Task 13: Deal scanner Inngest function

**Files:**
- Create: `inngest/deal-scanner.ts`

- [ ] **Step 1: Create inngest/deal-scanner.ts**

```typescript
import { inngest } from './client'
import { createServerClient } from '@/lib/supabase/server'
import { searchListings } from '@/lib/ebay/browse'
import { fetchSoldComps } from '@/lib/ebay/finding'
import { calculateFairValue, calculateRoiPct } from '@/lib/fair-value'

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
  filters: WatchlistFilters
}

export const dealScanner = inngest.createFunction(
  { id: 'deal-scanner' },
  { cron: '*/5 * * * *' },
  async ({ step }) => {
    const supabase = createServerClient()

    const watchlists = await step.run('fetch-watchlists', async () => {
      const { data, error } = await supabase
        .from('watchlists')
        .select('id, filters')
        .eq('is_active', true)
      if (error) throw new Error(error.message)
      return (data ?? []) as Watchlist[]
    })

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

      if (listings.length === 0) continue

      // Refresh comps if last refresh was more than 1 hour ago
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

      // Load 90 days of comps for fair value
      const ninetyDaysAgo = new Date()
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)

      const { data: cacheRows } = await supabase
        .from('price_cache')
        .select('sale_price, sale_date')
        .eq('card_key', cardKey)
        .gte('sale_date', ninetyDaysAgo.toISOString())
        .order('sale_date', { ascending: false })

      if (!cacheRows || cacheRows.length < 3) continue

      const fairValueResult = calculateFairValue(
        cacheRows.map((r) => ({
          price: r.sale_price as number,
          saleDate: new Date(r.sale_date as string),
        }))
      )
      if (!fairValueResult) continue

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

        // Skip if this eBay item was already alerted (unique constraint)
        if (error && error.code === '23505') continue
        if (error) throw new Error(error.message)

        totalAlerts++
      }
    }

    return { watchlistsScanned: watchlists.length, alertsGenerated: totalAlerts }
  }
)
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep "inngest/deal-scanner" | head -10
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add inngest/deal-scanner.ts
git commit -m "feat: add deal scanner Inngest function (5-min eBay cron)"
```

---

### Task 14: Inngest API route handler

**Files:**
- Create: `app/api/inngest/route.ts`

- [ ] **Step 1: Create app/api/inngest/route.ts**

```typescript
import { serve } from 'inngest/next'
import { inngest } from '@/inngest/client'
import { dealScanner } from '@/inngest/deal-scanner'

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [dealScanner],
})
```

- [ ] **Step 2: Verify the route resolves**

With dev server running:
```bash
curl -s http://localhost:3000/api/inngest | head -5
```

Expected: a JSON response from Inngest (it returns function metadata on GET). Should not return 404 or 500.

- [ ] **Step 3: Test locally with Inngest Dev Server (optional but recommended)**

In a separate terminal:
```bash
npx inngest-cli@latest dev -u http://localhost:3000/api/inngest
```

Expected: Inngest dev dashboard opens at `http://localhost:8288`. The `deal-scanner` function should appear. You can trigger it manually from the UI.

- [ ] **Step 4: Commit**

```bash
git add app/api/inngest/route.ts
git commit -m "feat: add Inngest webhook route handler"
```

---

## Phase 4 — In-App Alert Feed

### Task 15: Alert API routes

**Files:**
- Create: `app/api/alerts/route.ts`
- Create: `app/api/alerts/[id]/route.ts`
- Create: `app/api/alerts/mark-all-read/route.ts`

- [ ] **Step 1: Create app/api/alerts/route.ts**

```typescript
import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('alerts')
    .select('*, watchlists(name)')
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
```

- [ ] **Step 2: Create app/api/alerts/[id]/route.ts**

```typescript
import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

export async function PATCH(
  _: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('alerts')
    .update({ is_read: true })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
```

- [ ] **Step 3: Create app/api/alerts/mark-all-read/route.ts**

```typescript
import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

export async function POST() {
  const supabase = createServerClient()
  const { error } = await supabase
    .from('alerts')
    .update({ is_read: true })
    .eq('is_read', false)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 4: Smoke-test alert routes**

```bash
# List alerts (empty initially)
curl -s http://localhost:3000/api/alerts | jq .
```

Expected: empty array `[]`.

Manually insert a test alert in Supabase SQL Editor to verify the JOIN works:
```sql
-- Get a watchlist ID first
select id from watchlists limit 1;

-- Insert test alert (replace WATCHLIST_ID with real UUID)
insert into alerts (watchlist_id, ebay_item_id, card_title, listed_price, fair_value, roi_pct, listing_url)
values ('WATCHLIST_ID', 'test-item-001', 'Test Mahomes PSA 10', 180.00, 231.00, 22.08, 'https://ebay.com');
```

```bash
curl -s http://localhost:3000/api/alerts | jq '.[0] | {title: .card_title, roi: .roi_pct, watchlist: .watchlists.name}'
```

Expected: `{"title":"Test Mahomes PSA 10","roi":22.08,"watchlist":"Mahomes Prizms"}` (or whatever watchlist name you created).

- [ ] **Step 5: Commit**

```bash
git add app/api/alerts/
git commit -m "feat: add alert API routes (list, mark read)"
```

---

### Task 16: AlertCard component

**Files:**
- Create: `components/deals/AlertCard.tsx`

- [ ] **Step 1: Create components/deals/AlertCard.tsx**

```typescript
'use client'

import { ExternalLink } from 'lucide-react'

export interface Alert {
  id: string
  card_title: string
  listed_price: number
  fair_value: number
  roi_pct: number
  grade: string | null
  player: string | null
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
        <img
          src={alert.image_url}
          alt={alert.card_title}
          className="w-12 h-12 object-cover rounded flex-shrink-0"
        />
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
          <span className="text-slate-400">
            {' '}· ${alert.fair_value.toFixed(2)} FV
          </span>
        </p>
        <div className="flex items-center justify-between mt-2">
          <span className="text-xs text-slate-400">
            {alert.watchlists?.name} · {timeAgo(alert.created_at)}
          </span>
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
  )
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep "AlertCard" | head -10
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/deals/AlertCard.tsx
git commit -m "feat: add AlertCard component"
```

---

### Task 17: AlertFeed component and complete /deals page

**Files:**
- Create: `components/deals/AlertFeed.tsx`
- Modify: `app/(app)/deals/page.tsx`

- [ ] **Step 1: Create components/deals/AlertFeed.tsx**

```typescript
'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { supabase } from '@/lib/supabase/client'
import { AlertCard, type Alert } from './AlertCard'

export function AlertFeed() {
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const res = await fetch('/api/alerts')
    const data = (await res.json()) as Alert[]
    setAlerts(Array.isArray(data) ? data : [])
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()

    const channel = supabase
      .channel('alerts-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'alerts' },
        () => {
          // Re-fetch to get the watchlist name JOIN
          void load()
        }
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [load])

  async function handleRead(id: string) {
    await fetch(`/api/alerts/${id}`, { method: 'PATCH' })
    setAlerts((prev) =>
      prev.map((a) => (a.id === id ? { ...a, is_read: true } : a))
    )
  }

  async function handleMarkAllRead() {
    await fetch('/api/alerts/mark-all-read', { method: 'POST' })
    setAlerts((prev) => prev.map((a) => ({ ...a, is_read: true })))
  }

  const unreadCount = alerts.filter((a) => !a.is_read).length

  if (loading) {
    return <p className="text-sm text-slate-400 p-4">Loading…</p>
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Live Alerts
          </h2>
          {unreadCount > 0 && (
            <span className="text-xs bg-indigo-500 text-white px-1.5 py-0.5 rounded-full font-medium">
              {unreadCount}
            </span>
          )}
        </div>
        {unreadCount > 0 && (
          <Button variant="ghost" size="sm" onClick={() => void handleMarkAllRead()}>
            Mark all read
          </Button>
        )}
      </div>

      {alerts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-lg">
          <p className="text-sm font-medium text-slate-500">No alerts yet</p>
          <p className="text-xs text-slate-400 mt-1">
            Add a watchlist to start scanning.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {alerts.map((a) => (
            <AlertCard key={a.id} alert={a} onRead={(id) => void handleRead(id)} />
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Update app/(app)/deals/page.tsx to include AlertFeed**

Replace the entire content of `app/(app)/deals/page.tsx` with:

```typescript
import { AlertFeed } from '@/components/deals/AlertFeed'
import { WatchlistPanel } from '@/components/deals/WatchlistPanel'

export default function DealsPage() {
  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
          Deal Discovery
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          Live scanning across eBay for cards priced below fair value.
        </p>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
        <AlertFeed />
        <WatchlistPanel />
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Verify in browser**

Navigate to `http://localhost:3000/deals`.

Expected:
- Left panel shows "No alerts yet" empty state (or the test alert inserted in Task 15)
- Right panel shows your watchlist(s)
- If you have the test alert from Task 15, it should show as unread (indigo border/dot)
- Clicking the alert marks it read (indigo styling removed)
- Inserting a new row directly in Supabase SQL Editor should make it appear without a page refresh (realtime working):

In Supabase SQL Editor:
```sql
insert into alerts (watchlist_id, ebay_item_id, card_title, listed_price, fair_value, roi_pct, listing_url)
values (
  (select id from watchlists limit 1),
  'realtime-test-002',
  'Realtime Test Card',
  90.00,
  120.00,
  25.00,
  'https://ebay.com'
);
```

Expected: card appears in the feed within 1-2 seconds without refreshing the page.

- [ ] **Step 4: Commit**

```bash
git add components/deals/AlertFeed.tsx app/\(app\)/deals/page.tsx
git commit -m "feat: add AlertFeed with Supabase realtime subscription"
```

---

## Phase 5 — Notifications

### Task 18: Service worker and Web Push utility

**Files:**
- Create: `public/sw.js`
- Create: `lib/push.ts`

- [ ] **Step 1: Create public/sw.js**

```javascript
self.addEventListener('push', (event) => {
  const data = event.data?.json() ?? {}
  event.waitUntil(
    self.registration.showNotification(data.title ?? 'CardEdge Alert', {
      body: data.body ?? '',
      icon: '/favicon.ico',
      data: { url: data.url },
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  if (event.notification.data?.url) {
    event.waitUntil(
      // eslint-disable-next-line no-undef
      clients.openWindow(event.notification.data.url)
    )
  }
})
```

- [ ] **Step 2: Create lib/push.ts**

```typescript
import webpush from 'web-push'
import { createServerClient } from './supabase/server'

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT!,
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
)

export async function sendPushToAll(title: string, body: string, url: string) {
  const supabase = createServerClient()
  const { data: subs } = await supabase.from('push_subscriptions').select('*')
  if (!subs?.length) return

  const payload = JSON.stringify({ title, body, url })

  await Promise.allSettled(
    subs.map((sub) =>
      webpush.sendNotification(
        {
          endpoint: sub.endpoint as string,
          keys: { p256dh: sub.p256dh as string, auth: sub.auth as string },
        },
        payload
      )
    )
  )
}
```

- [ ] **Step 3: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep -E "push|sw" | head -10
```

Expected: no errors on `lib/push.ts`. (`public/sw.js` is plain JS, not type-checked.)

- [ ] **Step 4: Commit**

```bash
git add public/sw.js lib/push.ts
git commit -m "feat: add service worker and Web Push utility"
```

---

### Task 19: Resend email utility

**Files:**
- Create: `lib/resend.ts`

- [ ] **Step 1: Create lib/resend.ts**

```typescript
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

interface AlertEmailData {
  cardTitle: string
  listedPrice: number
  fairValue: number
  roiPct: number
  listingUrl: string
}

export async function sendAlertEmail(to: string, alert: AlertEmailData) {
  await resend.emails.send({
    from: 'CardEdge <alerts@cardedge.co>',
    to,
    subject: `Deal Alert: ${alert.cardTitle} (+${alert.roiPct.toFixed(1)}% below market)`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
        <h2 style="color:#4f46e5;margin-bottom:16px">New Deal Alert</h2>
        <p style="font-size:16px;font-weight:600;margin-bottom:8px">${alert.cardTitle}</p>
        <p style="color:#6b7280;margin-bottom:4px">
          Listed at <strong>$${alert.listedPrice.toFixed(2)}</strong>
          &nbsp;vs fair value of <strong>$${alert.fairValue.toFixed(2)}</strong>
        </p>
        <p style="font-size:18px;color:#059669;font-weight:700;margin:12px 0">
          +${alert.roiPct.toFixed(1)}% below market
        </p>
        <a
          href="${alert.listingUrl}"
          style="display:inline-block;padding:10px 20px;background:#4f46e5;color:white;text-decoration:none;border-radius:6px;font-weight:600"
        >
          View on eBay &rarr;
        </a>
      </div>
    `,
  })
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep "lib/resend" | head -10
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/resend.ts
git commit -m "feat: add Resend email utility for alert notifications"
```

---

### Task 20: Notification preferences API routes

**Files:**
- Create: `app/api/notifications/preferences/route.ts`

- [ ] **Step 1: Create app/api/notifications/preferences/route.ts**

The placeholder `user_id` `'00000000-0000-0000-0000-000000000001'` is used until auth is added.

```typescript
import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

const PLACEHOLDER_USER_ID = '00000000-0000-0000-0000-000000000001'

const DEFAULT_PREFS = {
  email_enabled: false,
  email_address: 'david_daniel@college.harvard.edu',
  push_enabled: false,
  in_app_enabled: true,
}

export async function GET() {
  const supabase = createServerClient()
  const { data } = await supabase
    .from('notification_preferences')
    .select('*')
    .eq('user_id', PLACEHOLDER_USER_ID)
    .single()

  return NextResponse.json(data ?? DEFAULT_PREFS)
}

export async function PATCH(req: Request) {
  const supabase = createServerClient()
  const body = (await req.json()) as {
    email_enabled?: boolean
    email_address?: string
    push_enabled?: boolean
  }

  const { data, error } = await supabase
    .from('notification_preferences')
    .upsert({
      user_id: PLACEHOLDER_USER_ID,
      email_enabled: body.email_enabled ?? false,
      email_address: body.email_address ?? '',
      push_enabled: body.push_enabled ?? false,
      in_app_enabled: true,
      updated_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
```

- [ ] **Step 2: Smoke-test**

```bash
# GET (default prefs)
curl -s http://localhost:3000/api/notifications/preferences | jq .

# PATCH (enable email)
curl -s -X PATCH http://localhost:3000/api/notifications/preferences \
  -H "Content-Type: application/json" \
  -d '{"email_enabled":true,"email_address":"david_daniel@college.harvard.edu"}' | jq .email_enabled
```

Expected first call: `{"email_enabled":false,"email_address":"david_daniel@college.harvard.edu",...}`
Expected second call: `true`

- [ ] **Step 3: Commit**

```bash
git add app/api/notifications/preferences/
git commit -m "feat: add notification preferences API routes"
```

---

### Task 21: Push subscription API routes

**Files:**
- Create: `app/api/notifications/subscribe/route.ts`

- [ ] **Step 1: Create app/api/notifications/subscribe/route.ts**

```typescript
import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

const PLACEHOLDER_USER_ID = '00000000-0000-0000-0000-000000000001'

export async function POST(req: Request) {
  const supabase = createServerClient()
  const body = (await req.json()) as {
    endpoint: string
    keys: { p256dh: string; auth: string }
  }

  const { error } = await supabase.from('push_subscriptions').upsert({
    user_id: PLACEHOLDER_USER_ID,
    endpoint: body.endpoint,
    p256dh: body.keys.p256dh,
    auth: body.keys.auth,
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: Request) {
  const supabase = createServerClient()
  const body = (await req.json()) as { endpoint: string }

  const { error } = await supabase
    .from('push_subscriptions')
    .delete()
    .eq('endpoint', body.endpoint)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return new NextResponse(null, { status: 204 })
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep "notifications/subscribe" | head -10
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/api/notifications/subscribe/
git commit -m "feat: add push subscription API routes"
```

---

### Task 22: Wire notifications into the scanner

**Files:**
- Modify: `inngest/deal-scanner.ts`

- [ ] **Step 1: Add notification imports and sending to deal-scanner.ts**

Open `inngest/deal-scanner.ts`. Add imports at the top (after existing imports):

```typescript
import { sendAlertEmail } from '@/lib/resend'
import { sendPushToAll } from '@/lib/push'
```

Add a prefs fetch step **after** the `fetch-watchlists` step and **before** the `for (const watchlist of watchlists)` loop:

```typescript
    const { data: prefs } = await supabase
      .from('notification_preferences')
      .select('email_enabled, email_address, push_enabled')
      .limit(1)
      .maybeSingle()
```

Then inside the `for (const listing of listings)` loop, after `totalAlerts++`, add:

```typescript
        if (prefs?.email_enabled && prefs.email_address) {
          await sendAlertEmail(prefs.email_address, {
            cardTitle: listing.title,
            listedPrice: listing.price,
            fairValue: Math.round(fairValueResult.fairValue * 100) / 100,
            roiPct: Math.round(roiPct * 100) / 100,
            listingUrl: listing.listingUrl,
          }).catch(() => {})
        }

        if (prefs?.push_enabled) {
          await sendPushToAll(
            'New Deal Alert',
            `${listing.title} — +${Math.round(roiPct)}% below market`,
            listing.listingUrl
          ).catch(() => {})
        }
```

The `.catch(() => {})` pattern ensures email/push failures don't throw and don't block the scan.

The complete `deal-scanner.ts` after these changes:

```typescript
import { inngest } from './client'
import { createServerClient } from '@/lib/supabase/server'
import { searchListings } from '@/lib/ebay/browse'
import { fetchSoldComps } from '@/lib/ebay/finding'
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
  filters: WatchlistFilters
}

export const dealScanner = inngest.createFunction(
  { id: 'deal-scanner' },
  { cron: '*/5 * * * *' },
  async ({ step }) => {
    const supabase = createServerClient()

    const watchlists = await step.run('fetch-watchlists', async () => {
      const { data, error } = await supabase
        .from('watchlists')
        .select('id, filters')
        .eq('is_active', true)
      if (error) throw new Error(error.message)
      return (data ?? []) as Watchlist[]
    })

    // Fetch prefs once per scan run (not per alert)
    const { data: prefs } = await supabase
      .from('notification_preferences')
      .select('email_enabled, email_address, push_enabled')
      .limit(1)
      .maybeSingle()

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

      if (listings.length === 0) continue

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

      const ninetyDaysAgo = new Date()
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)

      const { data: cacheRows } = await supabase
        .from('price_cache')
        .select('sale_price, sale_date')
        .eq('card_key', cardKey)
        .gte('sale_date', ninetyDaysAgo.toISOString())
        .order('sale_date', { ascending: false })

      if (!cacheRows || cacheRows.length < 3) continue

      const fairValueResult = calculateFairValue(
        cacheRows.map((r) => ({
          price: r.sale_price as number,
          saleDate: new Date(r.sale_date as string),
        }))
      )
      if (!fairValueResult) continue

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

        if (error && error.code === '23505') continue
        if (error) throw new Error(error.message)

        totalAlerts++

        if (prefs?.email_enabled && prefs.email_address) {
          await sendAlertEmail(prefs.email_address, {
            cardTitle: listing.title,
            listedPrice: listing.price,
            fairValue: Math.round(fairValueResult.fairValue * 100) / 100,
            roiPct: Math.round(roiPct * 100) / 100,
            listingUrl: listing.listingUrl,
          }).catch(() => {})
        }

        if (prefs?.push_enabled) {
          await sendPushToAll(
            'New Deal Alert',
            `${listing.title} — +${Math.round(roiPct)}% below market`,
            listing.listingUrl
          ).catch(() => {})
        }
      }
    }

    return { watchlistsScanned: watchlists.length, alertsGenerated: totalAlerts }
  }
)
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep "deal-scanner" | head -10
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add inngest/deal-scanner.ts
git commit -m "feat: wire email and push notifications into deal scanner"
```

---

### Task 23: Notification settings UI

**Files:**
- Create: `components/notifications/PushPermissionBanner.tsx`
- Create: `components/settings/NotificationPreferences.tsx`
- Modify: `app/(app)/settings/page.tsx`

- [ ] **Step 1: Create components/notifications/PushPermissionBanner.tsx**

```typescript
'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'

interface PushPermissionBannerProps {
  onSubscribed: () => void
}

export function PushPermissionBanner({ onSubscribed }: PushPermissionBannerProps) {
  const [supported, setSupported] = useState(false)
  const [subscribed, setSubscribed] = useState(false)
  const [requesting, setRequesting] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    setSupported('serviceWorker' in navigator && 'PushManager' in window)
    void (async () => {
      const reg = await navigator.serviceWorker.getRegistration()
      if (!reg) return
      const sub = await reg.pushManager.getSubscription()
      setSubscribed(!!sub)
    })()
  }, [])

  async function handleEnable() {
    setRequesting(true)
    try {
      const reg = await navigator.serviceWorker.register('/sw.js')
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') { setRequesting(false); return }

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
      })

      await fetch('/api/notifications/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sub.toJSON()),
      })

      setSubscribed(true)
      onSubscribed()
    } catch {
      // Browser blocked or not supported
    }
    setRequesting(false)
  }

  if (!supported || subscribed) return null

  return (
    <div className="flex items-center justify-between gap-4 p-3 bg-indigo-50 dark:bg-indigo-950/30 rounded-lg border border-indigo-200 dark:border-indigo-900">
      <p className="text-sm text-slate-700 dark:text-slate-300">
        Enable browser push for instant deal alerts.
      </p>
      <Button size="sm" onClick={() => void handleEnable()} disabled={requesting}>
        {requesting ? 'Enabling…' : 'Enable'}
      </Button>
    </div>
  )
}
```

- [ ] **Step 2: Create components/settings/NotificationPreferences.tsx**

```typescript
'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Button } from '@/components/ui/button'
import { PushPermissionBanner } from '@/components/notifications/PushPermissionBanner'

interface Prefs {
  email_enabled: boolean
  email_address: string
  push_enabled: boolean
  in_app_enabled: boolean
}

export function NotificationPreferences() {
  const [prefs, setPrefs] = useState<Prefs>({
    email_enabled: false,
    email_address: 'david_daniel@college.harvard.edu',
    push_enabled: false,
    in_app_enabled: true,
  })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    void fetch('/api/notifications/preferences')
      .then((r) => r.json())
      .then((data: Partial<Prefs>) => setPrefs((p) => ({ ...p, ...data })))
  }, [])

  async function handleSave() {
    setSaving(true)
    await fetch('/api/notifications/preferences', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(prefs),
    })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  function Toggle({
    on,
    disabled,
    onToggle,
    label,
  }: {
    on: boolean
    disabled?: boolean
    onToggle?: () => void
    label: string
  }) {
    return (
      <button
        onClick={onToggle}
        disabled={disabled}
        aria-label={label}
        className={`w-9 h-5 rounded-full transition-colors flex-shrink-0 ${
          on ? 'bg-indigo-500' : 'bg-slate-300 dark:bg-slate-600'
        } disabled:opacity-60`}
      >
        <span
          className={`block w-4 h-4 rounded-full bg-white shadow transition-transform mx-0.5 ${
            on ? 'translate-x-4' : 'translate-x-0'
          }`}
        />
      </button>
    )
  }

  return (
    <Card className="dark:bg-slate-900 dark:border-slate-800">
      <CardHeader>
        <CardTitle className="text-base">Notifications</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <PushPermissionBanner
          onSubscribed={() => setPrefs((p) => ({ ...p, push_enabled: true }))}
        />

        {/* In-app */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
              In-app alerts
            </p>
            <p className="text-xs text-slate-400">Always enabled</p>
          </div>
          <Toggle on={true} disabled label="In-app alerts (always on)" />
        </div>

        <Separator className="dark:bg-slate-800" />

        {/* Email */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
              Email alerts
            </p>
            {prefs.email_enabled && (
              <input
                className="mt-1 w-full rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1 text-xs text-slate-900 dark:text-slate-100"
                value={prefs.email_address}
                onChange={(e) =>
                  setPrefs((p) => ({ ...p, email_address: e.target.value }))
                }
              />
            )}
          </div>
          <Toggle
            on={prefs.email_enabled}
            onToggle={() =>
              setPrefs((p) => ({ ...p, email_enabled: !p.email_enabled }))
            }
            label="Toggle email alerts"
          />
        </div>

        <Separator className="dark:bg-slate-800" />

        {/* Push */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
              Browser push
            </p>
            <p className="text-xs text-slate-400">Requires browser permission</p>
          </div>
          <Toggle
            on={prefs.push_enabled}
            onToggle={() =>
              setPrefs((p) => ({ ...p, push_enabled: !p.push_enabled }))
            }
            label="Toggle push alerts"
          />
        </div>

        <div className="flex justify-end pt-2">
          <Button size="sm" onClick={() => void handleSave()} disabled={saving}>
            {saved ? 'Saved!' : saving ? 'Saving…' : 'Save preferences'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 3: Update app/(app)/settings/page.tsx**

Replace the Notifications card section in `app/(app)/settings/page.tsx`. The existing file has three cards (Account, Notifications, Preferences). Replace the Notifications card only:

Find and replace:

```typescript
        {/* Notifications */}
        <Card className="dark:bg-slate-900 dark:border-slate-800">
          <CardHeader>
            <CardTitle className="text-base">Notifications</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-slate-400">
              Notification preferences will be configurable here.
            </p>
          </CardContent>
        </Card>
```

With:

```typescript
        {/* Notifications */}
        <NotificationPreferences />
```

And add the import at the top of the file (after the existing imports):

```typescript
import { NotificationPreferences } from '@/components/settings/NotificationPreferences'
```

The final `app/(app)/settings/page.tsx` should look like:

```typescript
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { NotificationPreferences } from '@/components/settings/NotificationPreferences'

export default function SettingsPage() {
  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-8">Settings</h1>

      <div className="space-y-6">
        {/* Account */}
        <Card className="dark:bg-slate-900 dark:border-slate-800">
          <CardHeader>
            <CardTitle className="text-base">Account</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-xs font-medium text-slate-500 mb-1">Name</p>
              <p className="text-sm text-slate-900 dark:text-slate-100">David Daniel</p>
            </div>
            <Separator className="dark:bg-slate-800" />
            <div>
              <p className="text-xs font-medium text-slate-500 mb-1">Email</p>
              <p className="text-sm text-slate-900 dark:text-slate-100">
                david_daniel@college.harvard.edu
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Notifications */}
        <NotificationPreferences />

        {/* Preferences */}
        <Card className="dark:bg-slate-900 dark:border-slate-800">
          <CardHeader>
            <CardTitle className="text-base">Preferences</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-slate-400">
              Theme and timezone preferences will be configurable here.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep -E "Notification|settings" | head -20
```

Expected: no errors.

- [ ] **Step 5: Verify in browser**

Navigate to `http://localhost:3000/settings`.

Expected:
- Notifications card now shows three toggles: In-app (locked on), Email, Browser push
- Toggle Email → email input appears
- If browser supports push, "Enable browser push" banner appears
- Clicking "Enable" should trigger browser permission prompt
- Save button saves to Supabase (verify in Supabase table editor)

- [ ] **Step 6: Run all tests one final time**

```bash
npm test
```

Expected: all 8 tests pass.

- [ ] **Step 7: Final build check**

```bash
npm run build 2>&1 | tail -20
```

Expected: build completes successfully. Address any TypeScript or lint errors before proceeding.

- [ ] **Step 8: Commit**

```bash
git add components/notifications/PushPermissionBanner.tsx components/settings/NotificationPreferences.tsx app/\(app\)/settings/page.tsx
git commit -m "feat: add notification preferences UI and push permission flow"
```

---

## End-to-End Verification

After all 23 tasks are complete, verify the full flow:

1. **Create a watchlist** at `/deals` — e.g. "Test Watcher", Player: "LeBron James", Min ROI: 10%
2. **Start the Inngest dev server**: `npx inngest-cli@latest dev -u http://localhost:3000/api/inngest`
3. **Trigger the scanner** manually from the Inngest dev dashboard at `http://localhost:8288`
4. **Verify alerts** appear in the feed at `/deals` without page refresh
5. **Enable email** at `/settings` and trigger again — check inbox
6. **Enable push** at `/settings`, grant permission, trigger again — notification should appear in browser
