# Player Intel Engine + Smart Sell Timing

**Goal:** Monitor ESPN news for portfolio players, classify events, surface sell/hold signals, show seasonal windows.

## Data Layer

**`player_events`**: id, player_name, sport, event_type (award/trade/injury/milestone/performance), title, summary, sentiment (bullish/bearish/neutral), severity (high/medium/low), source_url, event_date, expires_at (30d default)

**`player_alerts`**: id, user_id, portfolio_card_id, player_event_id, is_read, created_at

## Pipeline

**`lib/intel/espn.ts`**
- `fetchSportNews(sport: 'nfl'|'nba'|'mlb')` → raw articles from `site.api.espn.com/apis/site/v2/sports/{sport}/{league}/news?limit=50`
- Returns: `{ headline, description, publishedAt, url }`

**`lib/intel/event-classifier.ts`**
- `classifyArticle(headline, description, playerName)` using Claude Haiku
- Returns: `{ event_type, sentiment, severity, summary }`
- Prompt: classify the sports news event, focus on card investment impact

**`lib/intel/seasonal-windows.ts`**
- Static lookup: sport → array of `{ label, start_month, end_month, action: 'buy'|'sell'|'hold', reason }`
- NFL: sell Jan–Feb (playoffs peak), buy Jun–Aug (offseason dip)
- NBA: sell Apr–Jun (playoffs peak), buy Jul–Sep (offseason dip)
- MLB: sell Sep–Oct (playoffs), buy Nov–Feb (offseason)

**`inngest/player-intel-scanner.ts`** (cron: `0 */6 * * *`)
- Step 1: fetch distinct `player` values from `portfolio_cards` (all users)
- Step 2: fetch NFL/NBA/MLB news from ESPN
- Step 3: for each article, check if any portfolio player name appears in headline/description (case-insensitive)
- Step 4: for each match, call Claude Haiku to classify → insert to `player_events` (skip duplicates by title+player_name)
- Step 5: create `player_alerts` rows linking events to matching portfolio cards

## API

`GET /api/intel/feed` — returns `player_events` for user's portfolio players, joined with `player_alerts.is_read`. Auth required.

`GET /api/intel/seasonal` — returns current seasonal window for each sport in user's portfolio.

## Intelligence Page Redesign

New sections prepended above existing content:

**Player Event Feed** — vertical feed of events with severity badge, sentiment color (green=bullish, red=bearish), player name, headline, "mark read" action.

**Seasonal Windows** — 3 sport cards (NFL/NBA/MLB) showing current phase label + buy/sell/hold recommendation.

Existing Market Snapshot, Best Value, Grade Opportunity, Act Now sections remain.
