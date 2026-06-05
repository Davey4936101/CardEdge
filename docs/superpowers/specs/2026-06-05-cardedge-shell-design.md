# CardEdge Shell — Design Spec
_Date: 2026-06-05_

## Overview

Build the full frontend shell for CardEdge: a multi-user SaaS investment platform for the sports card market. This spec covers the HTML/UI scaffold only — no backend, no real data, no auth flows. The goal is a correctly structured, visually complete skeleton that features can be wired into one by one.

---

## Tech Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS |
| Components | shadcn/ui |
| Theming | next-themes (dark/light adaptive) |

---

## Routes

### Public
| Route | Page |
|---|---|
| `/` | Landing page |

### App (no auth enforcement for now)
| Route | Page |
|---|---|
| `/dashboard` | Overview dashboard |
| `/deals` | Deal Discovery |
| `/portfolio` | Portfolio Intelligence |
| `/intelligence` | Acquisition Intelligence |
| `/performance` | Performance Accounting |
| `/settings` | Settings |

Auth pages (`/login`, `/signup`) are explicitly deferred — not scaffolded in this phase.

---

## Navigation

### Landing nav
- Left: CardEdge wordmark (links to `/`)
- Right: "Get Started" button (links to `/dashboard` — placeholder, no auth)

### App nav (persistent across all app routes)
- Left: CardEdge wordmark (links to `/dashboard`)
- Center: Dashboard · Deals · Portfolio · Intelligence · Performance
- Right: notification bell icon (placeholder) · dark/light toggle · user avatar (placeholder initials, no dropdown)
- Active route: underline or indigo highlight on the active nav link
- Mobile: hamburger menu collapses all nav links into a drawer

---

## Theme

### Dark mode (default)
- Background: `slate-950`
- Surface: `slate-900`
- Text: `slate-100`
- Muted text: `slate-400`
- Accent: `indigo-500`
- Border: `slate-800`

### Light mode
- Background: `white` / `slate-50`
- Surface: `white`
- Text: `slate-900`
- Muted text: `slate-500`
- Accent: `indigo-600`
- Border: `slate-200`

`next-themes` manages the toggle. shadcn/ui components inherit both via CSS variables. Toggle lives in the top nav (sun/moon icon).

---

## Landing Page (`/`)

**Hero section**
- Full-width, vertically centered
- Headline: "Wall Street tools for the sports card market."
- Subhead: "CardEdge synthesizes fair value, population dynamics, and market timing into one question: what should you do right now?"
- CTA: "Open Dashboard" button → `/dashboard`

**Feature callouts (3 columns)**
- Deal Discovery: "Live deal scanning across marketplaces. Real-time alerts when cards are priced below fair value."
- Portfolio Intelligence: "True cost basis. Population monitoring. Concentration risk. Know your exposure."
- Exit Optimization: "Sell signals that synthesize cost basis, pop trajectory, player news, and timing into a clear recommendation."

**Footer**
- CardEdge wordmark left
- Placeholder links right: About · Pricing · Contact
- Copyright line

---

## Dashboard (`/dashboard`)

**Header**
- "Good morning, [User]." — hardcoded placeholder name for now
- Date displayed right

**KPI cards (4 across)**
- Portfolio Value — `$0.00` placeholder
- Active Deal Alerts — `0`
- Open Sell Signals — `0`
- Total ROI — `0.00%`

**Two-column body**
- Left: "Recent Deal Alerts" — empty state with icon and "No active deal alerts" message
- Right: "Top Sell Signals" — empty state with icon and "No sell signals" message

**Full-width bottom strip**
- "Recent Activity" — empty state with icon and "Your activity will appear here" message

---

## Pillar Pages

Each pillar page shares an identical shell structure:

**Header**
- Page title (bold, large)
- One-line description (from README)
- Placeholder action button (e.g. "Scan Now", "Add Card", "Run Analysis") — non-functional

**Body**
- Full-width empty state card: icon, title "Coming Soon", one-sentence description of what this section will do

### Descriptions per page
- **Deals** (`/deals`): "Live scanning across marketplaces for cards priced below fair value. Cross-platform and grade arbitrage detection."
- **Portfolio** (`/portfolio`): "True cost basis tracking, population monitoring, and concentration risk scoring across your entire collection."
- **Intelligence** (`/intelligence`): "Fair value modeling that accounts for recent sales volume, trend direction, population size, and seasonal patterns."
- **Performance** (`/performance`): "Real ROI and IRR, capital velocity, and win/loss breakdowns by player, sport, set, and grade tier."

---

## Settings (`/settings`)

**Header**
- "Settings"

**Sections (placeholder cards, no functionality)**
- Account — name, email fields (read-only placeholder values)
- Notifications — toggle list (all off by default)
- Preferences — theme toggle (mirrors the nav toggle), timezone selector (placeholder)

---

## Component Architecture

```
app/
  layout.tsx              # Root layout: ThemeProvider, font, global styles
  page.tsx                # Landing page
  dashboard/
    page.tsx
  deals/
    page.tsx
  portfolio/
    page.tsx
  intelligence/
    page.tsx
  performance/
    page.tsx
  settings/
    page.tsx

components/
  layout/
    LandingNav.tsx        # Public nav
    AppNav.tsx            # Authenticated app nav
    Footer.tsx
  dashboard/
    KpiCard.tsx
    EmptyFeed.tsx
  pillar/
    PillarHeader.tsx
    PillarEmptyState.tsx
  ui/                     # shadcn/ui generated components
```

---

## Out of Scope (This Phase)

- Authentication (login, signup, session management)
- Real data of any kind
- API routes or database
- Command palette (deferred — may revisit)
- Mobile app
