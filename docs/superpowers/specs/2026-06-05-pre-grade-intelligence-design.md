# Pre-Grade Intelligence — Design Spec
_Date: 2026-06-05_

## Overview

Build Pre-Grade Intelligence — CardEdge's AI-powered raw card grading analysis tool. Users submit photos of ungraded (raw) cards and receive a PSA grade probability distribution plus a full Expected Value / Expected Profit analysis of whether grading is financially worthwhile. The feature operates in two modes: analyzing eBay listing photos for potential buys, and a guided multi-shot capture flow for cards the user already owns. Accuracy is the core differentiator — the system is built around card-specific population data and retrieval-augmented comparison against confirmed graded reference images, not generic pattern matching.

---

## Route

`/grade` — dedicated top-level page, added to app nav between Deals and Portfolio:

`Dashboard · Deals · Grade · Portfolio · Intelligence · Performance`

---

## Tech Stack Additions

| Layer | Choice | Notes |
|---|---|---|
| Computer Vision | OpenCV via Python microservice (FastAPI) | Deterministic centering measurement — not viable in Next.js natively |
| Vision LLM | Claude Vision (claude-opus-4-8) | Card identification, corner/edge/surface analysis vs reference images |
| PSA Pop Data | psacard.com/pop (scraped) | Base rate grade distribution per card |
| Reference Images | eBay Finding API (existing) | Confirmed graded copies per card per grade tier |

---

## Two Modes

### eBay Mode
User pastes an eBay listing URL. System fetches all listing photos via the existing eBay Browse API. Each photo receives a per-image reliability badge (HIGH / MEDIUM / LOW) based on resolution, blur, and coverage. A session-level reliability banner summarizes the overall confidence of the analysis. No capture flow — the user gets what the seller provided.

### My Card Mode
Step-by-step guided capture with illustrated overlays showing exactly what to photograph:

1. **Front flat** — card face-up in even lighting
2. **Back flat** — card face-down in even lighting
3. **4 corner crops** — tight crop at each corner (top-left, top-right, bottom-left, bottom-right)
4. **Raking light** — front of card with phone flashlight held at 45° to reveal surface defects

Each step shows a guide image and a real-time preview. User can retake any step. Progress indicator shows completion. This flow maximizes accuracy — raking light in particular surfaces scratches and haze invisible under flat lighting.

---

## Data Layer

### PSA Population Cache

Scraped from `psacard.com/pop` on first query for any card_key, then refreshed every 24 hours. Stores grade counts (1–10) and total submissions. This becomes the Bayesian prior: before analyzing a single pixel, the system already knows the historical grade distribution for this specific card.

### Reference Image Library

For any identified card, pull confirmed graded copies from eBay sold listings (PSA grade is present in listing titles). Cache 10–15 reference image URLs per grade tier (PSA 10, 9, 8). These are used during attribute analysis — the vision model compares the submitted raw card against confirmed graded examples of the same card, not against generic grading standards.

Reference images are populated lazily (on first analysis of a given card_key) and reused across all future analyses of the same card.

### Card Identification

The vision model reads card text from the submitted front photo (player name, year, set name, card number) and produces a structured card identity object. For eBay mode, the listing title is parsed first as a faster and more reliable path (titles always include player, year, set, and card number). In both modes, a `CardConfirmation` UI is presented to the user to verify the identified card before the full pipeline runs — if the model misreads a detail, the user corrects it here. The confirmed identity is normalized into a `card_key` (e.g. `mahomes-2018-prizm-168`) used as the lookup key across all downstream operations.

There is no external card database API dependency. Identity confirmation is the user's responsibility at the confirmation step.

---

## Analysis Pipeline

Steps execute sequentially within a single API call. The pipeline is designed so each step degrades gracefully if data is unavailable (e.g., no PSA pop data → skip Bayesian update, use flat prior; no reference images → fall back to general grading standards with lower confidence).

