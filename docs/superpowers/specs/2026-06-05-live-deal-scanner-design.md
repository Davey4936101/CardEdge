# Live Deal Scanner — Design Spec
_Date: 2026-06-05_

## Overview

Build the Live Deal Scanner — CardEdge's first active feature. The scanner monitors eBay in real time, compares live listings against a recency-weighted fair value model, and fires instant alerts when a card matches a user-defined watchlist. Alerts appear in-app (real-time), via email, and via browser push notification.

---

## Stack Additions

| Layer | Choice | Notes |
|---|---|---|
| Database | Supabase (Postgres) | Real-time subscriptions for instant in-app alerts; future auth |
| Background jobs | Inngest | Durable cron-style polling, free tier, works with Next.js/Vercel |
| Email | Resend | Free tier (100/day), React Email templates |
| Browser push | Web Push API + VAPID | Free, no third-party service, built into modern browsers |
| Marketplace data | eBay Browse API + Finding API | Free developer account; Browse for live listings, Finding for sold comps |

---

## Database Schema

### `watchlists`
```sql
id           uuid primary key default gen_random_uuid()
user_id      uuid                          -- placeholder, single user for now
name         text not null
filters      jsonb not null                -- { player, set, grade, min_roi_pct, max_price }
is_active    boolean default true
created_at   timestamptz default now()
updated_at   timestamptz default now()
```

### `alerts`
```sql
id              uuid primary key default gen_random_uuid()
watchlist_id    uuid references watchlists(id) on delete cascade
ebay_item_id    text unique               -- prevents duplicate alerts per listing
card_title      text not null
listed_price    numeric(10,2) not null
fair_value      numeric(10,2) not null
roi_pct         numeric(5,2) not null     -- (fair_value - listed_price) / fair_value * 100
grade           text
player          text
set_name        text
listing_url     text not null
image_url       text
end_time        timestamptz               -- auction end time if applicable
is_read         boolean default false
created_at      timestamptz default now()
```

### `price_cache`
```sql
id          uuid primary key default gen_random_uuid()
card_key    text not null               -- normalized key e.g. "mahomes-prizm-psa-9"
sale_price  numeric(10,2) not null
sale_date   timestamptz not null
source      text default 'ebay'
created_at  timestamptz default now()
```
Index: `(card_key, sale_date desc)` for fast fair value lookups.

### `notification_preferences`
```sql
id              uuid primary key default gen_random_uuid()
user_id         uuid unique
email_enabled   boolean default false
email_address   text
push_enabled    boolean default false
in_app_enabled  boolean default true
updated_at      timestamptz default now()
```

### `push_subscriptions`
```sql
id          uuid primary key default gen_random_uuid()
user_id     uuid
endpoint    text unique
p256dh      text not null
auth        text not null
created_at  timestamptz default now()
```

---

## eBay API Integration

### Authentication
OAuth 2.0 client credentials flow. Token cached in memory, refreshed when expired.
- Endpoint: `https://api.ebay.com/identity/v1/oauth2/token`
- Scope: `https://api.ebay.com/oauth/api_scope`

### Live Listings — Browse API
```
GET https://api.ebay.com/buy/browse/v1/item_summary/search
  ?q={player} {set} {grade}
  &category_ids=212        (Sports Trading Cards)
  &filter=buyingOptions:{FIXED_PRICE|AUCTION},price:[0..{max_price}]
  &sort=newlyListed
  &limit=50
```
Returns: itemId, title, price, condition, image, itemWebUrl, itemEndDate

### Sold Comps — Finding API
```
POST https://svcs.ebay.com/services/search/FindingService/v1
  operation-name: findCompletedItems
  keywords: {player} {set} {grade}
  categoryId: 212
  itemFilter: SoldItemsOnly=true, TimeFrom=90_days_ago
```
Returns: soldPrice, endTime per item — used to build the price cache.

---

## Fair Value Engine

**Input:** `card_key` (e.g. `"mahomes-prizm-psa-9"`) + last 90 days of sold comps from `price_cache`

**Recency weighting:**
```
weight_i = 1 / (days_ago_i + 1)
fair_value = Σ(price_i × weight_i) / Σ(weight_i)
```

Recent sales count more. High-volume periods contribute more data points naturally (volume-weighted by virtue of more rows). Minimum 3 comps required to generate a fair value — if fewer exist, skip the card (insufficient data).

**ROI calculation:**
```
roi_pct = (fair_value - listed_price) / fair_value × 100
```
Alert fires when `roi_pct >= watchlist.filters.min_roi_pct`.

---

## Scanning Loop (Inngest)

**Schedule:** every 5 minutes

**Steps:**
1. Fetch all active watchlists from Supabase
2. For each watchlist:
   a. Build eBay Browse API query from `filters`
   b. Fetch live listings (max 50 per query)
   c. For each listing:
      - Build `card_key` from title parsing
      - Fetch/refresh sold comps into `price_cache` (refresh if > 1 hour old)
      - Calculate fair value
      - Skip if fewer than 3 comps
      - Calculate `roi_pct`
      - Skip if `roi_pct < min_roi_pct`
      - Skip if `ebay_item_id` already exists in `alerts` (dedup)
      - Insert alert row → Supabase real-time fires → in-app feed updates
      - Send email (if `notification_preferences.email_enabled`)
      - Send web push (if `notification_preferences.push_enabled`)
