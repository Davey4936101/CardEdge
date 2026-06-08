-- supabase/migrations/20260608_grade_phase3.sql

-- Add card identity fields to grade_dist_cache so the pop velocity cron
-- can call the PSA API without needing to reverse-engineer the card_key slug.
ALTER TABLE grade_dist_cache
  ADD COLUMN IF NOT EXISTS player      text,
  ADD COLUMN IF NOT EXISTS year_val    integer,
  ADD COLUMN IF NOT EXISTS set_name    text,
  ADD COLUMN IF NOT EXISTS card_number text;

-- Batch submission optimizer
CREATE TABLE IF NOT EXISTS submission_batches (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               uuid NOT NULL,
  batch_name            text,
  card_analysis_ids     uuid[] NOT NULL,
  total_expected_return float,
  total_cost            float,
  batch_roi             float,
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS submission_batches_user_idx
  ON submission_batches (user_id, created_at DESC);
