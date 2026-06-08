-- supabase/migrations/20260607_grade_phase2.sql

-- Grade potential columns on alerts
ALTER TABLE alerts
  ADD COLUMN IF NOT EXISTS grade_potential_score float,   -- P(PSA 10), 0–1
  ADD COLUMN IF NOT EXISTS ev_if_graded float,           -- expected sale value after grading
  ADD COLUMN IF NOT EXISTS grade_upside float;           -- ev_if_graded - listed_price - Regular fee

-- BGS crossover analyses table
CREATE TABLE IF NOT EXISTS bgs_crossover_analyses (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              uuid NOT NULL,
  card_key             text NOT NULL,
  input_method         text NOT NULL CHECK (input_method IN ('photo', 'manual')),
  centering_sub        numeric(3,1) NOT NULL,
  corners_sub          numeric(3,1) NOT NULL,
  edges_sub            numeric(3,1) NOT NULL,
  surface_sub          numeric(3,1) NOT NULL,
  crossover_probability float NOT NULL,
  ev_keep_bgs          float,
  ev_crossover         float,
  ev_crack_raw         float,
  recommendation       text NOT NULL CHECK (recommendation IN ('keep', 'crossover', 'crack')),
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bgs_crossover_user_idx ON bgs_crossover_analyses (user_id, created_at DESC);
