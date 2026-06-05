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
