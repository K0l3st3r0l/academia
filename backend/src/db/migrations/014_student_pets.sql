-- Companion pet: one per student. It grows with the days the student plays (computed from
-- student_answers, never bought). stage_seen is the last stage the student was shown, so the
-- home page celebrates each growth once.
CREATE TABLE IF NOT EXISTS student_pets (
  student_id UUID PRIMARY KEY REFERENCES local_students(id),
  species TEXT NOT NULL,
  name TEXT NOT NULL,
  name_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (name_status IN ('pending', 'approved', 'rejected')),
  name_set_at TIMESTAMPTZ DEFAULT NOW(),
  name_reviewed_by UUID REFERENCES local_users(id),
  name_reviewed_at TIMESTAMPTZ,
  stage_seen INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_student_answers_student ON student_answers (student_id);
