-- AcademIA initial schema

CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TIMESTAMPTZ DEFAULT NOW()
);

-- Staff synced from Anahuac (teachers, admins, etc.)
CREATE TABLE IF NOT EXISTS local_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  anahuac_id INTEGER UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  first_name TEXT,
  last_name TEXT,
  roles TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Students synced from Anahuac (cached at room creation)
CREATE TABLE IF NOT EXISTS local_students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  anahuac_id INTEGER UNIQUE NOT NULL,
  rut TEXT,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  course_name TEXT,
  tokens_balance INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Game rooms
CREATE TABLE IF NOT EXISTS rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  teacher_id UUID REFERENCES local_users(id),
  course_name TEXT NOT NULL,
  subject TEXT NOT NULL DEFAULT 'general',
  status TEXT NOT NULL DEFAULT 'waiting',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  closed_at TIMESTAMPTZ
);

-- Token ledger (server-authoritative, append-only)
CREATE TABLE IF NOT EXISTS token_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES local_students(id),
  amount INTEGER NOT NULL,
  reason TEXT NOT NULL,
  room_id UUID REFERENCES rooms(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Game sessions
CREATE TABLE IF NOT EXISTS game_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID REFERENCES rooms(id),
  game_type TEXT DEFAULT 'quiz_battle',
  subject TEXT,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  summary JSONB
);

-- Student answers per question
CREATE TABLE IF NOT EXISTS student_answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES game_sessions(id),
  student_id UUID REFERENCES local_students(id),
  question_index INTEGER NOT NULL,
  answer TEXT,
  is_correct BOOLEAN,
  time_taken_ms INTEGER,
  answered_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO schema_migrations (version) VALUES (1) ON CONFLICT DO NOTHING;
