create table portfolio_cards (
  id                       uuid primary key default gen_random_uuid(),
  user_id                  uuid,
  card_key                 text not null,
  player                   text not null,
  set_name                 text not null,
  year                     text,
  grade                    text,
  status                   text not null default 'raw_owned'
    check (status in ('raw_owned','submitted','graded_owned','sold')),
  source                   text not null default 'manual'
    check (source in ('manual','alert','analysis')),
  alert_id                 uuid references alerts(id) on delete set null,
  analysis_id              uuid references grade_analyses(id) on delete set null,
  raw_purchase_price       numeric(10,2) not null,
  raw_purchase_date        date not null,
  submitted_at             date,
  received_grade           integer,
  received_at              date,
  current_value_override   numeric(10,2),
  current_value_fetched    numeric(10,2),
  current_value_fetched_at timestamptz,
  sold_price               numeric(10,2),
  sold_at                  date,
  notes                    text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create index idx_portfolio_cards_user   on portfolio_cards (user_id);
create index idx_portfolio_cards_status on portfolio_cards (status);
create index idx_portfolio_cards_key    on portfolio_cards (card_key);
