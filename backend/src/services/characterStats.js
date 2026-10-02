const pool = require('../db');

// Learning stats shown as the character's attributes. They come only from measured
// skill (student_skill_ratings), so they work as a strengths/weaknesses indicator too.
const ATTRIBUTES = [
  { key: 'fuerza', label: 'Fuerza', subject: 'matematica' },
  { key: 'energia', label: 'Energía', subject: 'lenguaje' },
  { key: 'percepcion', label: 'Percepción', subject: 'ciencias' },
  { key: 'resistencia', label: 'Resistencia', subject: 'historia' },
  { key: 'agilidad', label: 'Agilidad', subject: 'ingles' },
];
// Below this many answers the value would be noise: shown as «por descubrir».
const MIN_ANSWERS = 5;
const MIN_EJE_ANSWERS = 3;

// Logit skill to a 1–99 scale where 50 is the average student.
function toScale(rating) {
  return Math.max(1, Math.min(99, Math.round(50 + 20 * rating)));
}

async function getAttributes(studentId) {
  const { rows } = await pool.query(`
    SELECT r.subject, r.grade_level, r.oa_code, r.rating, r.answers, c.eje
    FROM student_skill_ratings r
    LEFT JOIN curriculum_oas c
      ON c.subject = r.subject AND c.grade_level = r.grade_level AND c.code = r.oa_code
    WHERE r.student_id = $1
  `, [studentId]);

  return ATTRIBUTES.map(attr => {
    const subjectRows = rows.filter(r => r.subject === attr.subject);
    const overall = subjectRows.find(r => r.oa_code === '*');
    const ejes = new Map();
    for (const r of subjectRows) {
      if (r.oa_code === '*' || !r.eje) continue;
      const e = ejes.get(r.eje) ?? { eje: r.eje, weighted: 0, answers: 0 };
      e.weighted += r.rating * r.answers;
      e.answers += r.answers;
      ejes.set(r.eje, e);
    }
    const base = overall?.rating ?? 0;
    return {
      ...attr,
      answers: overall?.answers ?? 0,
      value: (overall?.answers ?? 0) >= MIN_ANSWERS ? toScale(base) : null,
      ejes: [...ejes.values()].map(e => ({
        eje: e.eje,
        answers: e.answers,
        value: e.answers >= MIN_EJE_ANSWERS ? toScale(base + e.weighted / e.answers) : null,
      })),
    };
  });
}

module.exports = { getAttributes, ATTRIBUTES, toScale, MIN_ANSWERS };
