-- Player events from ESPN news feed
create table if not exists player_events (
  id uuid primary key default gen_random_uuid(),
  player_name text not null,
  sport text not null, -- 'nfl' | 'nba' | 'mlb'
  event_type text not null, -- 'award' | 'trade' | 'injury' | 'milestone' | 'performance' | 'other'
  title text not null,
  summary text not null,
  sentiment text not null, -- 'bullish' | 'bearish' | 'neutral'
  severity text not null, -- 'high' | 'medium' | 'low'
  source_url text,
  event_date timestamptz not null default now(),
  expires_at timestamptz default (now() + interval '30 days'),
  created_at timestamptz not null default now(),
  unique (player_name, title)
);

create index if not exists idx_player_events_player on player_events (player_name, event_date desc);
create index if not exists idx_player_events_sport on player_events (sport, event_date desc);
create index if not exists idx_player_events_expires on player_events (expires_at);

-- Link events to specific portfolio cards for each user
create table if not exists player_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  portfolio_card_id uuid not null,
  player_event_id uuid not null references player_events (id) on delete cascade,
  is_read boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, portfolio_card_id, player_event_id)
);

create index if not exists idx_player_alerts_user on player_alerts (user_id, created_at desc);
create index if not exists idx_player_alerts_card on player_alerts (portfolio_card_id);
