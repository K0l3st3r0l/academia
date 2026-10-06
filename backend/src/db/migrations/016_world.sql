-- Modo Libre, etapa 5: levels on the world map (layout in shared/world/<grade>.json).
-- One attempt = one play of a level: the questions picked for that student, in order, with
-- options already shuffled. The correct answer never leaves the server.
CREATE TABLE IF NOT EXISTS practice_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES local_students(id),
  subject TEXT NOT NULL,
  grade_level TEXT NOT NULL,
  level_key TEXT NOT NULL,            -- an OA code ('OA3') or a unit's challenge ('desafio-1')
  questions JSONB NOT NULL,           -- [{ id, options }]
  answered INTEGER NOT NULL DEFAULT 0,
  correct INTEGER NOT NULL DEFAULT 0,
  tokens INTEGER NOT NULL DEFAULT 0,
  clue_used BOOLEAN NOT NULL DEFAULT false,
  stars INTEGER,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_practice_attempts_student ON practice_attempts (student_id, started_at DESC);

-- Best result per level; the map reads only this.
CREATE TABLE IF NOT EXISTS student_level_progress (
  student_id UUID NOT NULL REFERENCES local_students(id),
  subject TEXT NOT NULL,
  grade_level TEXT NOT NULL,
  level_key TEXT NOT NULL,
  stars INTEGER NOT NULL,
  plays INTEGER NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (student_id, subject, grade_level, level_key)
);

-- Home answers go to the same table as classroom ones, so ratings, mastery and the pet's days
-- of play count both. attempt_id marks them as home practice (session_id stays NULL).
ALTER TABLE student_answers
  ADD COLUMN IF NOT EXISTS attempt_id UUID REFERENCES practice_attempts(id);