```
1. Image ingestion
   eBay mode:    fetch images from listing URL via Browse API
   My Card mode: accept multi-shot uploads

2. Photo quality scoring (per image)
   → Resolution:  < 800px = low, 800–1600px = medium, > 1600px = high
   → Blur:        Laplacian variance threshold
   → Glare:       overexposure detection
   → Coverage:    front visible? back visible? corner views present?
   → Output: reliability score (high / medium / low) per image + session aggregate

3. Card identification
   → Parse eBay title (eBay mode) OR vision model reads front photo (My Card mode)
   → Produce structured identity: { player, year, set, card_number }
   → Normalize to card_key (e.g. "mahomes-2018-prizm-168")
   → Present CardConfirmation UI — user verifies and corrects before pipeline continues

4. Centering analysis (Classical CV — deterministic)
   → Python microservice (FastAPI + OpenCV) receives front image
   → Detects card borders via edge detection / homography
   → Measures pixel distances: left, right, top, bottom borders
   → Returns ratio: e.g. "53/47 L-R · 55/45 T-B"
   → PSA 10 threshold (55/45 or better) is hard-coded
   → Centering is always reported with high confidence regardless of photo quality
   → Microservice runs as a separate process, called from /api/grade/analyze

5. Reference image retrieval
   → Query grade_reference_images for this card_key
   → If fewer than 5 images per grade tier: trigger eBay scrape to populate
   → Retrieve PSA pop data from psa_pop_cache (or fetch + cache if missing)

6. Attribute analysis — corners / edges / surface (Vision LLM)
   → Prompt includes: submitted card photos + 10 confirmed PSA 10 reference images
     + 10 confirmed PSA 9 reference images for this specific card
   → Model assesses each attribute separately with a structured output:
     { attribute, assessment, confidence, notes }
   → Returns likelihood adjustments per attribute (e.g. "corners reduce P(10) by 0.15")
   → If reference images unavailable: analyze against general PSA standards
     (lower confidence, flagged in output)

7. Grade distribution — Bayesian update
   → Prior: PSA pop distribution for this card_key
     (e.g. { 10: 0.142, 9: 0.628, 8: 0.161, "7+": 0.069 })
   → Likelihood: per-attribute adjustments from step 6
   → Posterior: normalized grade probability distribution
   → If PSA pop data unavailable: use flat prior, flag in output

8. Graded comp fetching
   → eBay Finding API queries per grade tier: "player + year + set + card# + PSA 10"
   → Falls back to price_cache where recent comps already exist
   → Requires at least 3 comps per grade tier to include that tier in the EV table
   → Grade tiers with fewer than 3 comps are shown as "insufficient data"

9. EV engine (see below)

10. Output rendering
```

---

## EV Engine

```
Inputs:
  raw_price          numeric (user-entered or parsed from eBay listing price)
  grade_distribution { 10: p10, 9: p9, 8: p8, "7+": p7 }
  graded_comps       { 10: $v10, 9: $v9, 8: $v8, "7+": $v7 }

Grading tiers (hard-coded, maintainable via env/config):
  Regular:       $25 + $12 shipping  ~45 day turnaround
  Express:       $150 + $12          ~5 days
  Super Express: $500 + $12          ~2 days

Per grading tier:
  EV_graded     = Σ(P(grade_i) × comp_i)         [for grades with sufficient comps]
  total_cost    = raw_price + grading_fee + shipping
  EP            = EV_graded − total_cost
  break_even    = lowest grade tier where comp_i > total_cost
  P(break_even) = Σ P(grades ≥ break_even)        [probability of profitable outcome]
  annualized    = EP / total_cost / (turnaround_days / 365)

Recommendation:
  GRADE IT    EP > 0 and P(break_even) ≥ 0.80
  UNCERTAIN   EP > 0 and P(break_even) 0.50–0.79
  SKIP        EP ≤ 0 or P(break_even) < 0.50
```

---

## Output Display

The output reads as a financial analysis report. Layout:

**Section 1 — Photo Analysis**
Grid showing centering ratio (always high confidence), then corners/edges/surface each with an assessment label and confidence indicator.

**Section 2 — Grade Distribution**
Horizontal bar chart with probability % and market value per grade tier. Each bar is color-coded (green → PSA 10, stepping down to red → PSA 7+).

