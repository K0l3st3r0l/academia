-- An OA can belong to several units of the Programa de Estudio, and some are worked
-- all year; a single unit column could not say either.
ALTER TABLE curriculum_oas
  ADD COLUMN IF NOT EXISTS units INTEGER[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS all_year BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE curriculum_oas DROP COLUMN IF EXISTS unit;

CREATE TABLE IF NOT EXISTS curriculum_units (
  subject TEXT NOT NULL,
  grade_level TEXT NOT NULL,
  number INTEGER NOT NULL,
  title TEXT,
  PRIMARY KEY (subject, grade_level, number)
);
