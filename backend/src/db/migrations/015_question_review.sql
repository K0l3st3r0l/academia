-- Review workflow for the question bank (etapa 3). Drafts written with AI enter the game only
-- after a teacher or UTP approves them; questions already in use stay approved.
ALTER TABLE questions
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS clue TEXT,             -- hint before answering (Modo Libre powers)
  ADD COLUMN IF NOT EXISTS option_notes JSONB,    -- wrong option -> the mistake that leads to it
  ADD COLUMN IF NOT EXISTS source TEXT,           -- 'manual', 'import' or 'ia:<model>'
  ADD COLUMN IF NOT EXISTS check_note TEXT,       -- automatic checks and the second model's verdict
  ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES local_users(id),
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS review_note TEXT;

DO $$ BEGIN
  ALTER TABLE questions ADD CONSTRAINT questions_status_check CHECK (status IN ('draft', 'approved', 'rejected'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_questions_status ON questions (status, subject, grade_level, oa_code);

-- Pilot bank fixes (wiki: plan-modo-libre, «Etiquetas del banco»).
UPDATE questions SET oa_code = 'OA1', updated_at = NOW()
WHERE subject = 'matematica' AND grade_level = '5b' AND oa_code = 'OA2'
  AND text = '¿Cuál número es menor: 128.450 o 128.045?';

UPDATE questions SET status = 'rejected', active = false, reviewed_at = NOW(), updated_at = NOW(),
  review_note = 'Fuera del currículo de 5°: la división con divisor de dos dígitos es de 6° básico'
WHERE subject = 'matematica' AND grade_level = '5b' AND text = '¿Cuánto es 144 ÷ 12?' AND status = 'approved';

UPDATE questions SET status = 'rejected', active = false, reviewed_at = NOW(), updated_at = NOW(),
  review_note = 'OA de producción oral o escrita: no se evalúa con alternativas'
WHERE subject = 'lenguaje' AND grade_level = '5b' AND oa_code IN ('OA13', 'OA16', 'OA24', 'OA25') AND status = 'approved';

UPDATE questions SET status = 'rejected', active = false, reviewed_at = NOW(), updated_at = NOW(),
  review_note = 'Ejemplo inapropiado para niños («cerveza»)'
WHERE subject = 'lenguaje' AND grade_level = '5b' AND text = '¿Cuál palabra está escrita con la letra correcta?'
  AND correct = 'Cerveza' AND status = 'approved';
