-- The Academy lobby (/academia/): what a student explored and the parts of its economy the
-- server owns. It spends the real balances in local_students, through token_ledger and
-- copihue_ledger; prices and rewards come from shared/academy/economia.json.
CREATE TABLE IF NOT EXISTS academy_progress (
  student_id UUID PRIMARY KEY REFERENCES local_students(id),
  state JSONB NOT NULL DEFAULT '{}',     -- sparks, flags, position, goals, settings: written by the game
  bank_balance INTEGER NOT NULL DEFAULT 0 CHECK (bank_balance >= 0),
  bank_last_week TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  intro_seen_at TIMESTAMPTZ,             -- the opening film plays in full until it is seen once
  welcome_gift_at TIMESTAMPTZ,           -- tokens to try the shop, given once when the film ends
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS academy_items (
  student_id UUID NOT NULL REFERENCES local_students(id),
  item_id TEXT NOT NULL,
  source TEXT NOT NULL,                  -- 'shop' or the id of the chest that gave it
  acquired_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (student_id, item_id)
);

CREATE TABLE IF NOT EXISTS academy_chests (
  student_id UUID NOT NULL REFERENCES local_students(id),
  chest_id TEXT NOT NULL,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (student_id, chest_id)
);

-- Interest is paid into the vault, not the wallet, so it never touches token_ledger.
CREATE TABLE IF NOT EXISTS academy_bank_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES local_students(id),
  amount INTEGER NOT NULL,
  kind TEXT NOT NULL,                    -- 'deposit', 'withdraw', 'interest'
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_academy_bank_ledger_student ON academy_bank_ledger (student_id, created_at DESC);

-- Lobby practice pays a few tokens a day; counting today's rewards reads the ledger by reason.
CREATE INDEX IF NOT EXISTS idx_token_ledger_student_reason ON token_ledger (student_id, reason, created_at);
