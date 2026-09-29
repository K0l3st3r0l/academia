-- Students from 3° básico up get their own account: institutional email plus a
-- password they create through an emailed one-time link (same flow as Anahuac staff).
ALTER TABLE local_students
  ADD COLUMN IF NOT EXISTS institutional_email TEXT,
  ADD COLUMN IF NOT EXISTS password_hash TEXT,
  ADD COLUMN IF NOT EXISTS password_set_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_local_students_institutional_email
  ON local_students (lower(institutional_email));

-- Only the SHA-256 of each token is stored; the token itself travels only in the email.
CREATE TABLE IF NOT EXISTS student_password_tokens (
  id SERIAL PRIMARY KEY,
  student_id UUID NOT NULL REFERENCES local_students(id),
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_student_password_tokens_student
  ON student_password_tokens (student_id);