3. Log scan result (watchlist id, listings checked, alerts generated)

**Error handling:** Inngest retries failed steps automatically (up to 3 retries with backoff). eBay API rate limit errors pause and retry after 60s.

---

## API Routes

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/watchlists` | List all watchlists |
| POST | `/api/watchlists` | Create watchlist |
| PATCH | `/api/watchlists/[id]` | Update watchlist |
| DELETE | `/api/watchlists/[id]` | Delete watchlist |
| PATCH | `/api/watchlists/[id]/toggle` | Toggle active/inactive |
| GET | `/api/alerts` | Paginated alert history (unread first) |
| PATCH | `/api/alerts/[id]` | Mark single alert read |
| POST | `/api/alerts/mark-all-read` | Mark all read |
| GET | `/api/notifications/preferences` | Get notification prefs |
| PATCH | `/api/notifications/preferences` | Update notification prefs |
| POST | `/api/notifications/subscribe` | Register push subscription |
| DELETE | `/api/notifications/subscribe` | Remove push subscription |
| POST | `/api/inngest` | Inngest webhook handler |

---

## UI: `/deals` Page

Replace the Coming Soon placeholder with a two-panel layout:

**Left panel — Alert Feed (real-time)**
- Header: "Live Alerts" + unread count badge + "Mark all read" button
- Real-time feed via Supabase subscription — new alerts appear at top without page refresh
- Each `AlertCard` shows:
  - Card title + grade badge
  - ROI badge (green, e.g. "+22% below market")
  - Listed price vs fair value (e.g. "$180 / $231 FV")
  - Watchlist name (small, muted)
  - Time since listed (e.g. "4 min ago")
  - "View on eBay" link
  - Unread indicator (indigo dot)
- Empty state: "No alerts yet. Add a watchlist to start scanning."

**Right panel — Watchlist Manager**
- Header: "Watchlists" + "New Watchlist" button
- List of `WatchlistCard` components showing name, filter summary, active toggle, edit/delete
- `WatchlistForm` (inline drawer or modal) for create/edit:
  - Name (text input)
  - Player (text input, e.g. "Patrick Mahomes")
  - Set (text input, e.g. "Prizm")
  - Grade (select: Raw / PSA 9 / PSA 10 / BGS 9.5 / BGS 10 / SGC 10 / Any)
  - Min ROI % (number input, e.g. 15)
  - Max Price (number input, optional cap)

---

## UI: Settings — Notifications Section

Replace the placeholder Notifications card in `/settings` with a functional panel:

- **In-app alerts** — toggle (always on, non-removable)
- **Email alerts** — toggle + email address input (pre-filled from account)
- **Browser push** — toggle + "Enable" button that triggers browser permission request
- Save button

---

## Component Architecture

```
components/
  deals/
    AlertCard.tsx           # Single alert row
    AlertFeed.tsx           # Real-time feed with Supabase subscription
    WatchlistCard.tsx       # Single watchlist row with toggle
    WatchlistForm.tsx       # Create/edit form (used in drawer)
    WatchlistPanel.tsx      # Right panel: list + new button
  notifications/
    PushPermissionBanner.tsx  # Browser permission request UI

lib/
  ebay/
    auth.ts                 # OAuth token management
    browse.ts               # Browse API (live listings)
    finding.ts              # Finding API (sold comps)
  fair-value.ts             # Recency-weighted fair value calculation
  push.ts                   # Web Push notification sender
  resend.ts                 # Email notification sender

inngest/
  client.ts                 # Inngest client init
  deal-scanner.ts           # The main scanning function

app/
  api/
    watchlists/
      route.ts              # GET, POST
      [id]/
        route.ts            # PATCH, DELETE
        toggle/route.ts     # PATCH toggle active
    alerts/
      route.ts              # GET
      mark-all-read/route.ts
      [id]/route.ts         # PATCH read
    notifications/
      preferences/route.ts  # GET, PATCH
      subscribe/route.ts    # POST, DELETE
    inngest/route.ts        # Inngest webhook
```

---

## Environment Variables

```
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# eBay API
EBAY_CLIENT_ID=
EBAY_CLIENT_SECRET=
EBAY_ENVIRONMENT=production   # or sandbox

# Resend
RESEND_API_KEY=

# Inngest
INNGEST_EVENT_KEY=
INNGEST_SIGNING_KEY=

# Web Push (VAPID)
NEXT_PUBLIC_VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:david_daniel@college.harvard.edu
```

---

## Implementation Phases

| Phase | Scope |
|---|---|
| 1 | Supabase setup, DB schema, eBay API client, fair value engine |
| 2 | Watchlist management — API routes + UI (WatchlistCard, WatchlistForm, WatchlistPanel) |
| 3 | Scanner engine — Inngest job, alert generation, dedup |
| 4 | In-app alert feed — real-time Supabase subscription, AlertCard, AlertFeed |
| 5 | Notifications — Resend email + Web Push + preferences UI in Settings |

---

## Out of Scope (This Feature)

- Multi-user (single user assumed throughout)
- PWCC, Goldin, Whatnot, Fanatics Collect (eBay only for now)
- Mobile push notifications (browser push only)
- Price history charts
- Alert history beyond 30 days
