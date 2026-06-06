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
