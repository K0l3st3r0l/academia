-- Local login for students (RUT + PIN), no Anahuac account involved

ALTER TABLE local_students
  ADD COLUMN IF NOT EXISTS pin_hash TEXT,
  ADD COLUMN IF NOT EXISTS pin_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;

INSERT INTO schema_migrations (version) VALUES (5) ON CONFLICT DO NOTHING;
