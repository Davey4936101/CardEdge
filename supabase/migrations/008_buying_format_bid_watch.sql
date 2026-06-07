-- Add buying_format and sport to alerts
alter table alerts add column if not exists buying_format text;
alter table alerts add column if not exists sport text;

-- Bid Watch: user-tracked auction listings
create table if not exists bid_watches (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null,
  ebay_item_id    text not null,
  card_title      text not null,
  image_url       text,
  listing_url     text not null,
  current_bid     numeric(10,2),
  bin_price       numeric(10,2),
  fair_value      numeric(10,2),
  end_time        timestamptz,
  buying_format   text not null default 'auction',
  is_ended        boolean not null default false,
  last_refreshed  timestamptz,
  created_at      timestamptz not null default now(),
  unique(user_id, ebay_item_id)
);

create index if not exists idx_bid_watches_user
  on bid_watches (user_id, is_ended, end_time);
