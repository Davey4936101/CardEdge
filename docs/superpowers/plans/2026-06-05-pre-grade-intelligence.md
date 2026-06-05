# Pre-Grade Intelligence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a `/grade` page where users submit raw card photos and receive a PSA grade probability distribution plus EV/EP analysis of whether grading is financially worthwhile.

**Architecture:** Two-mode pipeline — eBay URL fetches seller photos, My Card mode runs a guided multi-shot capture. A Python/FastAPI microservice handles geometric centering measurement via OpenCV. Claude Vision compares submitted photos against confirmed graded reference images fetched from eBay sold listings. The Inngest job runner executes the pipeline asynchronously to avoid Vercel timeouts; the client polls for results.

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase, Inngest, `@anthropic-ai/sdk` (Claude Vision), FastAPI + OpenCV (Python microservice), cheerio, Tailwind + shadcn/ui, Vitest

---

## File Map

**New files — Python microservice**
- `services/cv/main.py` — FastAPI app, single `/centering` POST endpoint
- `services/cv/centering.py` — OpenCV border detection + ratio calculation
- `services/cv/requirements.txt`
- `services/cv/test_centering.py`

**New files — lib/grade/**
- `lib/grade/types.ts` — all shared TypeScript types (single source of truth)
- `lib/grade/grade-dist-cache.ts` — market grade distribution from eBay sold listings
- `lib/grade/reference-images.ts` — confirmed graded reference images per card/grade
- `lib/grade/photo-quality.ts` — per-image resolution/blur/glare scoring
- `lib/grade/reliability.ts` — session-level reliability aggregation
- `lib/grade/centering.ts` — calls Python CV microservice
- `lib/grade/card-identify.ts` — Claude Vision card identification
- `lib/grade/attribute-analysis.ts` — Claude Vision corners/edges/surface vs references
- `lib/grade/grade-distribution.ts` — Bayesian prior × likelihood → posterior
- `lib/grade/graded-comps.ts` — fetch graded comp prices from eBay per grade tier
- `lib/grade/ev-engine.ts` — EV / EP / break-even / annualized return
- `lib/grade/pipeline.ts` — orchestrates all steps, updates DB row

**New files — Inngest**
- `inngest/grade-analyzer.ts` — event-driven Inngest function

**New files — API routes**
- `app/api/grade/analyze/route.ts` — POST: create row, fire Inngest event, return ID
- `app/api/grade/ebay-images/route.ts` — GET: fetch listing photos by eBay URL
- `app/api/grade/analyses/[id]/route.ts` — GET: poll analysis status/result
- `app/api/grade/history/route.ts` — GET: paginated past analyses

**New files — app page**
- `app/(app)/grade/page.tsx`

**New files — components/grade/**
- `ModeToggle.tsx`, `EbayInput.tsx`, `CaptureFlow.tsx`, `CaptureStep.tsx`
- `PhotoGrid.tsx`, `ReliabilityBanner.tsx`, `CardConfirmation.tsx`
- `AnalysisLoader.tsx`, `AttributeBreakdown.tsx`, `GradeDistribution.tsx`
- `EvTable.tsx`, `Recommendation.tsx`, `CaveatList.tsx`, `AnalysisHistory.tsx`

**Modified files**
- `supabase/migrations/002_pre_grade_intelligence.sql` — 3 new tables
- `inngest/deal-scanner.ts` — no change (reference only)
- `app/api/inngest/route.ts` — add `gradeAnalyzer` to serve list
- `components/layout/AppNav.tsx` — add Grade nav link
- `.env.local` — add `ANTHROPIC_API_KEY`, `CV_SERVICE_URL`, PSA fee vars

**New test files**
- `lib/__tests__/grade/grade-distribution.test.ts`
- `lib/__tests__/grade/ev-engine.test.ts`
- `lib/__tests__/grade/reliability.test.ts`
- `services/cv/test_centering.py`

---

## Task 1: Install Dependencies

**Files:** `package.json`, `services/cv/requirements.txt`

- [ ] **Install JS dependencies**

```bash
npm install @anthropic-ai/sdk cheerio
npm install --save-dev @types/cheerio
```

- [ ] **Create Python microservice requirements**

```
# services/cv/requirements.txt
fastapi==0.115.0
uvicorn==0.30.6
opencv-python-headless==4.10.0.84
numpy==2.0.2
python-multipart==0.0.12
pytest==8.3.3
httpx==0.27.2
```

- [ ] **Verify JS install succeeded**

```bash
node -e "require('@anthropic-ai/sdk'); console.log('ok')"
```

- [ ] **Commit**

```bash
git add package.json package-lock.json services/cv/requirements.txt
git commit -m "feat: add anthropic sdk and cheerio dependencies for pre-grade feature"
```

---

## Task 2: Database Migration

**Files:** `supabase/migrations/002_pre_grade_intelligence.sql`

- [ ] **Write migration**

```sql
-- lib/grade/types.ts uses 'high'|'medium'|'low' and 'grade'|'uncertain'|'skip'
-- Keep these as plain text columns; CHECK constraints enforce values.

create table grade_analyses (
  id                   uuid primary key default gen_random_uuid(),
  card_key             text not null,
  mode                 text not null check (mode in ('ebay', 'personal')),
  status               text not null default 'pending'
                         check (status in ('pending', 'analyzing', 'complete', 'error')),
  ebay_item_id         text,
  image_urls           jsonb not null default '[]',
  centering_lr         numeric(5,2),
  centering_tb         numeric(5,2),
  centering_eligible   boolean,
  corner_assessment    text,
  edge_assessment      text,
  surface_assessment   text,
  attribute_details    jsonb not null default '[]',
  grade_distribution   jsonb not null default '{}',
  graded_comps         jsonb not null default '{}',
  raw_price            numeric(10,2),
  ev_regular           numeric(10,2),
  ep_regular           numeric(10,2),
  ev_express           numeric(10,2),
  ep_express           numeric(10,2),
  ev_super_express     numeric(10,2),
  ep_super_express     numeric(10,2),
  break_even_grade     integer,
  break_even_prob      numeric(5,4),
  recommendation       text check (recommendation in ('grade', 'uncertain', 'skip')),
  reliability_score    text check (reliability_score in ('high', 'medium', 'low')),
  caveats              jsonb not null default '[]',
  error_message        text,
  created_at           timestamptz not null default now()
);

-- Market-observed grade distribution from eBay sold listings
create table grade_dist_cache (
  id           uuid primary key default gen_random_uuid(),
  card_key     text unique not null,
  grades       jsonb not null default '{}',
  total        integer not null default 0,
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

- [ ] **Apply migration**

```bash
npx supabase db push
```

Expected: migration applies with no errors.

- [ ] **Commit**

```bash
git add supabase/migrations/002_pre_grade_intelligence.sql
git commit -m "feat: add grade_analyses, grade_dist_cache, grade_reference_images tables"
```

---

## Task 3: TypeScript Types

**Files:** `lib/grade/types.ts`

- [ ] **Write types file**

```typescript
// lib/grade/types.ts

export type GradeKey = 10 | 9 | 8 | 7
export type Reliability = 'high' | 'medium' | 'low'
export type Recommendation = 'grade' | 'uncertain' | 'skip'
export type AttributeName = 'corners' | 'edges' | 'surface'
export type Assessment = 'excellent' | 'good' | 'fair' | 'poor'
export type AnalysisStatus = 'pending' | 'analyzing' | 'complete' | 'error'

export interface CardIdentity {
  player: string
  year: number
  set: string
  cardNumber: string
  cardKey: string // e.g. "mahomes-2018-prizm-168"
}

// Probability distribution across grades (values sum to 1.0)
export interface GradeDistribution {
  10: number
  9: number
  8: number
  7: number
}

// Market comp prices per grade (may be missing grades with < 3 comps)
export type GradedComps = Partial<Record<GradeKey, number>>

export interface PhotoQualityResult {
  imageUrl: string
  resolution: Reliability
  blurSevere: boolean
  glare: boolean
  score: Reliability
}

export interface SessionReliability {
  score: Reliability
  photoScores: PhotoQualityResult[]
  bannerText: string | null
}

export interface CenteringResult {
  leftRight: number   // left side percentage, e.g. 53 means 53/47
  topBottom: number   // top side percentage, e.g. 55 means 55/45
  psa10Eligible: boolean
  confidence: 'high' | 'low'
  error?: string
}

// Multipliers adjust each grade's prior probability.
// [mult_10, mult_9, mult_8, mult_7] — 1.0 = no change
export interface AttributeResult {
  attribute: AttributeName
  assessment: Assessment
  confidence: Reliability
  multipliers: [number, number, number, number]
  notes: string
}

export interface EvResult {
  totalCost: number
  evGraded: number
  expectedProfit: number
  breakEvenGrade: GradeKey | null
  breakEvenProbability: number
  annualizedReturn: number | null // null if EP <= 0
  recommendation: Recommendation
}

export interface GradingTierResult {
  name: 'regular' | 'express' | 'superExpress'
  displayName: string
  fee: number
  shippingCost: number
  turnaroundDays: number
  ev: EvResult
}

export interface GradeAnalysisRow {
  id: string
  card_key: string
  mode: 'ebay' | 'personal'
  status: AnalysisStatus
  ebay_item_id?: string
  image_urls: string[]
  centering_lr?: number
  centering_tb?: number
  centering_eligible?: boolean
  corner_assessment?: string
  edge_assessment?: string
  surface_assessment?: string
  attribute_details: AttributeResult[]
  grade_distribution: GradeDistribution
  graded_comps: GradedComps
  raw_price?: number
  ev_regular?: number
  ep_regular?: number
  ev_express?: number
  ep_express?: number
  ev_super_express?: number
  ep_super_express?: number
  break_even_grade?: number
  break_even_prob?: number
  recommendation?: Recommendation
  reliability_score?: Reliability
  caveats: string[]
  error_message?: string
  created_at: string
}
```

- [ ] **Commit**

```bash
git add lib/grade/types.ts
git commit -m "feat: add shared TypeScript types for pre-grade feature"
```

---

## Task 4: Market Grade Distribution Cache

**Files:** `lib/grade/grade-dist-cache.ts`

Fetches eBay sold listings for a card and tallies grade counts from listing titles. This gives a market-observed prior distribution without scraping PSA directly.

- [ ] **Write the module**

```typescript
// lib/grade/grade-dist-cache.ts
import { fetchSoldComps } from '@/lib/ebay/finding'
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
  // fetchSoldComps only returns price+date; we need titles too.
  // Call the Finding API directly for this query to get titles.
  const base =
    process.env.EBAY_ENVIRONMENT === 'sandbox'
      ? 'https://svcs.sandbox.ebay.com'
      : 'https://svcs.ebay.com'

  const params = new URLSearchParams()
  params.set('OPERATION-NAME', 'findCompletedItems')
  params.set('SERVICE-VERSION', '1.0.0')
  params.set('SECURITY-APPNAME', process.env.EBAY_CLIENT_ID!)
  params.set('RESPONSE-DATA-FORMAT', 'JSON')
  params.set('REST-PAYLOAD', 'true')
  params.set('keywords', `${player} ${year} ${set} PSA`)
  params.set('categoryId', '212')
  params.set('itemFilter(0).name', 'SoldItemsOnly')
  params.set('itemFilter(0).value', 'true')
  params.set('paginationInput.entriesPerPage', '100')
  params.set('outputSelector', 'SellerInfo')

  const res = await fetch(`${base}/services/search/FindingService/v1?${params}`)
  if (!res.ok) throw new Error(`eBay Finding API ${res.status}`)

  const data = (await res.json()) as {
    findCompletedItemsResponse?: Array<{
      searchResult?: Array<{
        item?: Array<{ title: string[] }>
      }>
    }>
  }

  const items = data.findCompletedItemsResponse?.[0]?.searchResult?.[0]?.item ?? []
  const grades: Partial<Record<GradeKey, number>> = {}
  let total = 0

  for (const item of items) {
    const title = item.title?.[0] ?? ''
    const grade = parseGradeFromTitle(title)
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

- [ ] **Commit**

```bash
git add lib/grade/grade-dist-cache.ts
git commit -m "feat: add market grade distribution cache from eBay sold listings"
```

---

## Task 5: Reference Image Retrieval

**Files:** `lib/grade/reference-images.ts`

Fetches confirmed graded card images from eBay sold listings and caches them. Used to give Claude Vision concrete examples for each grade tier.

- [ ] **Write the module**

```typescript
// lib/grade/reference-images.ts
import { getEbayToken } from '@/lib/ebay/auth'
import { createServerClient } from '@/lib/supabase/server'
import type { GradeKey } from './types'

const GRADES_TO_FETCH: GradeKey[] = [10, 9, 8]
const TARGET_PER_GRADE = 10

interface ReferenceImage {
  imageUrl: string
  psa_grade: GradeKey
}

async function fetchGradedImages(
  player: string,
  year: number,
  set: string,
  grade: GradeKey
): Promise<string[]> {
  const token = await getEbayToken()
  const base =
    process.env.EBAY_ENVIRONMENT === 'sandbox'
      ? 'https://api.sandbox.ebay.com'
      : 'https://api.ebay.com'

  const params = new URLSearchParams({
    q: `${player} ${year} ${set} PSA ${grade}`,
    category_ids: '212',
    filter: 'buyingOptions:{FIXED_PRICE|AUCTION}',
    limit: '20',
  })

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

  if (!res.ok) return []

  const data = (await res.json()) as {
    itemSummaries?: Array<{ image?: { imageUrl: string }; title: string }>
  }

  return (data.itemSummaries ?? [])
    .filter((item) => item.image?.imageUrl)
    .map((item) => item.image!.imageUrl)
    .slice(0, TARGET_PER_GRADE)
}

export async function ensureReferenceImages(
  cardKey: string,
  player: string,
  year: number,
  set: string
): Promise<void> {
  const supabase = createServerClient()

  for (const grade of GRADES_TO_FETCH) {
    const { count } = await supabase
      .from('grade_reference_images')
      .select('*', { count: 'exact', head: true })
      .eq('card_key', cardKey)
      .eq('psa_grade', grade)

    if ((count ?? 0) >= 5) continue

    const urls = await fetchGradedImages(player, year, set, grade)
    if (urls.length === 0) continue

    const rows = urls.map((url) => ({
      card_key: cardKey,
      psa_grade: grade,
      image_url: url,
    }))

    await supabase
      .from('grade_reference_images')
      .upsert(rows, { onConflict: 'image_url', ignoreDuplicates: true })
  }
}

export async function getReferenceImages(
  cardKey: string
): Promise<ReferenceImage[]> {
  const supabase = createServerClient()

  const { data } = await supabase
    .from('grade_reference_images')
    .select('image_url, psa_grade')
    .eq('card_key', cardKey)
    .order('psa_grade', { ascending: false })
    .limit(TARGET_PER_GRADE * GRADES_TO_FETCH.length)

  return (data ?? []).map((row) => ({
    imageUrl: row.image_url as string,
    psa_grade: row.psa_grade as GradeKey,
  }))
}
```

- [ ] **Commit**

```bash
git add lib/grade/reference-images.ts
git commit -m "feat: add reference image retrieval and caching from eBay"
```

---

## Task 6: Photo Quality + Reliability Scoring

**Files:** `lib/grade/photo-quality.ts`, `lib/grade/reliability.ts`, `lib/__tests__/grade/reliability.test.ts`

- [ ] **Write photo-quality.ts**

```typescript
// lib/grade/photo-quality.ts
import type { PhotoQualityResult, Reliability } from './types'

interface ImageMetadata {
  url: string
  width?: number
  height?: number
  // In production, decode image dimensions from the buffer.
  // For now, score based on URL patterns and content-length.
  contentLengthBytes?: number
}

function scoreResolution(width?: number, height?: number, bytes?: number): Reliability {
  // Use pixel dimensions if available, fall back to file size heuristic
  if (width && height) {
    const px = width * height
    if (px > 1600 * 1200) return 'high'
    if (px > 800 * 600) return 'medium'
    return 'low'
  }
  if (bytes) {
    if (bytes > 300_000) return 'high'
    if (bytes > 80_000) return 'medium'
    return 'low'
  }
  return 'medium' // unknown → assume medium
}

export async function scorePhotoQuality(imageUrl: string): Promise<PhotoQualityResult> {
  let contentLengthBytes: number | undefined

  try {
    const head = await fetch(imageUrl, { method: 'HEAD' })
    const cl = head.headers.get('content-length')
    if (cl) contentLengthBytes = parseInt(cl, 10)
  } catch {
    // ignore — URL may not support HEAD
  }

  const resolution = scoreResolution(undefined, undefined, contentLengthBytes)

  // Blur and glare detection require pixel analysis (done in CV service).
  // For the HTTP-only scorer, default to non-severe.
  const score: Reliability =
    resolution === 'high' ? 'high' : resolution === 'medium' ? 'medium' : 'low'

  return {
    imageUrl,
    resolution,
    blurSevere: false,
    glare: false,
    score,
  }
}
```

- [ ] **Write reliability.ts**

```typescript
// lib/grade/reliability.ts
import type { PhotoQualityResult, Reliability, SessionReliability } from './types'

const BANNER: Record<Exclude<Reliability, 'high'>, string> = {
  medium:
    '⚠ Medium Reliability — seller photos have limited coverage. Surface estimate may be inaccurate.',
  low: '⚠ Low Reliability — photo quality is poor. This estimate is directional only. Consider requesting better photos from the seller before bidding.',
}

export function aggregateReliability(
  photoScores: PhotoQualityResult[]
): SessionReliability {
  if (photoScores.length === 0) {
    return { score: 'low', photoScores, bannerText: BANNER.low }
  }

  // Session score = worst individual photo score (conservative)
  const order: Reliability[] = ['high', 'medium', 'low']
  const worst = photoScores.reduce<Reliability>((acc, p) => {
    return order.indexOf(p.score) > order.indexOf(acc) ? p.score : acc
  }, 'high')

  return {
    score: worst,
    photoScores,
    bannerText: worst === 'high' ? null : BANNER[worst],
  }
}
```

- [ ] **Write the test**

```typescript
// lib/__tests__/grade/reliability.test.ts
import { describe, it, expect } from 'vitest'
import { aggregateReliability } from '@/lib/grade/reliability'
import type { PhotoQualityResult } from '@/lib/grade/types'

function photo(score: 'high' | 'medium' | 'low'): PhotoQualityResult {
  return { imageUrl: 'https://x.com/a.jpg', resolution: score, blurSevere: false, glare: false, score }
}

describe('aggregateReliability', () => {
  it('returns high when all photos are high', () => {
    const r = aggregateReliability([photo('high'), photo('high')])
    expect(r.score).toBe('high')
    expect(r.bannerText).toBeNull()
  })

  it('returns low when any photo is low', () => {
    const r = aggregateReliability([photo('high'), photo('low')])
    expect(r.score).toBe('low')
    expect(r.bannerText).toContain('directional only')
  })

  it('returns medium when worst is medium', () => {
    const r = aggregateReliability([photo('high'), photo('medium')])
    expect(r.score).toBe('medium')
    expect(r.bannerText).toContain('limited coverage')
  })

  it('returns low for empty array', () => {
    const r = aggregateReliability([])
    expect(r.score).toBe('low')
  })
})
```

- [ ] **Run tests**

```bash
npx vitest run lib/__tests__/grade/reliability.test.ts
```

Expected: 4 passing.

- [ ] **Commit**

```bash
git add lib/grade/photo-quality.ts lib/grade/reliability.ts lib/__tests__/grade/reliability.test.ts
git commit -m "feat: add photo quality scoring and session reliability aggregation"
```

---

## Task 7: Python CV Microservice

**Files:** `services/cv/centering.py`, `services/cv/main.py`, `services/cv/test_centering.py`

- [ ] **Write centering.py**

```python
# services/cv/centering.py
import cv2
import numpy as np


def measure_centering(image_bytes: bytes) -> dict:
    nparr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

    if img is None:
        return {"error": "decode_failed", "confidence": "low"}

    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    edges = cv2.Canny(blurred, 30, 120)

    # Dilate to close gaps in card border
    kernel = np.ones((3, 3), np.uint8)
    edges = cv2.dilate(edges, kernel, iterations=1)

    contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    if not contours:
        return {"error": "no_contours", "confidence": "low"}

    # Find largest rectangular-ish contour (the card)
    largest = max(contours, key=cv2.contourArea)
    area = cv2.contourArea(largest)
    img_area = img.shape[0] * img.shape[1]

    # Card should occupy a reasonable fraction of the image
    if area < img_area * 0.10:
        return {"error": "card_too_small", "confidence": "low"}

    x, y, w, h = cv2.boundingRect(largest)
    img_h, img_w = img.shape[:2]

    left = x
    right = img_w - (x + w)
    top = y
    bottom = img_h - (y + h)

    lr_total = left + right
    tb_total = top + bottom

    if lr_total < 4 or tb_total < 4:
        return {"error": "no_border_detected", "confidence": "low"}

    left_pct = round(left / lr_total * 100)
    top_pct = round(top / tb_total * 100)

    # PSA 10 requires 55/45 or better on each axis
    lr_ok = max(left_pct, 100 - left_pct) <= 55
    tb_ok = max(top_pct, 100 - top_pct) <= 55
    psa10_eligible = lr_ok and tb_ok

    return {
        "left_right": left_pct,
        "top_bottom": top_pct,
        "psa10_eligible": psa10_eligible,
        "confidence": "high",
    }
```

- [ ] **Write main.py**

```python
# services/cv/main.py
from fastapi import FastAPI, UploadFile, File, HTTPException
from centering import measure_centering

app = FastAPI(title="CardEdge CV Service")


@app.post("/centering")
async def analyze_centering(file: UploadFile = File(...)):
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")
    contents = await file.read()
    if len(contents) > 20 * 1024 * 1024:  # 20 MB max
        raise HTTPException(status_code=413, detail="Image too large")
    return measure_centering(contents)


@app.get("/health")
def health():
    return {"status": "ok"}
```

- [ ] **Write test_centering.py**

```python
# services/cv/test_centering.py
import numpy as np
import cv2
import pytest
from centering import measure_centering


def make_card_image(
    img_w: int = 600,
    img_h: int = 800,
    left: int = 30,
    right: int = 30,
    top: int = 40,
    bottom: int = 40,
) -> bytes:
    """Create a synthetic card image with white card on gray background."""
    img = np.full((img_h, img_w, 3), 100, dtype=np.uint8)
    card_x = left
    card_y = top
    card_w = img_w - left - right
    card_h = img_h - top - bottom
    img[card_y : card_y + card_h, card_x : card_x + card_w] = 255
    _, buf = cv2.imencode(".jpg", img)
    return buf.tobytes()


def test_perfectly_centered():
    img = make_card_image(left=30, right=30, top=40, bottom=40)
    result = measure_centering(img)
    assert result.get("confidence") == "high"
    assert result["left_right"] == 50
    assert result["top_bottom"] == 50
    assert result["psa10_eligible"] is True


def test_off_center_fails_psa10():
    # 70/30 split → not PSA 10 eligible
    img = make_card_image(left=70, right=30, top=40, bottom=40)
    result = measure_centering(img)
    assert result.get("confidence") == "high"
    assert result["psa10_eligible"] is False


def test_borderline_55_45_eligible():
    # Exactly 55/45 → still PSA 10 eligible
    img = make_card_image(left=55, right=45, top=50, bottom=50)
    result = measure_centering(img)
    assert result.get("confidence") == "high"
    assert result["psa10_eligible"] is True


def test_empty_bytes_returns_error():
    result = measure_centering(b"not an image")
    assert "error" in result
    assert result["confidence"] == "low"
```

- [ ] **Run Python tests (in services/cv directory)**

```bash
cd services/cv && pip install -r requirements.txt && pytest test_centering.py -v
```

Expected: 4 tests passing.

- [ ] **Commit**

```bash
git add services/cv/
git commit -m "feat: add Python CV microservice for card centering measurement"
```

---

## Task 8: Centering TypeScript Client

**Files:** `lib/grade/centering.ts`

Calls the Python microservice. Converts the image URL to a buffer and POSTs it as multipart form data.

- [ ] **Write centering.ts**

```typescript
// lib/grade/centering.ts
import type { CenteringResult } from './types'

const CV_SERVICE_URL = process.env.CV_SERVICE_URL ?? 'http://localhost:8001'

export async function measureCentering(imageUrl: string): Promise<CenteringResult> {
  try {
    // Fetch the image
    const imageRes = await fetch(imageUrl)
    if (!imageRes.ok) {
      return { leftRight: 50, topBottom: 50, psa10Eligible: false, confidence: 'low', error: 'image_fetch_failed' }
    }
    const imageBuffer = await imageRes.arrayBuffer()

    // Send to CV microservice
    const form = new FormData()
    form.append('file', new Blob([imageBuffer], { type: 'image/jpeg' }), 'card.jpg')

    const cvRes = await fetch(`${CV_SERVICE_URL}/centering`, {
      method: 'POST',
      body: form,
    })

    if (!cvRes.ok) {
      return { leftRight: 50, topBottom: 50, psa10Eligible: false, confidence: 'low', error: 'cv_service_error' }
    }

    const data = (await cvRes.json()) as {
      left_right?: number
      top_bottom?: number
      psa10_eligible?: boolean
      confidence?: 'high' | 'low'
      error?: string
    }

    if (data.error) {
      return { leftRight: 50, topBottom: 50, psa10Eligible: false, confidence: 'low', error: data.error }
    }

    return {
      leftRight: data.left_right ?? 50,
      topBottom: data.top_bottom ?? 50,
      psa10Eligible: data.psa10_eligible ?? false,
      confidence: data.confidence ?? 'low',
    }
  } catch (err) {
    return {
      leftRight: 50,
      topBottom: 50,
      psa10Eligible: false,
      confidence: 'low',
      error: err instanceof Error ? err.message : 'unknown',
    }
  }
}
```

- [ ] **Commit**

```bash
git add lib/grade/centering.ts
git commit -m "feat: add TypeScript client for CV centering microservice"
```

---

## Task 9: Card Identification

**Files:** `lib/grade/card-identify.ts`

- [ ] **Write card-identify.ts**

```typescript
// lib/grade/card-identify.ts
import Anthropic from '@anthropic-ai/sdk'
import type { CardIdentity } from './types'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

function buildCardKey(player: string, year: number, set: string, cardNumber: string): string {
  return [player, String(year), set, cardNumber]
    .map((s) =>
      s.toLowerCase()
       .replace(/\s+/g, '-')
       .replace(/[^a-z0-9-]/g, '')
       .replace(/-+/g, '-')
       .replace(/^-|-$/g, '')
    )
    .join('-')
}

export async function identifyCardFromTitle(title: string): Promise<CardIdentity | null> {
  // Fast path: parse eBay listing title directly
  // e.g. "2018 Panini Prizm Patrick Mahomes RC #168 PSA 10"
  const yearMatch = title.match(/\b(19|20)\d{2}\b/)
  const cardNumMatch = title.match(/#\s*(\w+)/)

  if (!yearMatch || !cardNumMatch) return null

  const year = parseInt(yearMatch[0], 10)
  const cardNumber = cardNumMatch[1]

  // Extract player — heuristic: words after year that look like a name
  const afterYear = title.slice(title.indexOf(yearMatch[0]) + yearMatch[0].length).trim()
  // Remove set/brand words and extract player name
  const playerMatch = afterYear.match(/([A-Z][a-z]+ [A-Z][a-z]+)/)
  const player = playerMatch ? playerMatch[1] : 'Unknown'

  // Extract set — words between year and player
  const beforePlayer = afterYear.slice(0, playerMatch ? afterYear.indexOf(playerMatch[0]) : afterYear.length).trim()
  const set = beforePlayer.replace(/\s+/g, ' ').trim() || 'Unknown'

  const cardKey = buildCardKey(player, year, set, cardNumber)
  return { player, year, set, cardNumber, cardKey }
}

export async function identifyCardFromImage(imageUrl: string): Promise<CardIdentity | null> {
  const prompt = `Look at this sports card image and extract the following details. Return JSON only, no prose.

{
  "player": "Full name as printed on the card",
  "year": 2018,
  "set": "Set name e.g. Prizm, Topps Chrome, Bowman",
  "cardNumber": "Card number as printed e.g. 168, RC-1, PA-1"
}

If you cannot determine any field, use null for that field.`

  try {
    const response = await client.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 256,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'url', url: imageUrl } },
            { type: 'text', text: prompt },
          ],
        },
      ],
    })

    const text = response.content[0].type === 'text' ? response.content[0].text : ''
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return null

    const parsed = JSON.parse(jsonMatch[0]) as {
      player?: string | null
      year?: number | null
      set?: string | null
      cardNumber?: string | null
    }

    if (!parsed.player || !parsed.year || !parsed.set || !parsed.cardNumber) return null

    const cardKey = buildCardKey(parsed.player, parsed.year, parsed.set, parsed.cardNumber)
    return {
      player: parsed.player,
      year: parsed.year,
      set: parsed.set,
      cardNumber: parsed.cardNumber,
      cardKey,
    }
  } catch {
    return null
  }
}
```

- [ ] **Commit**

```bash
git add lib/grade/card-identify.ts
git commit -m "feat: add card identification from eBay title and Claude Vision"
```

---

## Task 10: Attribute Analysis (Vision LLM)

**Files:** `lib/grade/attribute-analysis.ts`

- [ ] **Write attribute-analysis.ts**

```typescript
// lib/grade/attribute-analysis.ts
import Anthropic from '@anthropic-ai/sdk'
import type { AttributeResult, AttributeName } from './types'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

function buildPrompt(referenceCount10: number, referenceCount9: number): string {
  return `You are an expert PSA card grader. You will analyze a raw (ungraded) sports card.

The images are structured as follows:
- First ${referenceCount10} images: CONFIRMED PSA 10 GEM MINT copies of this exact card
- Next ${referenceCount9} images: CONFIRMED PSA 9 MINT copies of this exact card
- Remaining images: The RAW CARD being evaluated

PSA STANDARDS:
- PSA 10: Four sharp corners, no edge wear, surface free of defects, near-perfect centering
- PSA 9: One minor flaw allowed (very slight corner wear OR minor edge wear OR minor print line)
- PSA 8: Moderate wear, slight surface wear, minor corner rounding on up to two corners
- PSA 7: Up to three corners with noticeable rounding, light scratches, heavier edge wear

For each attribute of the RAW CARD, compare it against the reference images and return a JSON object.
multipliers is [mult_for_10, mult_for_9, mult_for_8, mult_for_7] — relative likelihood adjustments, use 1.0 for no change.

Return ONLY valid JSON:
{
  "corners": {
    "assessment": "good",
    "confidence": "high",
    "multipliers": [0.6, 1.3, 1.0, 0.7],
    "notes": "Three sharp corners. Top-right shows slight rounding consistent with PSA 9 references."
  },
  "edges": {
    "assessment": "excellent",
    "confidence": "high",
    "multipliers": [1.1, 1.0, 0.9, 0.7],
    "notes": "All edges clean. No chipping or whitening visible."
  },
  "surface": {
    "assessment": "excellent",
    "confidence": "medium",
    "multipliers": [1.0, 1.0, 1.0, 1.0],
    "notes": "No visible defects. Confidence medium — flat lighting may hide micro-scratches."
  }
}`
}

export async function analyzeAttributes(
  submittedImageUrls: string[],
  referenceImages: Array<{ imageUrl: string; psa_grade: number }>
): Promise<AttributeResult[]> {
  const refs10 = referenceImages.filter((r) => r.psa_grade === 10).slice(0, 5)
  const refs9 = referenceImages.filter((r) => r.psa_grade === 9).slice(0, 5)

  const allImages = [
    ...refs10.map((r) => r.imageUrl),
    ...refs9.map((r) => r.imageUrl),
    ...submittedImageUrls,
  ]

  const imageBlocks = allImages.map((url) => ({
    type: 'image' as const,
    source: { type: 'url' as const, url },
  }))

  const response = await client.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: [
          ...imageBlocks,
          { type: 'text', text: buildPrompt(refs10.length, refs9.length) },
        ],
      },
    ],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : '{}'
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) return defaultAttributes()

  try {
    const parsed = JSON.parse(jsonMatch[0]) as Record<
      AttributeName,
      {
        assessment: string
        confidence: string
        multipliers: [number, number, number, number]
        notes: string
      }
    >

    const attrs: AttributeName[] = ['corners', 'edges', 'surface']
    return attrs.map((attr) => {
      const a = parsed[attr]
      if (!a) return defaultAttribute(attr)
      return {
        attribute: attr,
        assessment: (a.assessment ?? 'fair') as AttributeResult['assessment'],
        confidence: (a.confidence ?? 'low') as AttributeResult['confidence'],
        multipliers: a.multipliers ?? [1, 1, 1, 1],
        notes: a.notes ?? '',
      }
    })
  } catch {
    return defaultAttributes()
  }
}

function defaultAttribute(attribute: AttributeName): AttributeResult {
  return {
    attribute,
    assessment: 'fair',
    confidence: 'low',
    multipliers: [1, 1, 1, 1],
    notes: 'Analysis unavailable.',
  }
}

function defaultAttributes(): AttributeResult[] {
  return (['corners', 'edges', 'surface'] as AttributeName[]).map(defaultAttribute)
}
```

- [ ] **Commit**

```bash
git add lib/grade/attribute-analysis.ts
git commit -m "feat: add Claude Vision attribute analysis with reference image comparison"
```

---

## Task 11: Grade Distribution (Bayesian Update)

**Files:** `lib/grade/grade-distribution.ts`, `lib/__tests__/grade/grade-distribution.test.ts`

- [ ] **Write grade-distribution.ts**

```typescript
// lib/grade/grade-distribution.ts
import type { GradeDistribution, AttributeResult } from './types'

const FLAT_PRIOR: GradeDistribution = { 10: 0.08, 9: 0.50, 8: 0.30, 7: 0.12 }

export function applyBayesianUpdate(
  prior: GradeDistribution,
  attributes: AttributeResult[],
  centeringEligible: boolean
): GradeDistribution {
  // Start with centering multipliers
  const centeringMultipliers: [number, number, number, number] = centeringEligible
    ? [1.2, 1.0, 0.9, 0.7]  // eligible → boosts P(10)
    : [0.1, 0.8, 1.2, 1.3]  // not eligible → kills P(10)

  const allMultipliers = [centeringMultipliers, ...attributes.map((a) => a.multipliers)]

  // Multiply all multiplier vectors element-wise
  const combined: [number, number, number, number] = [1, 1, 1, 1]
  for (const mults of allMultipliers) {
    combined[0] *= mults[0]
    combined[1] *= mults[1]
    combined[2] *= mults[2]
    combined[3] *= mults[3]
  }

  const unnormalized = {
    10: prior[10] * combined[0],
    9: prior[9] * combined[1],
    8: prior[8] * combined[2],
    7: prior[7] * combined[3],
  }

  return normalize(unnormalized)
}

function normalize(dist: GradeDistribution): GradeDistribution {
  const total = dist[10] + dist[9] + dist[8] + dist[7]
  if (total === 0) return FLAT_PRIOR
  return {
    10: dist[10] / total,
    9: dist[9] / total,
    8: dist[8] / total,
    7: dist[7] / total,
  }
}

export { FLAT_PRIOR }
```

- [ ] **Write the test**

```typescript
// lib/__tests__/grade/grade-distribution.test.ts
import { describe, it, expect } from 'vitest'
import { applyBayesianUpdate } from '@/lib/grade/grade-distribution'
import type { AttributeResult, GradeDistribution } from '@/lib/grade/types'

const UNIFORM: GradeDistribution = { 10: 0.25, 9: 0.25, 8: 0.25, 7: 0.25 }

function attr(mults: [number, number, number, number]): AttributeResult {
  return {
    attribute: 'corners',
    assessment: 'good',
    confidence: 'high',
    multipliers: mults,
    notes: '',
  }
}

describe('applyBayesianUpdate', () => {
  it('no-op multipliers return normalized prior', () => {
    const result = applyBayesianUpdate(UNIFORM, [attr([1, 1, 1, 1])], true)
    // centering eligible boosts 10 slightly, but with uniform prior expect rough normalization
    expect(result[10] + result[9] + result[8] + result[7]).toBeCloseTo(1.0, 5)
  })

  it('centering not eligible crushes P(10)', () => {
    const result = applyBayesianUpdate(UNIFORM, [], false)
    expect(result[10]).toBeLessThan(0.05)
    expect(result[9] + result[8] + result[7]).toBeGreaterThan(0.95)
  })

  it('excellent attributes boost P(10)', () => {
    const result = applyBayesianUpdate(
      UNIFORM,
      [
        attr([2.0, 1.0, 0.5, 0.3]),
        attr([2.0, 1.0, 0.5, 0.3]),
      ],
      true
    )
    expect(result[10]).toBeGreaterThan(result[9])
  })

  it('poor corners crush P(10)', () => {
    const result = applyBayesianUpdate(UNIFORM, [attr([0.1, 0.8, 1.2, 1.5])], true)
    expect(result[10]).toBeLessThan(0.05)
  })

  it('distribution always sums to 1', () => {
    const result = applyBayesianUpdate(
      { 10: 0.14, 9: 0.63, 8: 0.16, 7: 0.07 },
      [attr([0.6, 1.3, 1.0, 0.7])],
      true
    )
    expect(result[10] + result[9] + result[8] + result[7]).toBeCloseTo(1.0, 5)
  })
})
```

- [ ] **Run test**

```bash
npx vitest run lib/__tests__/grade/grade-distribution.test.ts
```

Expected: 5 passing.

- [ ] **Commit**

```bash
git add lib/grade/grade-distribution.ts lib/__tests__/grade/grade-distribution.test.ts
git commit -m "feat: add Bayesian grade distribution update from attribute analysis"
```

---

## Task 12: Graded Comp Fetching

**Files:** `lib/grade/graded-comps.ts`

- [ ] **Write graded-comps.ts**

```typescript
// lib/grade/graded-comps.ts
import { fetchSoldComps } from '@/lib/ebay/finding'
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

- [ ] **Commit**

```bash
git add lib/grade/graded-comps.ts
git commit -m "feat: add graded comp price fetching per PSA grade tier"
```

---

## Task 13: EV Engine

**Files:** `lib/grade/ev-engine.ts`, `lib/__tests__/grade/ev-engine.test.ts`

- [ ] **Write ev-engine.ts**

```typescript
// lib/grade/ev-engine.ts
import type { GradeDistribution, GradedComps, GradeKey, EvResult, GradingTierResult, Recommendation } from './types'

interface GradingTierConfig {
  name: 'regular' | 'express' | 'superExpress'
  displayName: string
  fee: number
  shippingCost: number
  turnaroundDays: number
}

function getTierConfigs(): GradingTierConfig[] {
  return [
    {
      name: 'regular',
      displayName: 'Regular',
      fee: Number(process.env.PSA_REGULAR_FEE ?? 25),
      shippingCost: Number(process.env.PSA_SHIPPING_COST ?? 12),
      turnaroundDays: Number(process.env.PSA_REGULAR_DAYS ?? 45),
    },
    {
      name: 'express',
      displayName: 'Express',
      fee: Number(process.env.PSA_EXPRESS_FEE ?? 150),
      shippingCost: Number(process.env.PSA_SHIPPING_COST ?? 12),
      turnaroundDays: Number(process.env.PSA_EXPRESS_DAYS ?? 5),
    },
    {
      name: 'superExpress',
      displayName: 'Super Express',
      fee: Number(process.env.PSA_SUPER_EXPRESS_FEE ?? 500),
      shippingCost: Number(process.env.PSA_SHIPPING_COST ?? 12),
      turnaroundDays: Number(process.env.PSA_SUPER_EXPRESS_DAYS ?? 2),
    },
  ]
}

function computeEvForTier(
  rawPrice: number,
  distribution: GradeDistribution,
  comps: GradedComps,
  tier: GradingTierConfig
): EvResult {
  const totalCost = rawPrice + tier.fee + tier.shippingCost

  // Only include grades with sufficient comp data
  const GRADES: GradeKey[] = [10, 9, 8, 7]
  let evGraded = 0
  let coveredProb = 0

  for (const grade of GRADES) {
    const compValue = comps[grade]
    const prob = distribution[grade]
    if (compValue !== undefined) {
      evGraded += prob * compValue
      coveredProb += prob
    }
  }

  // If we have partial comp coverage, scale up EV proportionally
  if (coveredProb > 0 && coveredProb < 1) {
    evGraded = evGraded / coveredProb
  }

  const expectedProfit = evGraded - totalCost

  // Break-even: lowest grade where comp value > total cost
  let breakEvenGrade: GradeKey | null = null
  let breakEvenProbability = 0
  for (const grade of GRADES.slice().sort((a, b) => a - b)) {
    const compValue = comps[grade]
    if (compValue !== undefined && compValue > totalCost) {
      breakEvenGrade = grade
      // P(break-even) = probability of this grade or higher
      breakEvenProbability = GRADES.filter((g) => g >= grade).reduce(
        (sum, g) => sum + distribution[g],
        0
      )
      break
    }
  }

  let recommendation: Recommendation
  if (expectedProfit <= 0 || breakEvenGrade === null || breakEvenProbability < 0.5) {
    recommendation = 'skip'
  } else if (breakEvenProbability >= 0.8) {
    recommendation = 'grade'
  } else {
    recommendation = 'uncertain'
  }

  const annualizedReturn =
    expectedProfit > 0
      ? (expectedProfit / totalCost) / (tier.turnaroundDays / 365)
      : null

  return {
    totalCost,
    evGraded: Math.round(evGraded * 100) / 100,
    expectedProfit: Math.round(expectedProfit * 100) / 100,
    breakEvenGrade,
    breakEvenProbability: Math.round(breakEvenProbability * 10000) / 10000,
    annualizedReturn: annualizedReturn !== null ? Math.round(annualizedReturn * 10000) / 10000 : null,
    recommendation,
  }
}

export function calculateAllTiers(
  rawPrice: number,
  distribution: GradeDistribution,
  comps: GradedComps
): GradingTierResult[] {
  return getTierConfigs().map((tier) => ({
    ...tier,
    ev: computeEvForTier(rawPrice, distribution, comps, tier),
  }))
}
```

- [ ] **Write the test**

```typescript
// lib/__tests__/grade/ev-engine.test.ts
import { describe, it, expect } from 'vitest'
import { calculateAllTiers } from '@/lib/grade/ev-engine'
import type { GradeDistribution, GradedComps } from '@/lib/grade/types'

const DISTRIBUTION: GradeDistribution = { 10: 0.09, 9: 0.54, 8: 0.28, 7: 0.09 }
const COMPS: GradedComps = { 10: 920, 9: 380, 8: 175, 7: 95 }
const RAW_PRICE = 120

describe('calculateAllTiers', () => {
  it('returns three tiers', () => {
    const tiers = calculateAllTiers(RAW_PRICE, DISTRIBUTION, COMPS)
    expect(tiers).toHaveLength(3)
    expect(tiers.map((t) => t.name)).toEqual(['regular', 'express', 'superExpress'])
  })

  it('total cost = raw + fee + shipping', () => {
    const tiers = calculateAllTiers(RAW_PRICE, DISTRIBUTION, COMPS)
    expect(tiers[0].ev.totalCost).toBe(120 + 25 + 12) // 157
    expect(tiers[1].ev.totalCost).toBe(120 + 150 + 12) // 282
    expect(tiers[2].ev.totalCost).toBe(120 + 500 + 12) // 632
  })

  it('EV is positive for profitable scenario on regular tier', () => {
    const tiers = calculateAllTiers(RAW_PRICE, DISTRIBUTION, COMPS)
    expect(tiers[0].ev.evGraded).toBeGreaterThan(tiers[0].ev.totalCost)
    expect(tiers[0].ev.expectedProfit).toBeGreaterThan(0)
  })

  it('super express shows skip when profit is negative', () => {
    const tiers = calculateAllTiers(RAW_PRICE, DISTRIBUTION, COMPS)
    expect(tiers[2].ev.recommendation).toBe('skip')
  })

  it('break-even grade is PSA 8 when PSA 8 comp exceeds regular cost', () => {
    // comps[8] = 175 > totalCost(regular) = 157 → break-even is 8
    const tiers = calculateAllTiers(RAW_PRICE, DISTRIBUTION, COMPS)
    expect(tiers[0].ev.breakEvenGrade).toBe(8)
  })

  it('P(break-even) for PSA 8 = P(8)+P(9)+P(10)', () => {
    const tiers = calculateAllTiers(RAW_PRICE, DISTRIBUTION, COMPS)
    const expected = DISTRIBUTION[8] + DISTRIBUTION[9] + DISTRIBUTION[10]
    expect(tiers[0].ev.breakEvenProbability).toBeCloseTo(expected, 4)
  })

  it('recommendation is grade when P(break-even) >= 0.8', () => {
    // P(>=8) = 0.28+0.54+0.09 = 0.91 → should be 'grade'
    const tiers = calculateAllTiers(RAW_PRICE, DISTRIBUTION, COMPS)
    expect(tiers[0].ev.recommendation).toBe('grade')
  })

  it('returns null annualizedReturn when EP is negative', () => {
    const tiers = calculateAllTiers(RAW_PRICE, DISTRIBUTION, COMPS)
    expect(tiers[2].ev.annualizedReturn).toBeNull()
  })

  it('handles missing grade comps gracefully', () => {
    const partialComps: GradedComps = { 9: 380 } // only PSA 9 data
    const tiers = calculateAllTiers(RAW_PRICE, DISTRIBUTION, partialComps)
    expect(tiers[0].ev.evGraded).toBeGreaterThan(0)
  })
})
```

- [ ] **Run tests**

```bash
npx vitest run lib/__tests__/grade/ev-engine.test.ts
```

Expected: 8 passing.

- [ ] **Commit**

```bash
git add lib/grade/ev-engine.ts lib/__tests__/grade/ev-engine.test.ts
git commit -m "feat: add EV engine with per-tier expected profit and break-even analysis"
```

---

## Task 14: Pipeline Orchestrator + Inngest Function

**Files:** `lib/grade/pipeline.ts`, `inngest/grade-analyzer.ts`

- [ ] **Write pipeline.ts**

```typescript
// lib/grade/pipeline.ts
import { createServerClient } from '@/lib/supabase/server'
import { scorePhotoQuality } from './photo-quality'
import { aggregateReliability } from './reliability'
import { measureCentering } from './centering'
import { identifyCardFromTitle, identifyCardFromImage } from './card-identify'
import { ensureReferenceImages, getReferenceImages } from './reference-images'
import { getGradeDistribution } from './grade-dist-cache'
import { analyzeAttributes } from './attribute-analysis'
import { applyBayesianUpdate } from './grade-distribution'
import { fetchGradedComps } from './graded-comps'
import { calculateAllTiers } from './ev-engine'
import type { CardIdentity, GradeAnalysisRow } from './types'

export interface PipelineInput {
  analysisId: string
  imageUrls: string[]
  rawPrice: number
  mode: 'ebay' | 'personal'
  ebayListingTitle?: string // eBay mode only — fast card ID path
}

export async function runPipeline(input: PipelineInput): Promise<void> {
  const supabase = createServerClient()

  async function updateRow(data: Partial<GradeAnalysisRow>) {
    await supabase.from('grade_analyses').update(data).eq('id', input.analysisId)
  }

  try {
    await updateRow({ status: 'analyzing' })

    // Step 1: Photo quality
    const photoScores = await Promise.all(input.imageUrls.map(scorePhotoQuality))
    const reliability = aggregateReliability(photoScores)

    // Step 2: Card identification
    let identity: CardIdentity | null = null
    if (input.ebayListingTitle) {
      const { identifyCardFromTitle: idFromTitle } = await import('./card-identify')
      identity = await idFromTitle(input.ebayListingTitle)
    }
    if (!identity && input.imageUrls[0]) {
      identity = await identifyCardFromImage(input.imageUrls[0])
    }
    if (!identity) {
      await updateRow({ status: 'error', error_message: 'Could not identify card from images or title.' })
      return
    }

    // Step 3: Centering (use front image)
    const centering = await measureCentering(input.imageUrls[0])

    // Step 4: Reference images + grade distribution prior (parallel)
    const [_, prior] = await Promise.all([
      ensureReferenceImages(identity.cardKey, identity.player, identity.year, identity.set),
      getGradeDistribution(identity.cardKey, identity.player, identity.year, identity.set),
    ])

    const referenceImages = await getReferenceImages(identity.cardKey)

    // Step 5: Attribute analysis
    const attributes = await analyzeAttributes(input.imageUrls, referenceImages)

    // Step 6: Bayesian grade distribution
    const distribution = applyBayesianUpdate(prior, attributes, centering.psa10Eligible)

    // Step 7: Graded comps + EV (parallel)
    const comps = await fetchGradedComps(identity.player, identity.year, identity.set, identity.cardNumber)
    const tiers = calculateAllTiers(input.rawPrice, distribution, comps)

    // Step 8: Generate caveats
    const caveats: string[] = []
    if (reliability.score === 'low' || reliability.score === 'medium') {
      caveats.push('Surface defects may not be visible in flat or low-quality lighting. Re-photograph with raking light for higher confidence.')
    }
    const surfaceAttr = attributes.find((a) => a.attribute === 'surface')
    if (surfaceAttr?.confidence === 'low') {
      caveats.push('Surface analysis confidence is low. Consider photographing with a flashlight held at 45° to reveal scratches.')
    }
    if (referenceImages.length < 5) {
      caveats.push('Limited reference images available for this card. Grade comparison accuracy may be reduced.')
    }

    const regularTier = tiers.find((t) => t.name === 'regular')!
    const expressTier = tiers.find((t) => t.name === 'express')!
    const superExpressTier = tiers.find((t) => t.name === 'superExpress')!

    await updateRow({
      status: 'complete',
      card_key: identity.cardKey,
      centering_lr: centering.leftRight,
      centering_tb: centering.topBottom,
      centering_eligible: centering.psa10Eligible,
      corner_assessment: attributes.find((a) => a.attribute === 'corners')?.assessment,
      edge_assessment: attributes.find((a) => a.attribute === 'edges')?.assessment,
      surface_assessment: attributes.find((a) => a.attribute === 'surface')?.assessment,
      attribute_details: attributes as unknown as GradeAnalysisRow['attribute_details'],
      grade_distribution: distribution as unknown as GradeAnalysisRow['grade_distribution'],
      graded_comps: comps as unknown as GradeAnalysisRow['graded_comps'],
      raw_price: input.rawPrice,
      ev_regular: regularTier.ev.evGraded,
      ep_regular: regularTier.ev.expectedProfit,
      ev_express: expressTier.ev.evGraded,
      ep_express: expressTier.ev.expectedProfit,
      ev_super_express: superExpressTier.ev.evGraded,
      ep_super_express: superExpressTier.ev.expectedProfit,
      break_even_grade: regularTier.ev.breakEvenGrade ?? undefined,
      break_even_prob: regularTier.ev.breakEvenProbability,
      recommendation: regularTier.ev.recommendation,
      reliability_score: reliability.score,
      caveats: caveats as unknown as GradeAnalysisRow['caveats'],
    })
  } catch (err) {
    await updateRow({
      status: 'error',
      error_message: err instanceof Error ? err.message : 'Pipeline failed.',
    })
  }
}
```

- [ ] **Write inngest/grade-analyzer.ts**

```typescript
// inngest/grade-analyzer.ts
import { inngest } from './client'
import { runPipeline } from '@/lib/grade/pipeline'

export const gradeAnalyzer = inngest.createFunction(
  { id: 'grade-analyzer', triggers: [{ event: 'grade/analyze.requested' }] },
  async ({ event }) => {
    await runPipeline({
      analysisId: event.data.analysisId as string,
      imageUrls: event.data.imageUrls as string[],
      rawPrice: event.data.rawPrice as number,
      mode: event.data.mode as 'ebay' | 'personal',
      ebayListingTitle: event.data.ebayListingTitle as string | undefined,
    })
  }
)
```

- [ ] **Register gradeAnalyzer in the Inngest route handler**

Open `app/api/inngest/route.ts` and add `gradeAnalyzer` to the `serve` call. The existing file looks like:

```typescript
import { serve } from 'inngest/next'
import { inngest } from '@/inngest/client'
import { dealScanner } from '@/inngest/deal-scanner'
// ADD THIS LINE:
import { gradeAnalyzer } from '@/inngest/grade-analyzer'

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [dealScanner, gradeAnalyzer], // ADD gradeAnalyzer HERE
})
```

- [ ] **Commit**

```bash
git add lib/grade/pipeline.ts inngest/grade-analyzer.ts app/api/inngest/route.ts
git commit -m "feat: add grade analyzer Inngest function and pipeline orchestrator"
```

---

## Task 15: API Routes

**Files:** `app/api/grade/analyze/route.ts`, `app/api/grade/ebay-images/route.ts`, `app/api/grade/analyses/[id]/route.ts`, `app/api/grade/history/route.ts`

- [ ] **Write analyze/route.ts**

```typescript
// app/api/grade/analyze/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { inngest } from '@/inngest/client'

export async function POST(req: NextRequest) {
  const body = (await req.json()) as {
    imageUrls: string[]
    rawPrice: number
    mode: 'ebay' | 'personal'
    ebayItemId?: string
    ebayListingTitle?: string
  }

  if (!body.imageUrls?.length || !body.rawPrice || !body.mode) {
    return NextResponse.json({ error: 'imageUrls, rawPrice, and mode are required' }, { status: 400 })
  }

  const supabase = createServerClient()

  const { data, error } = await supabase
    .from('grade_analyses')
    .insert({
      card_key: 'pending',
      mode: body.mode,
      status: 'pending',
      ebay_item_id: body.ebayItemId,
      image_urls: body.imageUrls,
      raw_price: body.rawPrice,
    })
    .select('id')
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'Failed to create analysis record' }, { status: 500 })
  }

  await inngest.send({
    name: 'grade/analyze.requested',
    data: {
      analysisId: data.id,
      imageUrls: body.imageUrls,
      rawPrice: body.rawPrice,
      mode: body.mode,
      ebayListingTitle: body.ebayListingTitle,
    },
  })

  return NextResponse.json({ analysisId: data.id })
}
```

- [ ] **Write analyses/[id]/route.ts**

```typescript
// app/api/grade/analyses/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = createServerClient()

  const { data, error } = await supabase
    .from('grade_analyses')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'Analysis not found' }, { status: 404 })
  }

  return NextResponse.json(data)
}
```

- [ ] **Write ebay-images/route.ts**

```typescript
// app/api/grade/ebay-images/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getEbayToken } from '@/lib/ebay/auth'

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url')
  if (!url) return NextResponse.json({ error: 'url is required' }, { status: 400 })

  // Extract eBay item ID from URL
  // Formats: /itm/title/123456789012 or /itm/123456789012
  const match = url.match(/\/itm\/(?:[^/]+\/)?(\d+)/)
  if (!match) return NextResponse.json({ error: 'Invalid eBay URL' }, { status: 400 })

  const itemId = match[1]
  const token = await getEbayToken()
  const base =
    process.env.EBAY_ENVIRONMENT === 'sandbox'
      ? 'https://api.sandbox.ebay.com'
      : 'https://api.ebay.com'

  const res = await fetch(`${base}/buy/browse/v1/item/v1|${itemId}|0`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US',
      'X-EBAY-C-ENDUSERCTX': 'contextualLocation=country=US',
    },
  })

  if (!res.ok) {
    return NextResponse.json({ error: 'eBay item not found' }, { status: 404 })
  }

  const data = (await res.json()) as {
    itemId: string
    title: string
    price?: { value: string }
    image?: { imageUrl: string }
    additionalImages?: Array<{ imageUrl: string }>
  }

  const images = [
    data.image?.imageUrl,
    ...(data.additionalImages ?? []).map((i) => i.imageUrl),
  ].filter(Boolean) as string[]

  return NextResponse.json({
    itemId: data.itemId,
    title: data.title,
    price: data.price?.value ? parseFloat(data.price.value) : null,
    imageUrls: images,
  })
}
```

- [ ] **Write history/route.ts**

```typescript
// app/api/grade/history/route.ts
import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = createServerClient()

  const { data, error } = await supabase
    .from('grade_analyses')
    .select('id, card_key, mode, status, recommendation, reliability_score, raw_price, ep_regular, created_at')
    .eq('status', 'complete')
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) {
    return NextResponse.json({ error: 'Failed to fetch history' }, { status: 500 })
  }

  return NextResponse.json(data)
}
```

- [ ] **Commit**

```bash
git add app/api/grade/
git commit -m "feat: add grade API routes (analyze, poll, ebay-images, history)"
```

---

## Task 16: Page Scaffold + ModeToggle

**Files:** `app/(app)/grade/page.tsx`, `components/grade/ModeToggle.tsx`

- [ ] **Write ModeToggle.tsx**

```tsx
// components/grade/ModeToggle.tsx
'use client'

type Mode = 'ebay' | 'personal'

interface Props {
  mode: Mode
  onChange: (mode: Mode) => void
}

export function ModeToggle({ mode, onChange }: Props) {
  return (
    <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-800 p-1">
      {(['ebay', 'personal'] as Mode[]).map((m) => (
        <button
          key={m}
          onClick={() => onChange(m)}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            mode === m
              ? 'bg-indigo-500 text-white'
              : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-100'
          }`}
        >
          {m === 'ebay' ? 'eBay Listing' : 'My Card'}
        </button>
      ))}
    </div>
  )
}
```

- [ ] **Write grade/page.tsx**

```tsx
// app/(app)/grade/page.tsx
'use client'

import { useState } from 'react'
import { ModeToggle } from '@/components/grade/ModeToggle'
import { EbayInput } from '@/components/grade/EbayInput'
import { CaptureFlow } from '@/components/grade/CaptureFlow'
import { PhotoGrid } from '@/components/grade/PhotoGrid'
import { ReliabilityBanner } from '@/components/grade/ReliabilityBanner'
import { CardConfirmation } from '@/components/grade/CardConfirmation'
import { AnalysisLoader } from '@/components/grade/AnalysisLoader'
import { AttributeBreakdown } from '@/components/grade/AttributeBreakdown'
import { GradeDistributionChart } from '@/components/grade/GradeDistribution'
import { EvTable } from '@/components/grade/EvTable'
import { Recommendation } from '@/components/grade/Recommendation'
import { CaveatList } from '@/components/grade/CaveatList'
import { AnalysisHistory } from '@/components/grade/AnalysisHistory'
import type { GradeAnalysisRow } from '@/lib/grade/types'

type Stage =
  | 'input'
  | 'confirm-card'
  | 'analyzing'
  | 'result'

export default function GradePage() {
  const [mode, setMode] = useState<'ebay' | 'personal'>('ebay')
  const [stage, setStage] = useState<Stage>('input')
  const [imageUrls, setImageUrls] = useState<string[]>([])
  const [ebayMeta, setEbayMeta] = useState<{ itemId: string; title: string; price: number | null } | null>(null)
  const [analysisId, setAnalysisId] = useState<string | null>(null)
  const [result, setResult] = useState<GradeAnalysisRow | null>(null)
  const [rawPrice, setRawPrice] = useState<number>(0)

  function reset() {
    setStage('input')
    setImageUrls([])
    setEbayMeta(null)
    setAnalysisId(null)
    setResult(null)
    setRawPrice(0)
  }

  async function startAnalysis(confirmedRawPrice: number) {
    setRawPrice(confirmedRawPrice)
    setStage('analyzing')

    const res = await fetch('/api/grade/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imageUrls,
        rawPrice: confirmedRawPrice,
        mode,
        ebayItemId: ebayMeta?.itemId,
        ebayListingTitle: ebayMeta?.title,
      }),
    })

    const { analysisId: id } = (await res.json()) as { analysisId: string }
    setAnalysisId(id)
  }

  function onAnalysisComplete(row: GradeAnalysisRow) {
    setResult(row)
    setStage('result')
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-10 space-y-8">
      <div className="space-y-1">
        <h1 className="text-3xl font-bold">Pre-Grade</h1>
        <p className="text-slate-500 dark:text-slate-400 text-sm">
          Predict PSA grade probability and calculate expected grading profit before you submit.
        </p>
      </div>

      {stage === 'input' && (
        <div className="space-y-6">
          <ModeToggle mode={mode} onChange={(m) => { setMode(m); reset() }} />

          {mode === 'ebay' ? (
            <EbayInput
              onImagesLoaded={(urls, meta) => {
                setImageUrls(urls)
                setEbayMeta(meta)
              }}
            />
          ) : (
            <CaptureFlow onComplete={(urls) => setImageUrls(urls)} />
          )}

          {imageUrls.length > 0 && (
            <div className="space-y-4">
              <PhotoGrid imageUrls={imageUrls} mode={mode} />
              {mode === 'ebay' && <ReliabilityBanner imageUrls={imageUrls} />}
              <CardConfirmation
                imageUrls={imageUrls}
                listingTitle={ebayMeta?.title}
                suggestedPrice={ebayMeta?.price ?? undefined}
                onConfirm={(price) => {
                  setStage('confirm-card')
                  startAnalysis(price)
                }}
              />
            </div>
          )}
        </div>
      )}

      {stage === 'analyzing' && analysisId && (
        <AnalysisLoader analysisId={analysisId} onComplete={onAnalysisComplete} />
      )}

      {stage === 'result' && result && (
        <div className="space-y-8">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">{result.card_key.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}</h2>
            <button onClick={reset} className="text-sm text-indigo-500 hover:underline">
              New Analysis
            </button>
          </div>
          <Recommendation result={result} />
          <AttributeBreakdown result={result} />
          <GradeDistributionChart distribution={result.grade_distribution} comps={result.graded_comps} />
          <EvTable result={result} />
          <CaveatList caveats={result.caveats as string[]} />
        </div>
      )}

      <div className="border-t border-slate-200 dark:border-slate-800 pt-8">
        <AnalysisHistory />
      </div>
    </div>
  )
}
```

- [ ] **Commit**

```bash
git add app/\(app\)/grade/page.tsx components/grade/ModeToggle.tsx
git commit -m "feat: add /grade page scaffold and ModeToggle component"
```

---

## Task 17: EbayInput + PhotoGrid + ReliabilityBanner

**Files:** `components/grade/EbayInput.tsx`, `components/grade/PhotoGrid.tsx`, `components/grade/ReliabilityBanner.tsx`

- [ ] **Write EbayInput.tsx**

```tsx
// components/grade/EbayInput.tsx
'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'

interface EbayMeta {
  itemId: string
  title: string
  price: number | null
}

interface Props {
  onImagesLoaded: (urls: string[], meta: EbayMeta) => void
}

export function EbayInput({ onImagesLoaded }: Props) {
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleFetch() {
    setError(null)
    setLoading(true)
    try {
      const res = await fetch(`/api/grade/ebay-images?url=${encodeURIComponent(url)}`)
      if (!res.ok) {
        const { error: e } = (await res.json()) as { error: string }
        setError(e ?? 'Failed to fetch listing')
        return
      }
      const data = (await res.json()) as { itemId: string; title: string; price: number | null; imageUrls: string[] }
      if (!data.imageUrls.length) {
        setError('No images found in this listing')
        return
      }
      onImagesLoaded(data.imageUrls, { itemId: data.itemId, title: data.title, price: data.price })
    } catch {
      setError('Could not reach eBay. Check the URL and try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-3">
      <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
        eBay Listing URL
      </label>
      <div className="flex gap-2">
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://www.ebay.com/itm/..."
          className="flex-1 rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
        />
        <Button onClick={handleFetch} disabled={!url || loading}>
          {loading ? 'Fetching…' : 'Fetch Photos'}
        </Button>
      </div>
      {error && <p className="text-sm text-red-500">{error}</p>}
    </div>
  )
}
```

- [ ] **Write PhotoGrid.tsx**

```tsx
// components/grade/PhotoGrid.tsx
'use client'

interface Props {
  imageUrls: string[]
  mode: 'ebay' | 'personal'
}

const STEP_LABELS = ['Front', 'Back', 'Top-left', 'Top-right', 'Bottom-left', 'Bottom-right', 'Raking Light']

export function PhotoGrid({ imageUrls, mode }: Props) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
        {imageUrls.length} photo{imageUrls.length !== 1 ? 's' : ''} loaded
      </p>
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
        {imageUrls.map((url, i) => (
          <div key={url} className="relative aspect-[2.5/3.5] rounded-md overflow-hidden bg-slate-100 dark:bg-slate-800">
            <img src={url} alt={`Photo ${i + 1}`} className="object-cover w-full h-full" />
            {mode === 'personal' && (
              <span className="absolute bottom-1 left-1 text-[10px] bg-black/60 text-white px-1 rounded">
                {STEP_LABELS[i] ?? `Photo ${i + 1}`}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Write ReliabilityBanner.tsx**

```tsx
// components/grade/ReliabilityBanner.tsx
'use client'

import { AlertTriangle } from 'lucide-react'

interface Props {
  imageUrls: string[]
}

// Heuristic: score based on number of images (proxy for coverage)
function getReliability(count: number): 'high' | 'medium' | 'low' {
  if (count >= 4) return 'high'
  if (count >= 2) return 'medium'
  return 'low'
}

const MESSAGES = {
  high: null,
  medium: '⚠ Medium Reliability — seller photos have limited coverage. Surface estimate may be inaccurate.',
  low: '⚠ Low Reliability — only one photo available. This estimate is directional only. Consider requesting better photos before bidding.',
}

export function ReliabilityBanner({ imageUrls }: Props) {
  const score = getReliability(imageUrls.length)
  const message = MESSAGES[score]
  if (!message) return null

  return (
    <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30 px-4 py-3">
      <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
      <p className="text-sm text-amber-700 dark:text-amber-400">{message}</p>
    </div>
  )
}
```

- [ ] **Commit**

```bash
git add components/grade/EbayInput.tsx components/grade/PhotoGrid.tsx components/grade/ReliabilityBanner.tsx
git commit -m "feat: add EbayInput, PhotoGrid, and ReliabilityBanner components"
```

---

## Task 18: CardConfirmation + CaptureFlow

**Files:** `components/grade/CardConfirmation.tsx`, `components/grade/CaptureFlow.tsx`, `components/grade/CaptureStep.tsx`

- [ ] **Write CardConfirmation.tsx**

```tsx
// components/grade/CardConfirmation.tsx
'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'

interface Props {
  imageUrls: string[]
  listingTitle?: string
  suggestedPrice?: number
  onConfirm: (rawPrice: number) => void
}

export function CardConfirmation({ listingTitle, suggestedPrice, onConfirm }: Props) {
  const [price, setPrice] = useState(suggestedPrice?.toString() ?? '')

  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-5 space-y-4">
      <h3 className="font-semibold">Confirm before analysis</h3>

      {listingTitle && (
        <div>
          <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Listing</p>
          <p className="text-sm">{listingTitle}</p>
        </div>
      )}

      <div className="space-y-1">
        <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
          Raw card price ($)
        </label>
        <input
          type="number"
          min={0}
          step={0.01}
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          placeholder="e.g. 120"
          className="w-40 rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
        />
        <p className="text-xs text-slate-400">
          Enter what you paid or the current asking price. Used to calculate expected profit.
        </p>
      </div>

      <Button
        onClick={() => onConfirm(parseFloat(price))}
        disabled={!price || parseFloat(price) <= 0}
      >
        Run Grading Analysis
      </Button>
    </div>
  )
}
```

- [ ] **Write CaptureStep.tsx**

```tsx
// components/grade/CaptureStep.tsx
'use client'

import { Check } from 'lucide-react'

interface Props {
  stepNumber: number
  label: string
  description: string
  guideText: string
  done: boolean
  onCapture: (file: File) => void
}

export function CaptureStep({ stepNumber, label, description, guideText, done, onCapture }: Props) {
  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) onCapture(file)
  }

  return (
    <div className={`rounded-lg border p-4 space-y-3 ${done ? 'border-green-300 dark:border-green-800 bg-green-50 dark:bg-green-950/20' : 'border-slate-200 dark:border-slate-800'}`}>
      <div className="flex items-center gap-3">
        <span className={`h-7 w-7 rounded-full flex items-center justify-center text-sm font-bold ${done ? 'bg-green-500 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'}`}>
          {done ? <Check className="h-4 w-4" /> : stepNumber}
        </span>
        <div>
          <p className="font-medium text-sm">{label}</p>
          <p className="text-xs text-slate-500">{description}</p>
        </div>
      </div>
      <p className="text-xs text-slate-400 bg-slate-100 dark:bg-slate-800 rounded px-3 py-2">{guideText}</p>
      {!done && (
        <label className="inline-flex items-center gap-2 cursor-pointer rounded-md bg-indigo-500 hover:bg-indigo-600 text-white text-sm px-4 py-2">
          Take Photo
          <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={handleChange} />
        </label>
      )}
    </div>
  )
}
```

- [ ] **Write CaptureFlow.tsx**

```tsx
// components/grade/CaptureFlow.tsx
'use client'

import { useState } from 'react'
import { CaptureStep } from './CaptureStep'
import { Button } from '@/components/ui/button'

const STEPS = [
  {
    label: 'Front — flat lighting',
    description: 'Card face-up, even overhead light, no shadows.',
    guideText: 'Place the card on a dark background. Hold camera directly above, parallel to the card. Avoid harsh shadows or glare.',
  },
  {
    label: 'Back — flat lighting',
    description: 'Card face-down, same even lighting.',
    guideText: 'Flip the card over. Same setup as the front shot.',
  },
  {
    label: 'Corner crops (all 4)',
    description: 'Tight close-up of each corner.',
    guideText: 'Get close enough that each corner fills most of the frame. Take all four: top-left, top-right, bottom-left, bottom-right. You can submit as one photo if all four corners are visible.',
  },
  {
    label: 'Raking light — surface check',
    description: 'Front of card with flashlight at 45°.',
    guideText: 'Hold your phone flashlight at a 45° angle to the card surface. This reveals scratches and haze invisible under flat light. Critical for accurate surface assessment.',
  },
]

interface Props {
  onComplete: (imageUrls: string[]) => void
}

export function CaptureFlow({ onComplete }: Props) {
  const [files, setFiles] = useState<(File | null)[]>(Array(STEPS.length).fill(null))

  function handleCapture(index: number, file: File) {
    setFiles((prev) => {
      const next = [...prev]
      next[index] = file
      return next
    })
  }

  const completedCount = files.filter(Boolean).length
  const allDone = completedCount === STEPS.length

  async function handleSubmit() {
    const urls: string[] = []
    for (const file of files) {
      if (!file) continue
      // Convert File to object URL for display; the API route will handle upload
      urls.push(URL.createObjectURL(file))
    }
    onComplete(urls)
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">
        Complete all {STEPS.length} photo steps for the most accurate grading prediction.
      </p>
      <div className="space-y-3">
        {STEPS.map((step, i) => (
          <CaptureStep
            key={step.label}
            stepNumber={i + 1}
            label={step.label}
            description={step.description}
            guideText={step.guideText}
            done={!!files[i]}
            onCapture={(file) => handleCapture(i, file)}
          />
        ))}
      </div>
      {completedCount > 0 && (
        <Button onClick={handleSubmit} disabled={!allDone}>
          {allDone ? 'Continue to Confirmation' : `${completedCount}/${STEPS.length} photos captured`}
        </Button>
      )}
    </div>
  )
}
```

- [ ] **Commit**

```bash
git add components/grade/CardConfirmation.tsx components/grade/CaptureFlow.tsx components/grade/CaptureStep.tsx
git commit -m "feat: add CardConfirmation, CaptureFlow, and CaptureStep components"
```

---

## Task 19: AnalysisLoader

**Files:** `components/grade/AnalysisLoader.tsx`

Polls `/api/grade/analyses/[id]` every 3 seconds until status is `complete` or `error`.

- [ ] **Write AnalysisLoader.tsx**

```tsx
// components/grade/AnalysisLoader.tsx
'use client'

import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import type { GradeAnalysisRow } from '@/lib/grade/types'

const STEPS = [
  'Scoring photo quality…',
  'Identifying card…',
  'Measuring centering…',
  'Retrieving reference images…',
  'Analyzing corners, edges, surface…',
  'Computing grade distribution…',
  'Fetching graded comps…',
  'Calculating expected value…',
  'Finalizing analysis…',
]

interface Props {
  analysisId: string
  onComplete: (result: GradeAnalysisRow) => void
}

export function AnalysisLoader({ analysisId, onComplete }: Props) {
  const [stepIndex, setStepIndex] = useState(0)

  useEffect(() => {
    // Advance displayed step every 4 seconds for visual progress
    const stepInterval = setInterval(() => {
      setStepIndex((i) => Math.min(i + 1, STEPS.length - 1))
    }, 4000)

    // Poll for completion every 3 seconds
    const pollInterval = setInterval(async () => {
      const res = await fetch(`/api/grade/analyses/${analysisId}`)
      if (!res.ok) return
      const row = (await res.json()) as GradeAnalysisRow
      if (row.status === 'complete' || row.status === 'error') {
        clearInterval(pollInterval)
        clearInterval(stepInterval)
        onComplete(row)
      }
    }, 3000)

    return () => {
      clearInterval(stepInterval)
      clearInterval(pollInterval)
    }
  }, [analysisId, onComplete])

  return (
    <div className="flex flex-col items-center justify-center py-20 space-y-6">
      <Loader2 className="h-10 w-10 animate-spin text-indigo-500" />
      <div className="text-center space-y-1">
        <p className="font-medium">{STEPS[stepIndex]}</p>
        <p className="text-sm text-slate-400">This takes 20–40 seconds</p>
      </div>
      <div className="flex gap-1">
        {STEPS.map((_, i) => (
          <div
            key={i}
            className={`h-1.5 w-6 rounded-full transition-colors ${i <= stepIndex ? 'bg-indigo-500' : 'bg-slate-200 dark:bg-slate-700'}`}
          />
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Commit**

```bash
git add components/grade/AnalysisLoader.tsx
git commit -m "feat: add AnalysisLoader with polling and step progress indicator"
```

---

## Task 20: Analysis Output Components

**Files:** `components/grade/AttributeBreakdown.tsx`, `components/grade/GradeDistribution.tsx`, `components/grade/EvTable.tsx`, `components/grade/Recommendation.tsx`, `components/grade/CaveatList.tsx`

- [ ] **Write AttributeBreakdown.tsx**

```tsx
// components/grade/AttributeBreakdown.tsx
import type { GradeAnalysisRow } from '@/lib/grade/types'

const CONFIDENCE_COLOR = {
  high: 'text-green-600 dark:text-green-400',
  medium: 'text-amber-600 dark:text-amber-400',
  low: 'text-red-600 dark:text-red-400',
}

interface Props {
  result: GradeAnalysisRow
}

export function AttributeBreakdown({ result }: Props) {
  const attrs = result.attribute_details as Array<{
    attribute: string
    assessment: string
    confidence: string
    notes: string
  }>

  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Photo Analysis</h3>
      </div>
      <div className="divide-y divide-slate-100 dark:divide-slate-800">
        <div className="px-5 py-3 grid grid-cols-3 gap-4">
          <div>
            <p className="text-xs text-slate-400 mb-1">Centering</p>
            <p className="font-mono font-semibold">
              {result.centering_lr ?? '—'}/{100 - (result.centering_lr ?? 50)} L-R
            </p>
            <p className="font-mono text-sm text-slate-500">
              {result.centering_tb ?? '—'}/{100 - (result.centering_tb ?? 50)} T-B
            </p>
            <span className={`text-xs font-medium ${result.centering_eligible ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
              {result.centering_eligible ? 'PSA 10 eligible ✓' : 'Not PSA 10 eligible'}
            </span>
          </div>
        </div>
        {attrs.map((attr) => (
          <div key={attr.attribute} className="px-5 py-3">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs text-slate-400 mb-0.5 capitalize">{attr.attribute}</p>
                <p className="font-medium capitalize">{attr.assessment}</p>
              </div>
              <span className={`text-xs font-medium capitalize ${CONFIDENCE_COLOR[attr.confidence as keyof typeof CONFIDENCE_COLOR] ?? ''}`}>
                {attr.confidence} confidence
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">{attr.notes}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Write GradeDistribution.tsx**

```tsx
// components/grade/GradeDistribution.tsx
import type { GradedComps } from '@/lib/grade/types'

const GRADE_COLORS = [
  'bg-green-500',
  'bg-lime-400',
  'bg-amber-400',
  'bg-red-400',
]

interface Props {
  distribution: Record<string, number>
  comps: GradedComps
}

export function GradeDistributionChart({ distribution, comps }: Props) {
  const GRADES = [10, 9, 8, 7] as const

  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Grade Distribution</h3>
      </div>
      <div className="px-5 py-4 space-y-3">
        {GRADES.map((grade, i) => {
          const prob = (distribution[grade] ?? 0) * 100
          const comp = (comps as Record<number, number | undefined>)[grade]
          return (
            <div key={grade} className="flex items-center gap-3">
              <span className="w-14 text-sm font-semibold text-right">PSA {grade}</span>
              <div className="flex-1 bg-slate-100 dark:bg-slate-800 rounded-full h-4 overflow-hidden">
                <div
                  className={`h-full rounded-full ${GRADE_COLORS[i]}`}
                  style={{ width: `${Math.max(prob, 1)}%` }}
                />
              </div>
              <span className="w-10 text-sm font-mono text-right">{prob.toFixed(0)}%</span>
              <span className="w-20 text-sm text-slate-400 text-right">
                {comp !== undefined ? `$${comp.toLocaleString()}` : '—'}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
```

- [ ] **Write EvTable.tsx**

```tsx
// components/grade/EvTable.tsx
import { cn } from '@/lib/utils'
import type { GradeAnalysisRow } from '@/lib/grade/types'

interface Props {
  result: GradeAnalysisRow
}

interface TierRow {
  label: string
  fee: number
  turnaround: string
  ev: number | null
  ep: number | null
}

export function EvTable({ result }: Props) {
  const tiers: TierRow[] = [
    { label: 'Regular', fee: 37, turnaround: '~45 days', ev: result.ev_regular ?? null, ep: result.ep_regular ?? null },
    { label: 'Express', fee: 162, turnaround: '~5 days', ev: result.ev_express ?? null, ep: result.ep_express ?? null },
    { label: 'Super Express', fee: 512, turnaround: '~2 days', ev: result.ev_super_express ?? null, ep: result.ep_super_express ?? null },
  ]

  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Expected Value by Grading Tier</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 dark:border-slate-800">
              <th className="px-5 py-3 text-left font-medium text-slate-500">Tier</th>
              <th className="px-5 py-3 text-right font-medium text-slate-500">Cost</th>
              <th className="px-5 py-3 text-right font-medium text-slate-500">EV Graded</th>
              <th className="px-5 py-3 text-right font-medium text-slate-500">Exp. Profit</th>
              <th className="px-5 py-3 text-left font-medium text-slate-500">Turnaround</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {tiers.map((tier) => {
              const profitable = tier.ep !== null && tier.ep > 0
              return (
                <tr key={tier.label}>
                  <td className="px-5 py-3 font-medium">{tier.label}</td>
                  <td className="px-5 py-3 text-right font-mono">${(result.raw_price ?? 0) + tier.fee}</td>
                  <td className="px-5 py-3 text-right font-mono">
                    {tier.ev !== null ? `$${tier.ev.toFixed(0)}` : '—'}
                  </td>
                  <td className={cn('px-5 py-3 text-right font-mono font-semibold', profitable ? 'text-green-600 dark:text-green-400' : 'text-red-500')}>
                    {tier.ep !== null ? `${profitable ? '+' : ''}$${tier.ep.toFixed(0)}` : '—'}
                  </td>
                  <td className="px-5 py-3 text-slate-500">{tier.turnaround}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {result.break_even_grade && (
        <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800 text-sm text-slate-500">
          Break-even: PSA {result.break_even_grade} or above —{' '}
          <span className="font-medium text-slate-700 dark:text-slate-300">
            {((result.break_even_prob ?? 0) * 100).toFixed(0)}% probability
          </span>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Write Recommendation.tsx**

```tsx
// components/grade/Recommendation.tsx
import { cn } from '@/lib/utils'
import type { GradeAnalysisRow } from '@/lib/grade/types'

const CONFIG = {
  grade: {
    label: 'GRADE IT',
    color: 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300 border-green-300 dark:border-green-800',
  },
  uncertain: {
    label: 'UNCERTAIN',
    color: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border-amber-300 dark:border-amber-800',
  },
  skip: {
    label: 'SKIP',
    color: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300 border-red-300 dark:border-red-800',
  },
}

interface Props {
  result: GradeAnalysisRow
}

export function Recommendation({ result }: Props) {
  if (!result.recommendation) return null
  const cfg = CONFIG[result.recommendation]
  const prob = result.break_even_prob ? ((result.break_even_prob) * 100).toFixed(0) : null
  const grade = result.break_even_grade

  const rationale =
    result.recommendation === 'grade'
      ? `Profitable at PSA ${grade} or above — ${prob}% probability`
      : result.recommendation === 'uncertain'
      ? `Grading may be profitable but outcome is uncertain — ${prob}% break-even probability`
      : 'Expected profit is negative at this card price and grading cost'

  return (
    <div className={cn('rounded-lg border px-6 py-4 flex items-center gap-4', cfg.color)}>
      <span className="text-lg font-bold tracking-wide">{cfg.label}</span>
      <span className="text-sm">{rationale}</span>
    </div>
  )
}
```

- [ ] **Write CaveatList.tsx**

```tsx
// components/grade/CaveatList.tsx
import { Info } from 'lucide-react'

interface Props {
  caveats: string[]
}

export function CaveatList({ caveats }: Props) {
  if (!caveats.length) return null

  return (
    <div className="space-y-2">
      {caveats.map((caveat, i) => (
        <div key={i} className="flex items-start gap-2 text-sm text-slate-500">
          <Info className="h-4 w-4 mt-0.5 shrink-0 text-slate-400" />
          <p>{caveat}</p>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Commit**

```bash
git add components/grade/AttributeBreakdown.tsx components/grade/GradeDistribution.tsx components/grade/EvTable.tsx components/grade/Recommendation.tsx components/grade/CaveatList.tsx
git commit -m "feat: add analysis output components (breakdown, distribution chart, EV table, recommendation)"
```

---

## Task 21: AnalysisHistory + Nav Update

**Files:** `components/grade/AnalysisHistory.tsx`, `components/layout/AppNav.tsx`

- [ ] **Write AnalysisHistory.tsx**

```tsx
// components/grade/AnalysisHistory.tsx
'use client'

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

interface HistoryRow {
  id: string
  card_key: string
  mode: string
  recommendation: string | null
  reliability_score: string | null
  raw_price: number | null
  ep_regular: number | null
  created_at: string
}

const REC_STYLE = {
  grade: 'text-green-600 dark:text-green-400',
  uncertain: 'text-amber-600 dark:text-amber-400',
  skip: 'text-red-500',
}

export function AnalysisHistory() {
  const [rows, setRows] = useState<HistoryRow[]>([])

  useEffect(() => {
    fetch('/api/grade/history')
      .then((r) => r.json())
      .then((data) => setRows(data as HistoryRow[]))
      .catch(() => {})
  }, [])

  if (!rows.length) return null

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">Recent Analyses</h3>
      <div className="space-y-2">
        {rows.map((row) => (
          <div
            key={row.id}
            className="flex items-center justify-between rounded-lg border border-slate-200 dark:border-slate-800 px-4 py-3"
          >
            <div>
              <p className="text-sm font-medium capitalize">
                {row.card_key.replace(/-/g, ' ')}
              </p>
              <p className="text-xs text-slate-400">
                {new Date(row.created_at).toLocaleDateString()} · {row.mode === 'ebay' ? 'eBay' : 'My Card'}
                {row.raw_price ? ` · $${row.raw_price}` : ''}
              </p>
            </div>
            <div className="text-right">
              {row.recommendation && (
                <p className={cn('text-xs font-semibold uppercase', REC_STYLE[row.recommendation as keyof typeof REC_STYLE])}>
                  {row.recommendation === 'grade' ? 'Grade It' : row.recommendation === 'uncertain' ? 'Uncertain' : 'Skip'}
                </p>
              )}
              {row.ep_regular !== null && (
                <p className={cn('text-xs font-mono', (row.ep_regular ?? 0) > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500')}>
                  {(row.ep_regular ?? 0) > 0 ? '+' : ''}${row.ep_regular?.toFixed(0)}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Add Grade to AppNav**

In `components/layout/AppNav.tsx`, find the `navLinks` array and add the Grade entry between Deals and Portfolio:

```typescript
const navLinks = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/deals', label: 'Deals' },
  { href: '/grade', label: 'Grade' },       // ADD THIS LINE
  { href: '/portfolio', label: 'Portfolio' },
  { href: '/intelligence', label: 'Intelligence' },
  { href: '/performance', label: 'Performance' },
]
```

- [ ] **Commit**

```bash
git add components/grade/AnalysisHistory.tsx components/layout/AppNav.tsx
git commit -m "feat: add AnalysisHistory component and Grade nav link"
```

---

## Task 22: Environment Variables + Python Service Startup

**Files:** `.env.local`, `services/cv/README.md` (instructions only)

- [ ] **Add to .env.local**

```bash
# Anthropic (Claude Vision)
ANTHROPIC_API_KEY=

# CV Microservice
CV_SERVICE_URL=http://localhost:8001

# PSA Grading Costs (update when PSA changes fees)
PSA_REGULAR_FEE=25
PSA_EXPRESS_FEE=150
PSA_SUPER_EXPRESS_FEE=500
PSA_SHIPPING_COST=12
PSA_REGULAR_DAYS=45
PSA_EXPRESS_DAYS=5
PSA_SUPER_EXPRESS_DAYS=2
```

- [ ] **Start the Python CV microservice in a separate terminal**

```bash
cd services/cv
pip install -r requirements.txt
uvicorn main:app --port 8001 --reload
```

Expected: `INFO: Uvicorn running on http://0.0.0.0:8001`

- [ ] **Verify CV health endpoint**

```bash
curl http://localhost:8001/health
```

Expected: `{"status":"ok"}`

- [ ] **Start Next.js dev server**

```bash
npm run dev
```

- [ ] **Run the full test suite**

```bash
npx vitest run
```

Expected: all tests pass.

- [ ] **Commit**

```bash
git add .env.local
git commit -m "feat: add env vars for Anthropic API, CV service, and PSA grading costs"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Task |
|---|---|
| Two modes: eBay URL + guided capture | Tasks 17, 18 |
| Multi-shot capture flow (front/back/corners/raking) | Task 18 (CaptureFlow + CaptureStep) |
| Reliability badge per photo + session banner | Tasks 6, 17 |
| Card identification via vision + user confirmation | Tasks 9, 18 |
| Classical CV centering (Python microservice) | Tasks 7, 8 |
| Reference image retrieval from eBay | Task 5 |
| Market grade distribution prior (Bayesian) | Tasks 4, 11 |
| Claude Vision attribute analysis vs reference images | Task 10 |
| EV / EP / break-even / annualized return | Tasks 12, 13 |
| Grade distribution bar chart | Task 20 |
| EV table across 3 grading tiers | Task 20 |
| GRADE IT / UNCERTAIN / SKIP recommendation pill | Task 20 |
| Caveats (surface confidence, low references) | Task 14 (pipeline) + Task 20 |
| Analysis history | Task 21 |
| Grade nav link | Task 21 |
| DB schema (3 tables) | Task 2 |
| Grading cost via env vars | Task 22 |

All spec requirements covered. No gaps found.
