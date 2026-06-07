-- Grade price ladder cache (PSA tiers + raw)
create table if not exists grade_price_cache (
  card_key text primary key,
  raw_price numeric(10, 2),
  psa7_price numeric(10, 2),
  psa8_price numeric(10, 2),
  psa9_price numeric(10, 2),
  psa10_price numeric(10, 2),
  raw_comp_count int not null default 0,
  psa7_comp_count int not null default 0,
  psa8_comp_count int not null default 0,
  psa9_comp_count int not null default 0,
  psa10_comp_count int not null default 0,
  fetched_at timestamptz not null default now()
);
