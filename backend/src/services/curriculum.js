const fs = require('fs');
const path = require('path');
const pool = require('../db');

// Same two layouts as characterCatalog: local checkout or Docker with shared/ mounted at /app/shared.
const CANDIDATE_DIRS = [
  path.join(__dirname, '../../../shared/curriculum'),
  path.join(__dirname, '../../shared/curriculum'),
];

function curriculumDir() {
  return CANDIDATE_DIRS.find(p => fs.existsSync(p));
}

function loadCurriculumFiles() {
  const dir = curriculumDir();
  if (!dir) return [];
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.json'))
    .sort()
    .map(f => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
}

// The JSON files are the source of truth; rows are upserted, never deleted, so
// questions tagged with an OA keep their reference if a file is trimmed.
async function syncCurriculum() {
  let count = 0;
  for (const file of loadCurriculumFiles()) {
    for (const { subject, oas } of file.subjects) {
      for (const oa of oas) {
        await pool.query(`
          INSERT INTO curriculum_oas (subject, grade_level, code, number, eje, label, text, quiz, note, unit, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
          ON CONFLICT (subject, grade_level, code) DO UPDATE SET
            number = EXCLUDED.number, eje = EXCLUDED.eje, label = EXCLUDED.label, text = EXCLUDED.text,
            quiz = EXCLUDED.quiz, note = EXCLUDED.note, unit = EXCLUDED.unit, updated_at = NOW()
        `, [subject, file.grade_level, oa.code, parseInt(oa.code.replace(/\D/g, ''), 10), oa.eje, oa.label, oa.text, oa.quiz, oa.note, oa.unit]);
        count++;
      }
    }
  }
  return count;
}

async function getCurriculum({ subject, gradeLevel }) {
  const { rows } = await pool.query(`
    SELECT c.code, c.number, c.eje, c.label, c.text, c.quiz, c.note, c.unit,
           COUNT(q.id) FILTER (WHERE q.active)::int AS active_questions
    FROM curriculum_oas c
    LEFT JOIN questions q
      ON q.subject = c.subject AND q.grade_level = c.grade_level AND q.oa_code = c.code
    WHERE c.subject = $1 AND c.grade_level = $2
    GROUP BY c.id
    ORDER BY c.number
  `, [subject, gradeLevel]);
  return rows;
}

module.exports = { syncCurriculum, getCurriculum, loadCurriculumFiles };
