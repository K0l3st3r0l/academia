-- Which question each answer was for. Until now only its position in the round was
-- stored, so difficulty per question and mastery per OA could not be measured.
-- SET NULL keeps the answer history when a teacher deletes a question from the bank.
ALTER TABLE student_answers
  ADD COLUMN IF NOT EXISTS question_id UUID REFERENCES questions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_student_answers_question ON student_answers (question_id);
