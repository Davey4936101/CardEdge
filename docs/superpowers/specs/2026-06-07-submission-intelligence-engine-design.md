# Submission Intelligence Engine — Design Spec
*Date: 2026-06-07*

---

## Problem Statement

Every competitor in the sports card pre-grading market builds the same product: upload photos, receive a predicted PSA grade. Accuracy is converging across the field — SnapGradeAI publishes 96% within ±1 grade, GradingMetric claims 97% on the PSA 9-vs-10 decision. Competing purely on accuracy means fighting for single-digit percentage improvements against a hard ceiling set by 2D phone photography physics.

The actual unmet need, confirmed by collector community research, is not a more accurate grade number. It is a complete submission decision: should I submit this card, to which PSA tier, and when? Answering that question requires grade probability + market value by grade + PSA population scarcity + cost basis — four data sources that live in completely separate tools today. No competitor integrates them because no competitor has market data.

CardEdge already has the deal scanner, comps engine, EV engine, and portfolio infrastructure. The pre-grader becomes the connective tissue that makes the entire platform coherent, not a standalone accuracy contest.

---

## Vision

**The Submission Intelligence Engine** — the complete answer to "what should I do with this card?" CardEdge predicts the grade, surfaces the market value at that grade, shows population scarcity, calculates expected profit across PSA tiers, and delivers a verdict. A collector using CardEdge replaces a 9-step manual workflow (SnapGradeAI → Market Movers → GemRate → spreadsheet) with a single flow.

---

## Feature Set

### Phase 1 — High-Accuracy Grade Prediction + Submission Decision
*Core. Ships a best-in-class pre-grader and the integrated submission decision no competitor offers.*

#### 1.1 Enhanced Photo Capture Protocol

The limiting factor across every consumer pre-grading tool is input quality, not model quality. The current 2-photo flow (eBay URL or basic upload) is replaced with a structured 10-photo protocol.

**Required photos:**
1. Front — overhead, even lighting, card fills frame
2. Back — overhead, same conditions
3. Top-left corner crop — close-up, card fills frame
4. Top-right corner crop
5. Bottom-left corner crop
6. Bottom-right corner crop
7. Raking-light surface photo — flashlight held at 45° to card surface; catches foil scratches and surface defects invisible under overhead lighting
8. Top edge crop
9. Bottom edge crop
10. Left + right edge crop (one photo, card held vertically)

**Card-type-aware instructions:** Card type is detected at identification time and drives capture guidance.
- *Foil/chrome cards* (Prizm, Chrome, Optic, Select, Refractors): explicit raking-light requirement flagged prominently; surface scratch warning; note that foil defects are only visible at certain angles
- *Dark-bordered cards* (Prizm Silver, Black, Select): edge whitening guidance — hold under angled light to check for white specks on dark edges
- *Matte/base cards* (Topps, Heritage, Bowman base): standard protocol, no additional flags
- *Vintage cards* (pre-1990): note that known print defects may be excused; photograph any visible print lines for reference

The existing `CaptureFlow` component is rebuilt around this protocol with step-by-step guidance, real-time photo quality validation per step (blur detection, lighting adequacy check), and the ability to retake any step independently.

**eBay mode:** Retained but capped at "limited accuracy" reliability. eBay listing photos cannot provide raking-light surface images. The reliability banner is made more prominent; grade predictions in eBay mode are surfaced with wider confidence bands and a clear note that surface analysis is incomplete.

#### 1.2 Redesigned Analysis Pipeline

Replaces the current single Claude megacall (all attributes in one prompt) with targeted, specialized analysis per attribute.

**Centering — CV Microservice (enhanced)**
- Current: measures front only, single centering result
- New: measures front and back independently
- Front thresholds applied: 55/45 for PSA 10 eligibility, 60/40 for PSA 9
- Back thresholds applied: 75/25 for PSA 10 eligibility (dramatically more lenient — currently ignored entirely)
- Output: `centering_front_lr`, `centering_front_tb`, `centering_back_lr`, `centering_back_tb`, separate `psa10_eligible_front` and `psa10_eligible_back` flags

