-- Students withdrawn in Anahuac are kept, not deleted: their answers, token ledger
-- and character stay intact. They are only hidden from rosters and blocked from logging in.
ALTER TABLE local_students
  ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS withdrawn_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_local_students_course_active
  ON local_students (course_name) WHERE active;
