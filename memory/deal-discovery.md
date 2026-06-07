---
name: deal-discovery
description: Deal discovery feature architecture, BIN-only policy, bid watch, known design decisions
metadata:
  type: project
---

## Policy: BIN-only in Deal Discovery

All three listing sources (eBay Browse API, OpenWebNinja, scraper) filter to **Buy It Now only**. Auctions and auction_with_bin are intentionally excluded — current bid ≠ final price and inflates ROI numbers. This was a core design decision from June 2026.

**Why:** Bid prices are misleading for "deal" scoring. A $10 current bid on a $200 card looks like a 95% discount, but the card will auction up. Bid tracking is a separate Bid Watch feature.

## Bid Watch Feature (added 2026-06-07)

Separate tab in the Deal Discovery page. Users paste eBay auction URLs to track. System:
1. Fetches live data via eBay Browse API (`GET /buy/browse/v1/item/v1|{id}|0`)
2. Calculates fair value from sold comps
3. Shows current bid + BIN price + fair value side by side
4. Inngest `bid-watch-scanner` refreshes every 30 min (requires eBay API creds)
5. ROI shown is "if you win at current bid" — labelled as optimistic

Table: `bid_watches` (user_id, ebay_item_id, current_bid, bin_price, fair_value, end_time, is_ended)

## isGraded Fix

`isGraded(grade, title)` now falls back to scanning the card title for PSA/BGS/SGC etc. This matters because global scan alerts have `grade = null` even for graded cards. Title detection catches "Patrick Mahomes PSA 10 Rookie".

## Sport Filter

`GLOBAL_SCAN_QUERIES` now includes `sport: 'NFL' | 'NBA'` per query. Stored in `alerts.sport`. Sidebar has NFL/NBA/MLB/NHL/All filter pills.

## Buying Format Badge

Deals now show "Buy It Now" (teal) or "Make Offer" (violet) badges. `buying_format` stored in alerts table. DealDetailSheet labels the price as "Buy It Now Price — Confirmed buy price, not a bid".