**Corners — 4 Independent Claude Calls**
- One call per corner (top-left, top-right, bottom-left, bottom-right)
- Each call receives: the individual corner crop, matching corner crops from PSA 10 / PSA 9 / PSA 8 reference images
- Prompt evaluates that specific corner against PSA standards: sharp vs. slight fraying vs. visible rounding vs. heavy rounding
- Output per corner: assessment, confidence, multiplier contribution
- Aggregated: weakest corner drives the overall corner sub-grade (PSA grades to the worst corner, not the average)

**Edges — 1 Claude Call**
- Input: all 3 edge crops + reference edge crops from PSA 10/9/8
- Dark-bordered card prompt variant: explicitly evaluates whitening on dark edges
- Output: edge sub-grade, specific edge(s) with issues called out

**Front Surface — 1 Claude Call**
- Input: raking-light surface photo (not the overhead front photo) + reference surface images
- Card-type-specific prompt:
  - Prizm cards: "Look specifically at the center of the card for the Prizm Dimple — a small factory indentation that is the most common cause of PSA 9 on otherwise gem-mint Prizm cards"
  - Chrome/foil: "Evaluate for foil scratches visible at this raking angle. Scratches appear as bright lines or dull patches in the foil."
  - Matte: standard surface scratch and print defect evaluation
- Output: surface sub-grade, specific defects identified with location description

**Back Surface — 1 Claude Call**
- Input: back photo + reference back images
- Evaluates: wax stains, surface scratches, print defects on reverse
- Currently completely ignored by the pipeline

**Multi-Pass Aggregation**
Every attribute call (all 6 above) runs 3× independently. Results are aggregated:
- Assessment: median of 3 runs
- Multipliers: averaged across 3 runs
- Confidence: downgraded if runs disagree (high disagreement → low confidence output)

This reduces LLM variance at modest cost (~3× token usage per attribute, partially offset by smaller per-call context from targeted crops).

#### 1.3 PSA Pop-Seeded Grade Priors

The current flat prior (8% PSA 10, 50% PSA 9, 30% PSA 8, 12% PSA 7) is wrong for nearly every specific card. A 2018 Prizm Mahomes base gems at ~35%. A 2020 Topps base gems below 5%. The prior must reflect the actual card.

**Implementation:** At pipeline step 4 (currently `getGradeDistribution`), replace the eBay-scraped distribution with a PSA API call:
- Query PSA public API for population by card (player, year, set, card number)
- Compute gem rate: `psa10_count / total_graded`
- Use actual population distribution as Bayesian prior
- Fall back to eBay-scraped distribution if PSA API returns no data; fall back to flat prior if eBay data insufficient

**PSA API:** `https://api.psacard.com/publicapi/` — OAuth2, 100 free calls/day. Cache responses in `grade_dist_cache` with existing TTL logic.

#### 1.4 Continuous Grade Score + Sub-grade Output

**Output format changes:**
- Add continuous predicted score: e.g., `9.3` with confidence band: `±0.4`
  - Computed as weighted average of grade distribution: `Σ(grade × probability)`
  - Confidence band derived from distribution spread and attribute confidence levels
- Four sub-grade scores surfaced explicitly: centering / corners / edges / surface
  - Each scored 0–10 on PSA scale
  - Each accompanied by the specific PSA language for that level ("centering measures approximately 61/39 left-to-right; PSA 10 requires 55/45 or better; this card will likely receive PSA 9 on centering")
- Weak-link identification: the lowest sub-grade is called out explicitly ("corners are the limiting factor")
- Borderline flag: if continuous score is 9.2–9.8, surface an explicit flag: "This card sits at the PSA 9/10 boundary. Grade prediction carries higher than normal uncertainty. Consider re-photographing corners with improved lighting before submitting."

#### 1.5 Full Submission Decision Output

The recommendation panel expands from the current `grade / uncertain / skip` verdict into a complete decision breakdown with full math shown.

