-- Question bank

CREATE TABLE IF NOT EXISTS questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject TEXT NOT NULL,
  grade_level TEXT NOT NULL,
  difficulty TEXT NOT NULL DEFAULT 'medium' CHECK (difficulty IN ('easy', 'medium', 'hard')),
  text TEXT NOT NULL,
  options JSONB NOT NULL,   -- ["opción A", "opción B", "opción C", "opción D"]
  correct TEXT NOT NULL,
  hint TEXT,
  oa_code TEXT,             -- e.g. "OA3" — referencia al objetivo de aprendizaje
  active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES local_users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_questions_subject_grade ON questions (subject, grade_level);
CREATE INDEX IF NOT EXISTS idx_questions_active ON questions (active);

INSERT INTO schema_migrations (version) VALUES (2) ON CONFLICT DO NOTHING;
