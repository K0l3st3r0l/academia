const fs = require('fs');
const path = require('path');
const pool = require('../db');
const { expectedCorrect } = require('./skillRatings');

// Same two layouts as the curriculum: local checkout or Docker with shared/ mounted at /app/shared.
const CANDIDATE_DIRS = [
  path.join(__dirname, '../../../shared/world'),
  path.join(__dirname, '../../shared/world'),
];

const LEVEL_QUESTIONS = 6;
const CHALLENGE_QUESTIONS = 8;
// With fewer approved questions a level is still being prepared: it shows, but does not block.
const MIN_QUESTIONS = 3;
// Tokens per star a play adds to the level's best result, so replaying for stars pays once.
const STAR_BONUS = { level: 5, challenge: 10 };

const layouts = new Map();
function loadLayout(gradeLevel) {
  if (!layouts.has(gradeLevel)) {
    const dir = CANDIDATE_DIRS.find(p => fs.existsSync(path.join(p, `${gradeLevel}.json`)));
    layouts.set(gradeLevel, dir ? JSON.parse(fs.readFileSync(path.join(dir, `${gradeLevel}.json`), 'utf8')) : null);
  }
  return layouts.get(gradeLevel);
}

function challengeKey(unit) {
  return `desafio-${unit}`;
}

// No mistakes: 3 stars; one: 2; at least half right: 1; less: the level is not passed yet.
function starsFor(correct, total) {
  const errors = total - correct;
  if (errors === 0) return 3;
  if (errors === 1) return 2;
  return correct * 2 >= total ? 1 : 0;
}

// Plan-modo-libre §4.2: a right answer pays more where the student is weak in that OA and
// almost nothing once it is mastered. skill is on the Elo logit scale (0 = average student).
// The rate is fixed when a level starts, so the map can show it and it does not drop mid-level.
function payFor(skill) {
  return Math.max(1, Math.round(10 * (1 - expectedCorrect(skill, 0))));
}

// The map as one student sees it: every level with its state, in path order. A level opens when
// the previous playable one has at least one star; the challenge, when all of them do.
async function getMap(studentId, gradeLevel, subject) {
  const map = loadLayout(gradeLevel)?.maps.find(m => m.subject === subject);
  if (!map) return null;

  const [{ rows: counts }, { rows: progress }, { rows: oas }, { rows: skills }] = await Promise.all([
    pool.query(
      `SELECT oa_code, COUNT(*)::int AS n FROM questions
       WHERE subject = $1 AND grade_level = $2 AND active AND status = 'approved' GROUP BY oa_code`,
      [subject, gradeLevel]
    ),
    pool.query(
      'SELECT level_key, stars FROM student_level_progress WHERE student_id = $1 AND subject = $2 AND grade_level = $3',
      [studentId, subject, gradeLevel]
    ),
    pool.query(
      'SELECT code, label, eje, units FROM curriculum_oas WHERE subject = $1 AND grade_level = $2 ORDER BY number',
      [subject, gradeLevel]
    ),
    pool.query(
      `SELECT grade_level, oa_code, rating FROM student_skill_ratings
       WHERE student_id = $1 AND subject = $2 AND (oa_code = '*' OR grade_level = $3)`,
      [studentId, subject, gradeLevel]
    ),
  ]);
  const available = new Map(counts.map(r => [r.oa_code, r.n]));
  const best = new Map(progress.map(r => [r.level_key, r.stars]));
  const labels = new Map(oas.map(o => [o.code, o.label]));
  // Skill in an OA = subject rating + that OA's offset, as in skillRatings.rateAnswer.
  const subjectSkill = skills.find(r => r.oa_code === '*')?.rating ?? 0;
  const oaSkill = new Map(skills.filter(r => r.oa_code !== '*').map(r => [r.oa_code, r.rating]));
  const payIn = code => payFor(subjectSkill + (oaSkill.get(code) ?? 0));

  let open = true;
  const islands = map.islands.map(island => {
    const levels = island.levels.map((code, i) => {
      const playable = (available.get(code) ?? 0) >= MIN_QUESTIONS;
      const stars = best.get(code) ?? 0;
      let state = 'preparing';
      if (playable) {
        state = !open ? 'locked' : stars > 0 ? 'done' : 'open';
        open = open && stars > 0;
      }
      return { key: code, oa: code, label: labels.get(code) ?? code, at: island.nodes[i], stars, state, pay: payIn(code) };
    });
    const oaCodes = levels.filter(l => l.state !== 'preparing').map(l => l.oa);
    const key = challengeKey(island.unit);
    const stars = best.get(key) ?? 0;
    let state = 'preparing';
    if (oaCodes.length >= MIN_QUESTIONS) {
      state = !open ? 'locked' : stars > 0 ? 'done' : 'open';
      open = open && stars > 0;
    }
    return {
      unit: island.unit,
      name: island.name,
      image: island.image,
      width: island.width,
      height: island.height,
      entry: island.entry,
      sparkles: island.sparkles ?? [],
      levels,
      challenge: {
        key, label: island.boss.name, at: island.boss.at, oaCodes, stars, state,
        pay: oaCodes.length ? Math.round(oaCodes.reduce((sum, c) => sum + payIn(c), 0) / oaCodes.length) : 0,
      },
    };
  });

  const all = islands.flatMap(i => [...i.levels, i.challenge]);
  const playable = all.filter(l => l.state !== 'preparing');
  const current = playable.find(l => l.state === 'open') ?? [...playable].reverse().find(l => l.state === 'done') ?? null;

  const drawn = new Set(map.islands.map(i => i.unit));
  const comingUnits = [...new Set(oas.flatMap(o => o.units ?? []))]
    .filter(u => !drawn.has(u))
    .sort((a, b) => a - b)
    .map(unit => ({ unit, ejes: [...new Set(oas.filter(o => o.units?.includes(unit)).map(o => o.eje))] }));

  return {
    subject,
    gradeLevel,
    islands,
    comingUnits,
    current: current?.key ?? null,
    stars: { earned: playable.reduce((sum, l) => sum + l.stars, 0), max: playable.length * 3 },
  };
}

function findLevel(worldMap, key) {
  for (const island of worldMap.islands) {
    const level = island.levels.find(l => l.key === key);
    if (level) return { ...level, isChallenge: false, oaCodes: [level.oa], unit: island.unit };
    if (island.challenge.key === key) return { ...island.challenge, isChallenge: true, unit: island.unit };
  }
  return null;
}

module.exports = {
  getMap,
  findLevel,
  starsFor,
  payFor,
  challengeKey,
  LEVEL_QUESTIONS,
  CHALLENGE_QUESTIONS,
  MIN_QUESTIONS,
  STAR_BONUS,
};