**Decision output includes:**
- Grade probability distribution (existing, unchanged)
- Continuous score + confidence band (new)
- Sub-grade breakdown with PSA language (new)
- Market value by grade pulled from comps engine (existing infrastructure, newly surfaced here)
- PSA population at each grade + gem rate for this card (new — PSA API)
- Expected value and profit per PSA tier (existing EV engine, unchanged)
- Tier recommendation: which PSA tier is financially justified given the expected profit and market value
- Overall verdict with full math visible: "Expected profit $94 at Regular tier ($25 fee). PSA 10 probability 28% ($430 comp). Break-even grade: PSA 8 or better (73% probability). Gem rate for this card: 31% (historical). Verdict: Submit at Regular."

The existing `Recommendation`, `EvTable`, `AttributeBreakdown`, and `GradeDistributionChart` components are updated to surface this expanded output. No new top-level components required.

---

### Phase 2 — Differentiation: Deal Scanner Integration + BGS Crossover Engine

#### 2.1 Deal Scanner + Grade Potential

The deal scanner already surfaces underpriced raw cards on eBay. Phase 2 adds grade potential scoring to every deal result.

**How it works:**
- For each deal surfaced, run a lightweight grade screen on the listing's primary image (not the full 10-photo protocol — this is a rapid single-image PSA 10 probability estimate)
- Compute: `grade_potential_score` (estimated PSA 10 probability from listing photo), `ev_if_graded` (P(10) × PSA 10 comp + P(9) × PSA 9 comp − Regular tier cost), `grade_upside` (ev_if_graded − raw_asking_price)
- Surface in deal scanner results: "Grade Potential" column showing PSA 10 probability % and expected profit if submitted
- New filter: "Show only deals with positive grading EV" — surfaces arbitrage opportunities the user would otherwise miss
- Clicking the grade potential badge opens the full grade analysis flow pre-loaded with the eBay item

**UI addition:** Deals table gets a "Grade Potential" column with a badge (e.g., "PSA 10: 31% · +$71 EV"). Low-probability results show muted badge; high-probability results show highlighted badge.

#### 2.2 BGS → PSA Crossover Engine

Dedicated flow for an underserved use case with zero existing tooling. A BGS 9.5 crossing to PSA 10 can produce a 2–5× value increase; the collector community is large and active; no tool addresses this decision.

**Input options:**
1. Photo of BGS slab — AI reads visible sub-grade labels on the holder
2. Manual sub-grade entry — user types in centering/corners/edges/surface sub-grades from the holder

