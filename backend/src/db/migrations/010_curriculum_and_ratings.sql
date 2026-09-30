-- Official learning objectives (OA) per subject and grade, synced at startup
-- from shared/curriculum/*.json. Questions point to them by (subject, grade_level, oa_code).
CREATE TABLE IF NOT EXISTS curriculum_oas (
  id SERIAL PRIMARY KEY,
  subject TEXT NOT NULL,
  grade_level TEXT NOT NULL,
  code TEXT NOT NULL,
  number INTEGER NOT NULL,
  eje TEXT NOT NULL,
  label TEXT NOT NULL,
  text TEXT NOT NULL,
  quiz BOOLEAN NOT NULL DEFAULT true,
  note TEXT,
  unit INTEGER,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (subject, grade_level, code)
);

-- Measured difficulty (Elo-style, logit scale: 0 = average, positive = harder).
-- The authored easy/medium/hard label only seeds it; answers move it.
ALTER TABLE questions
  ADD COLUMN IF NOT EXISTS rating REAL,
  ADD COLUMN IF NOT EXISTS rating_answers INTEGER NOT NULL DEFAULT 0;

-- Student skill on the same scale, per subject (oa_code = '*') and per OA.
CREATE TABLE IF NOT EXISTS student_skill_ratings (
  student_id UUID NOT NULL REFERENCES local_students(id),
  subject TEXT NOT NULL,
  grade_level TEXT NOT NULL,
  oa_code TEXT NOT NULL,
  rating REAL NOT NULL DEFAULT 0,
  answers INTEGER NOT NULL DEFAULT 0,
  correct INTEGER NOT NULL DEFAULT 0,
  last_answered_at TIMESTAMPTZ,
  PRIMARY KEY (student_id, subject, grade_level, oa_code)
);

-- Answers already folded into the ratings, so a replay never counts one twice.
ALTER TABLE student_answers
  ADD COLUMN IF NOT EXISTS rated_at TIMESTAMPTZ;