**Section 3 — EV Table**
Three-column table (Regular / Express / Super Express). Per column: grading cost, EV graded, Expected Profit (green if positive, red if negative), break-even grade, annualized return. Super Express column shows ❌ if negative EP.

**Section 4 — Recommendation**
Prominent pill: `GRADE IT` (green) / `UNCERTAIN` (yellow) / `SKIP` (red). One-sentence rationale below (e.g. "Profitable at PSA 8 or above — 91% probability").

**Section 5 — Caveats**
Auto-generated based on analysis:
- Surface confidence warning if flat lighting only
- High-variance set warning if PSA pop data shows inconsistent grade spread
- Low reference image count warning if fewer than 5 images per grade tier were available
- Session reliability banner if eBay mode with low-quality photos

---

## Reliability Scoring

### Per-Photo Badge (eBay Mode)
Shown as an overlay badge on each fetched listing photo.

| Score | Criteria |
|-------|----------|
| HIGH | Resolution > 1600px, no significant blur or glare |
| MEDIUM | Resolution 800–1600px, minor blur acceptable |
| LOW | Resolution < 800px, significant blur, glare, or card not fully visible |

### Session Reliability Banner
Displayed above analysis output for eBay mode only. My Card mode (guided capture) does not show a banner unless a specific step produced a low-quality photo.

| Score | Banner Text |
|-------|-------------|
| HIGH | No banner shown |
| MEDIUM | "⚠ Medium Reliability — seller photos have limited coverage. Surface estimate may be inaccurate." |
| LOW | "⚠ Low Reliability — photo quality is poor. This estimate is directional only. Consider requesting better photos from the seller before bidding." |

Session score = lowest score across submitted photos (conservative).

---

## Database Schema

```sql
-- Completed analyses
create table grade_analyses (
  id                 uuid primary key default gen_random_uuid(),
  card_key           text not null,
  mode               text not null check (mode in ('ebay', 'personal')),
  ebay_item_id       text,
  image_urls         jsonb not null default '[]',
  centering_lr       numeric(5,2),
  centering_tb       numeric(5,2),
  corner_assessment  text,
  edge_assessment    text,
  surface_assessment text,
  grade_distribution jsonb not null default '{}',
  raw_price          numeric(10,2),
  graded_comps       jsonb not null default '{}',
  ev_regular         numeric(10,2),
  ep_regular         numeric(10,2),
  ev_express         numeric(10,2),
  ep_express         numeric(10,2),
  ev_super_express   numeric(10,2),
  ep_super_express   numeric(10,2),
  break_even_grade   integer,
  recommendation     text check (recommendation in ('grade', 'uncertain', 'skip')),
  reliability_score  text check (reliability_score in ('high', 'medium', 'low')),
  created_at         timestamptz not null default now()
);

-- PSA population data per card (Bayesian prior)
create table psa_pop_cache (
  id           uuid primary key default gen_random_uuid(),
  card_key     text unique not null,
  grades       jsonb not null default '{}',  -- { "10": 1847, "9": 8204, ... }
  total        integer not null,
  last_fetched timestamptz not null
);

-- Confirmed graded reference images for comparison
create table grade_reference_images (
  id         uuid primary key default gen_random_uuid(),
  card_key   text not null,
  psa_grade  integer not null,
  image_url  text not null unique,
  source     text not null default 'ebay',
  created_at timestamptz not null default now()
);

create index idx_grade_ref_card_grade
  on grade_reference_images (card_key, psa_grade);
```

---

## API Routes

| Method | Route | Purpose |
|--------|-------|---------|
| POST | `/api/grade/analyze` | Submit images + raw price → run full pipeline → return analysis |
| GET | `/api/grade/ebay-images?url=` | Fetch listing photos from eBay URL |
| GET | `/api/grade/pop?card_key=` | PSA population data (from cache or fresh scrape) |
| GET | `/api/grade/comps?card_key=` | Graded comps at each PSA grade tier from eBay |
| GET | `/api/grade/history` | Paginated list of past analyses |

