-- Copihues: the recognition currency (tokens reward effort). Earned once per achievement in the
-- world, given by teachers with a reason (also for school coexistence), later for reading speed.
ALTER TABLE local_students
  ADD COLUMN IF NOT EXISTS copihues_balance INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS copihue_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES local_students(id),
  amount INTEGER NOT NULL,
  reason TEXT NOT NULL,              -- 'level_perfect', 'challenge', 'streak', 'teacher'
  detail TEXT,                       -- what it was for: the teacher's words, the level's name
  source_key TEXT,                   -- one-time achievements: the same key never pays twice
  awarded_by UUID REFERENCES local_users(id),
  seen_at TIMESTAMPTZ,               -- the student saw it (teacher awards are celebrated once)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_copihue_ledger_source ON copihue_ledger (student_id, source_key)
  WHERE source_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_copihue_ledger_student ON copihue_ledger (student_id, created_at DESC);
