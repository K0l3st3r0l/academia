-- Test accounts live alongside real students in a real course (so they can join its
-- rooms and get its content) but are not in Anahuac: sync must never withdraw them,
-- teachers' rosters hide them and their answers don't move question difficulty.
ALTER TABLE local_students
  ADD COLUMN IF NOT EXISTS is_test BOOLEAN NOT NULL DEFAULT false;