**Analysis:**
- Crossover probability to PSA 10 modeled from sub-grade pattern
  - Known community data encoded in prompt: quad 9.5 (all sub-grades ≥ 9.5) = highest crossover probability (~40–60%); any single 9 sub-grade = near-zero crossover chance; the card cannot be fully evaluated through the slab
  - Surface assessment flagged as limited (can't fully see through BGS holder)
- Three-way expected value comparison:
  1. Keep BGS slab: current BGS market value for this sub-grade combination
  2. PSA crossover service: (crossover probability × PSA 10 market value) + ((1 − crossover probability) × PSA 9 market value) − crossover service fee
  3. Crack and resubmit raw: (grade distribution × market value by grade) − Regular submission cost − risk discount for crack damage
- Recommended action: "Keep / Submit for PSA crossover / Crack and resubmit raw"

**Crossover probability model:** LLM-based initially, with the known sub-grade → crossover outcome data from the collector community encoded directly in the system prompt. Calibrated over time as users report actual crossover outcomes.

**New route:** `/api/grade/crossover` with dedicated Supabase table `bgs_crossover_analyses`.

---

### Phase 3 — Intelligence Layer: Pop Velocity + Batch Optimizer + Accuracy Loop

#### 3.1 Population Velocity Intelligence

**Data collection:** Daily cron job (Inngest scheduled function) queries PSA API for population counts for every `card_key` in the `grade_dist_cache` table. Stores snapshots in new `pop_snapshots` table: `(card_key, snapshot_date, count_10, count_9, count_8, count_7, total)`.

**Computed signals:**
- 30-day PSA 10 population growth rate (new copies / prior count)
- Gem rate trend (stable / rising / falling over 90 days)
- "Pop pressure" signal: if PSA 10 pop grew >15% in 30 days, flag pricing compression risk

**Surfaced on submission decision:**
"PSA 10 population: 57 copies. 30-day growth: +10 copies (+22%). Gem rate: 31% (stable). Pop pressure: moderate — submit soon to capture current pricing before additional supply hits the market."

**Alert system:** Users can set pop velocity alerts for cards in their portfolio or watchlist. Notification when a card's PSA 10 pop grows by a user-defined threshold.

#### 3.2 Batch Submission Optimizer

Given PSA's 25-card minimum at Regular tier, every submission batch is a portfolio optimization problem.

**Input:** User photographs or selects from portfolio any number of raw cards.

**Per-card scoring:**
- Run full grade prediction pipeline for each card
- Compute expected ROI: `(Σ grade_prob × market_value_at_grade) − submission_cost`
- Flag cards below the break-even threshold ($30 minimum fee → PSA 10 comp must exceed ~$75 to justify)

**Batch output:**
- Cards ranked by expected ROI, highest to lowest
- Recommended 25-card batch: top-ranked cards that together maximize total expected return
- Total batch expected return, total capital deployed, batch-level ROI
- Alternative batch suggestions: e.g., "add card X to replace card Y for +$34 expected profit improvement"

**New route:** `/api/grade/batch` with `submission_batches` table storing batch compositions and expected vs. actual outcomes.

#### 3.3 Post-Submission Accuracy Loop

**Input:** After receiving cards back from PSA, user enters actual PSA grade via a simple follow-up prompt tied to existing `grade_analyses` records.

**Outputs:**
- Predicted vs. actual comparison with sub-grade breakdown
- Discrepancy analysis: "Predicted 9.4, received PSA 9. Corner analysis predicted 'excellent' but actual grade reflects corner issue. Consider more granular corner lighting on future submissions."
- Personal accuracy log: running history of predictions vs. actuals
- Systematic blind spot identification: which attribute (corners/edges/surface/centering) the user consistently underestimates
- Aggregate data (anonymized) contributes to model calibration over time

**Schema addition:** `grade_analyses` gets `actual_psa_grade` (nullable), `outcome_logged_at` columns.

---

## Technical Architecture

### New Integrations
- **PSA Public API** (`https://api.psacard.com/publicapi/`): population queries by card, prices realized. OAuth2 password grant. 100 free calls/day; paid tier for production volume. Client lives at `lib/psa/api-client.ts`.
- **Pop velocity tracker**: Inngest daily cron job. Queries PSA API for all card keys in `grade_dist_cache`. Stores to `pop_snapshots` table.
- **BGS crossover model**: LLM-based initially (`lib/grade/crossover.ts`). Prompt encodes known community crossover rate data by sub-grade pattern.
- **Batch optimizer**: Pure TypeScript ranking and composition logic (`lib/grade/batch-optimizer.ts`). No external dependencies.

### Pipeline Changes (`lib/grade/pipeline.ts`)

**New steps added:**
1. Card type detection — runs after card identification, tags `foil_chrome | dark_border | matte | vintage | memorabilia`; drives photo requirements + prompt selection
2. Front + back centering — CV microservice called twice (or enhanced to return both in one call)
3. Per-corner analysis — 4 calls (one per corner crop), 3× each → 12 total corner analysis calls, aggregated
4. Per-attribute analysis (edges, front surface, back surface) — 3 calls, 3× each → 9 total calls, aggregated
5. PSA pop prior seeding — PSA API call replacing/augmenting `getGradeDistribution`

**Removed:** The current `analyzeAttributes` single-call approach is replaced entirely by the per-attribute pipeline above.

**Multi-pass aggregation utility:** New `lib/grade/multi-pass.ts` — takes an async analysis function, runs it N times in parallel, returns aggregated result (median assessments, averaged multipliers, confidence degraded if variance is high).

### Schema Changes (Supabase)

**`grade_analyses` table additions:**
- `card_type` (text): `foil_chrome | dark_border | matte | vintage`
- `continuous_score` (float): e.g., `9.3`
- `confidence_band` (float): e.g., `0.4`
- `centering_front_lr`, `centering_front_tb` (float): front centering (existing columns renamed for clarity)
- `centering_back_lr`, `centering_back_tb` (float): back centering (new)
- `centering_back_eligible` (boolean): back centering PSA 10 eligibility
- `corner_tl_assessment`, `corner_tr_assessment`, `corner_bl_assessment`, `corner_br_assessment` (text): per-corner assessments
- `pop_gem_rate` (float): PSA gem rate at time of analysis
- `pop_count_10`, `pop_count_9`, `pop_count_8`, `pop_count_7`, `pop_total` (integer): population snapshot at time of analysis
- `actual_psa_grade` (float, nullable): post-submission actual grade
- `outcome_logged_at` (timestamp, nullable)

**New tables:**
- `pop_snapshots`: `(id, card_key, snapshot_date, count_10, count_9, count_8, count_7, total, created_at)`
- `bgs_crossover_analyses`: `(id, user_id, card_key, input_method, centering_sub, corners_sub, edges_sub, surface_sub, crossover_probability, ev_keep_bgs, ev_crossover, ev_crack_raw, recommendation, created_at)`
- `submission_batches`: `(id, user_id, batch_name, card_analysis_ids, total_expected_return, total_cost, created_at)`

### New Routes
- `POST /api/grade/crossover` — BGS crossover analysis
- `POST /api/grade/batch` — batch optimizer input and scoring
- `GET /api/grade/pop-velocity/[cardKey]` — pop velocity data for a card
- `PUT /api/grade/analyses/[id]/outcome` — log actual PSA grade post-submission

### New Components
- `components/grade/CaptureProtocol.tsx` — rebuilt capture flow with 10-step structured protocol and card-type-aware instructions
- `components/grade/SubGradeBreakdown.tsx` — four sub-grade scores with PSA language
- `components/grade/SubmissionVerdict.tsx` — full decision output with all math shown
- `components/grade/PopVelocityBadge.tsx` — population trend surface on grade results
- `components/grade/CrossoverAnalysis.tsx` — BGS crossover three-way comparison
- `components/grade/BatchOptimizer.tsx` — batch composition and ROI ranking

---

## What This Is Not

- Not a standalone pre-grading app competing on accuracy alone
- Not a bulk grading company (no physical handling)
- Not a replacement for PSA PhotoGrade or educational tools
- Not targeting BGS, SGC, or CGC grading standards in Phase 1

## Accuracy Ceiling Acknowledgment

All analysis runs on 2D phone photography. The hard ceiling on 2D photography means some defect types (deep surface indentations, dents, bends, sub-millimeter corner fraying) remain undetectable regardless of model quality. The raking-light photo requirement closes a significant portion of this gap (foil scratches become visible). The system's confidence outputs explicitly communicate this uncertainty rather than projecting false precision.

AGS Robograding (3D laser scanning + 28MP imaging) represents the true accuracy ceiling. CardEdge does not attempt to match that; instead, it beats every consumer-facing tool while being honest about the remaining gap.

---

## Success Criteria

- Phase 1: Grade prediction accuracy ≥ 90% within ±1 grade on a held-out validation set of 50+ cards submitted to PSA by users who log actual outcomes
- Phase 1: Submission decision (grade/hold/skip) matches what a manual 9-step workflow would produce, verified against community-documented outcomes
- Phase 2: Deal scanner grade potential column increases deal click-through rate (users finding and acting on grading arbitrage opportunities)
- Phase 2: BGS crossover prediction calibrated to within 15 percentage points of community-reported success rates on quad 9.5 vs. mixed sub-grade patterns
- Phase 3: Post-submission accuracy loop shows measurable improvement in user prediction accuracy over time (first vs. 10th submission comparison)
