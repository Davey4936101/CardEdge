-- supabase/migrations/20260607_grade_phase1.sql

-- New columns on grade_analyses
ALTER TABLE grade_analyses
  ADD COLUMN IF NOT EXISTS card_type text,
  ADD COLUMN IF NOT EXISTS image_manifest jsonb,
  ADD COLUMN IF NOT EXISTS centering_front_lr float,
  ADD COLUMN IF NOT EXISTS centering_front_tb float,
  ADD COLUMN IF NOT EXISTS centering_front_eligible boolean,
  ADD COLUMN IF NOT EXISTS centering_back_lr float,
  ADD COLUMN IF NOT EXISTS centering_back_tb float,
  ADD COLUMN IF NOT EXISTS centering_back_eligible boolean,
  ADD COLUMN IF NOT EXISTS corner_tl_assessment text,
  ADD COLUMN IF NOT EXISTS corner_tr_assessment text,
  ADD COLUMN IF NOT EXISTS corner_bl_assessment text,
  ADD COLUMN IF NOT EXISTS corner_br_assessment text,
  ADD COLUMN IF NOT EXISTS corner_worst text,
  ADD COLUMN IF NOT EXISTS subgrade_centering float,
  ADD COLUMN IF NOT EXISTS subgrade_corners float,
  ADD COLUMN IF NOT EXISTS subgrade_edges float,
  ADD COLUMN IF NOT EXISTS subgrade_surface float,
  ADD COLUMN IF NOT EXISTS continuous_score float,
  ADD COLUMN IF NOT EXISTS confidence_band float,
  ADD COLUMN IF NOT EXISTS pop_gem_rate float,
  ADD COLUMN IF NOT EXISTS pop_count_10 integer,
  ADD COLUMN IF NOT EXISTS pop_count_9 integer,
  ADD COLUMN IF NOT EXISTS pop_count_8 integer,
  ADD COLUMN IF NOT EXISTS pop_count_7 integer,
  ADD COLUMN IF NOT EXISTS pop_total integer,
  ADD COLUMN IF NOT EXISTS actual_psa_grade float,
  ADD COLUMN IF NOT EXISTS outcome_logged_at timestamptz;

-- Population snapshots table
CREATE TABLE IF NOT EXISTS pop_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  card_key text NOT NULL,
  snapshot_date date NOT NULL,
  count_10 integer NOT NULL DEFAULT 0,
  count_9 integer NOT NULL DEFAULT 0,
  count_8 integer NOT NULL DEFAULT 0,
  count_7 integer NOT NULL DEFAULT 0,
  total integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (card_key, snapshot_date)
);

CREATE INDEX IF NOT EXISTS pop_snapshots_card_key_idx ON pop_snapshots (card_key, snapshot_date DESC);