The `/api/grade/analyze` route is the primary endpoint. It orchestrates all pipeline steps and returns the complete analysis result. Long-running operations (reference image population, PSA pop scraping) are handled with a streaming or polling pattern if needed.

---

## Component Architecture

```
app/
  grade/
    page.tsx                    # /grade page — mode toggle + analysis or history

components/
  grade/
    ModeToggle.tsx              # "eBay Listing" | "My Card" tab switch
    EbayInput.tsx               # URL paste field + fetch images button
    CaptureFlow.tsx             # Multi-step guided capture orchestrator
    CaptureStep.tsx             # Single step: guide illustration + file input + preview
    PhotoGrid.tsx               # Grid of submitted photos, reliability badge per image
    ReliabilityBanner.tsx       # Session-level reliability warning (eBay mode)
    CardConfirmation.tsx        # "Is this the right card?" confirmation before analysis
    AnalysisLoader.tsx          # Pipeline progress indicator during analysis
    AttributeBreakdown.tsx      # Centering / corners / edges / surface grid
    GradeDistribution.tsx       # Horizontal bar chart per grade with % and market value
    EvTable.tsx                 # EV / EP / annualized return across three grading tiers
    Recommendation.tsx          # GRADE IT / UNCERTAIN / SKIP pill + rationale text
    CaveatList.tsx              # Auto-generated caveats based on analysis flags
    AnalysisHistory.tsx         # List of past analyses with card name, recommendation, date

lib/
  grade/
    pipeline.ts                 # Orchestrates all analysis steps
    centering.ts                # Calls Python CV microservice for centering measurement
    card-identify.ts            # Vision model card identification + user confirmation flow
    attribute-analysis.ts       # Vision LLM corner/edge/surface vs reference images
    grade-distribution.ts       # Bayesian prior + likelihood → posterior distribution
    ev-engine.ts                # EV / EP / break-even / annualized return calculation
    reliability.ts              # Per-photo and session reliability scoring
    psa-pop.ts                  # PSA pop report scraper + cache management
    reference-images.ts         # Reference image retrieval + eBay population
    photo-quality.ts            # Resolution / blur / glare detection

app/
  api/
    grade/
      analyze/route.ts          # POST — full pipeline
      ebay-images/route.ts      # GET — fetch listing photos
      pop/route.ts              # GET — PSA population data
      comps/route.ts            # GET — graded comps per grade tier
      history/route.ts          # GET — past analyses
```

---

## Grading Cost Configuration

Grading fees change. Store as environment variables so they can be updated without a code change:

```
PSA_REGULAR_FEE=25
PSA_EXPRESS_FEE=150
PSA_SUPER_EXPRESS_FEE=500
PSA_SHIPPING_COST=12
PSA_REGULAR_DAYS=45
PSA_EXPRESS_DAYS=5
PSA_SUPER_EXPRESS_DAYS=2
```

---

## Implementation Phases

| Phase | Scope |
|---|---|
| 1 | DB schema, PSA pop scraper, reference image retrieval from eBay, card identification |
| 2 | Centering engine (classical CV), photo quality scorer, reliability scoring |
| 3 | Vision LLM attribute analysis with reference image comparison, Bayesian grade distribution |
| 4 | EV engine, graded comp fetching, recommendation logic |
| 5 | UI — eBay mode (URL input, photo grid, reliability banner) |
| 6 | UI — My Card mode (guided capture flow, step-by-step with overlays) |
| 7 | UI — Analysis output (attribute breakdown, grade distribution, EV table, recommendation, caveats) |
| 8 | Analysis history, nav update |

---

## Out of Scope (This Feature)

- BGS, SGC, or any grading company other than PSA
- Bulk submission analysis (one card at a time)
- Grading submission tracking after the card is sent in
- Mobile native camera integration (file upload only)
- Model fine-tuning infrastructure (Phase 2 product initiative, not this spec)
- Grade crossover analysis (e.g. "should I crack this PSA 9 and re-submit?")
- Portfolio integration (saving graded analysis results to portfolio positions)
