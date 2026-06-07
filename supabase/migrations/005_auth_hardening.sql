-- Add user_id to grade_analyses for per-user data isolation.
-- Existing rows keep user_id = NULL and remain accessible to all authenticated users
-- until they are re-created under an authenticated session.
alter table grade_analyses
  add column if not exists user_id uuid;

create index if not exists idx_grade_analyses_user
  on grade_analyses (user_id);
