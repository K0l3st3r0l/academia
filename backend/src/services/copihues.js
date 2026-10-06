// Copihues: recognition, not effort (tokens are for effort). Amounts per achievement in the world;
// a teacher gives 1 to 3 at a time, always with a reason.
const ACHIEVEMENTS = {
  level_perfect: 1,  // first time with 3 stars in a level
  challenge: 3,      // first time an island's challenge is won
  streak: 1,         // every 3 days in a row finishing levels
};
const STREAK_DAYS = 3;
const MAX_TEACHER_AWARD = 3;

// Inside the caller's transaction. With a source_key the award happens once; returns the new
// ledger row, or null when that achievement was already paid.
async function giveCopihues(client, { studentId, amount, reason, detail = null, sourceKey = null, awardedBy = null }) {
  const { rows } = await client.query(
    `INSERT INTO copihue_ledger (student_id, amount, reason, detail, source_key, awarded_by)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (student_id, source_key) WHERE source_key IS NOT NULL DO NOTHING
     RETURNING id, amount, reason, detail, created_at`,
    [studentId, amount, reason, detail, sourceKey, awardedBy]
  );
  if (!rows.length) return null;
  await client.query('UPDATE local_students SET copihues_balance = copihues_balance + $2 WHERE id = $1', [studentId, amount]);
  return rows[0];
}

// Consecutive days (Chile time) up to today with at least one finished level. Days are distinct
// and newest first, so they match today - n exactly while consecutive; after a gap, never again.
async function currentStreak(client, studentId) {
  const { rows: [row] } = await client.query(
    `WITH today AS (SELECT (NOW() AT TIME ZONE 'America/Santiago')::date AS d),
     days AS (
       SELECT DISTINCT (finished_at AT TIME ZONE 'America/Santiago')::date AS day
       FROM practice_attempts WHERE student_id = $1 AND finished_at IS NOT NULL
     )
     SELECT to_char((SELECT d FROM today), 'YYYY-MM-DD') AS today,
            (SELECT COUNT(*) FROM (SELECT day, ROW_NUMBER() OVER (ORDER BY day DESC) - 1 AS n FROM days) x
             WHERE day = (SELECT d FROM today) - n::int)::int AS streak`,
    [studentId]
  );
  return row;
}

// What a finished level earns, once each: a first perfect level, a first challenge won, and
// every third day in a row. Call after the attempt is marked finished.
async function levelAchievements(client, { studentId, subject, gradeLevel, levelKey, label, isChallenge, stars, previousStars }) {
  const where = `${subject}:${gradeLevel}:${levelKey}`;
  const earned = [];
  const add = row => row && earned.push(row);
  if (isChallenge && stars > 0 && previousStars === 0) {
    add(await giveCopihues(client, { studentId, amount: ACHIEVEMENTS.challenge, reason: 'challenge', detail: label, sourceKey: `challenge:${where}` }));
  }
  if (stars === 3) {
    add(await giveCopihues(client, { studentId, amount: ACHIEVEMENTS.level_perfect, reason: 'level_perfect', detail: label, sourceKey: `perfect:${where}` }));
  }
  const { streak, today } = await currentStreak(client, studentId);
  if (streak > 0 && streak % STREAK_DAYS === 0) {
    add(await giveCopihues(client, { studentId, amount: ACHIEVEMENTS.streak, reason: 'streak', detail: `${streak} días seguidos`, sourceKey: `streak:${today}` }));
  }
  return earned;
}

module.exports = { giveCopihues, levelAchievements, currentStreak, ACHIEVEMENTS, STREAK_DAYS, MAX_TEACHER_AWARD };
