-- Free-text character name: the first one is free, changing it costs tokens, and an
-- admin reviews every name (pending until approved; a rejected name is replaced for free).
ALTER TABLE characters
  ADD COLUMN IF NOT EXISTS name TEXT,
  ADD COLUMN IF NOT EXISTS name_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (name_status IN ('pending', 'approved', 'rejected')),
  ADD COLUMN IF NOT EXISTS name_set_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS name_reviewed_by UUID REFERENCES local_users(id),
  ADD COLUMN IF NOT EXISTS name_reviewed_at TIMESTAMPTZ;

-- Catalog items a student bought. Free items are never stored: owning them is implicit.
CREATE TABLE IF NOT EXISTS student_items (
  student_id UUID NOT NULL REFERENCES local_students(id),
  item_id TEXT NOT NULL,
  price INTEGER NOT NULL,
  acquired_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (student_id, item_id)
);
