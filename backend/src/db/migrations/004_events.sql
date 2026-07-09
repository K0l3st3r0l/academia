-- Product analytics events

CREATE TABLE IF NOT EXISTS events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_type TEXT NOT NULL CHECK (actor_type IN ('teacher', 'student', 'system')),
  actor_id UUID,
  event_type TEXT NOT NULL,
  room_id UUID REFERENCES rooms(id),
  session_id UUID REFERENCES game_sessions(id),
  payload JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_events_event_type ON events (event_type);
CREATE INDEX IF NOT EXISTS idx_events_created_at ON events (created_at);

INSERT INTO schema_migrations (version) VALUES (4) ON CONFLICT DO NOTHING;