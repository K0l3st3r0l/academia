-- Unique index for question dedupe on import (subject, grade_level, text)

CREATE UNIQUE INDEX IF NOT EXISTS idx_questions_dedupe ON questions (subject, grade_level, text);

INSERT INTO schema_migrations (version) VALUES (3) ON CONFLICT DO NOTHING;