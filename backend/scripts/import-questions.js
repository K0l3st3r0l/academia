const fs = require('fs');
const path = require('path');
const pool = require('../src/db');

const VALID_SUBJECTS = ['matematica', 'lenguaje', 'ciencias', 'historia', 'ingles', 'general'];
const VALID_DIFFICULTIES = ['easy', 'medium', 'hard'];
const CONTENT_DIR = path.join(__dirname, '..', 'content', 'questions');
// Drafts written with AI (content/pipeline/preguntas.py): imported as 'draft', they enter the
// game only after a teacher or UTP approves them in the question bank.
const DRAFTS_DIR = path.join(CONTENT_DIR, 'borradores');

function validateQuestion(q) {
  const errors = [];
  if (!q.text || typeof q.text !== 'string') errors.push('falta text');
  if (!Array.isArray(q.options) || q.options.length !== 4) errors.push('options debe tener exactamente 4 elementos');
  if (Array.isArray(q.options) && new Set(q.options).size !== q.options.length) errors.push('options tiene valores repetidos');
  if (!q.correct || !(Array.isArray(q.options) && q.options.includes(q.correct))) errors.push('correct no coincide textualmente con ninguna option');
  if (!VALID_DIFFICULTIES.includes(q.difficulty)) errors.push(`difficulty inválida: "${q.difficulty}"`);
  return errors;
}

function parseFilename(filename) {
  const base = path.basename(filename, '.json');
  const idx = base.lastIndexOf('_');
  if (idx === -1) return null;
  return { subject: base.slice(0, idx), gradeLevel: base.slice(idx + 1) };
}

async function importFile(filePath, subject, gradeLevel, { draft = false } = {}) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const questions = JSON.parse(raw);
  if (!Array.isArray(questions)) throw new Error('el archivo debe contener un array de preguntas');

  let inserted = 0;
  let skipped = 0;
  let invalid = 0;

  for (const q of questions) {
    const errors = validateQuestion(q);
    if (errors.length) {
      invalid++;
      console.warn(`  ⚠ inválida: "${(q.text || '(sin texto)').slice(0, 60)}" — ${errors.join('; ')}`);
      continue;
    }

    const { rows } = await pool.query(
      `INSERT INTO questions (subject, grade_level, difficulty, text, options, correct, hint, oa_code, active,
                              status, clue, option_notes, source, check_note)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, $9, $10, $11, $12, $13)
       ON CONFLICT (subject, grade_level, text) DO NOTHING
       RETURNING id`,
      [subject, gradeLevel, q.difficulty, q.text, JSON.stringify(q.options), q.correct, q.hint || null, q.oa_code || null,
        draft ? 'draft' : 'approved', q.clue || null, q.option_notes ? JSON.stringify(q.option_notes) : null,
        q.source || 'import', q.check_note || null]
    );

    if (rows.length) inserted++;
    else skipped++;
  }

  return { inserted, skipped, invalid };
}

async function main() {
  if (!fs.existsSync(CONTENT_DIR)) {
    console.error(`No existe el directorio de contenido: ${CONTENT_DIR}`);
    process.exitCode = 1;
    return;
  }

  const jsonIn = dir => (fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort() : []);
  const files = [
    ...jsonIn(CONTENT_DIR).map(f => ({ file: f, dir: CONTENT_DIR, draft: false })),
    ...jsonIn(DRAFTS_DIR).map(f => ({ file: f, dir: DRAFTS_DIR, draft: true })),
  ];
  if (!files.length) {
    console.log('No hay archivos .json en content/questions/.');
    return;
  }

  console.log(`Importando ${files.length} archivo(s) desde ${CONTENT_DIR}\n`);

  const totals = { inserted: 0, skipped: 0, invalid: 0 };

  for (const { file, dir, draft } of files) {
    const parsed = parseFilename(file);
    if (!parsed || !VALID_SUBJECTS.includes(parsed.subject)) {
      console.warn(`✗ ${file}: nombre de archivo inválido o subject desconocido, se omite`);
      continue;
    }

    const label = draft ? `borradores/${file}` : file;
    try {
      const result = await importFile(path.join(dir, file), parsed.subject, parsed.gradeLevel, { draft });
      console.log(`${label}: ${result.inserted} insertadas, ${result.skipped} omitidas (duplicadas), ${result.invalid} inválidas`);
      totals.inserted += result.inserted;
      totals.skipped += result.skipped;
      totals.invalid += result.invalid;
    } catch (err) {
      console.error(`✗ ${label}: error al procesar — ${err.message}`);
    }
  }

  console.log(`\nTotal: ${totals.inserted} insertadas, ${totals.skipped} omitidas, ${totals.invalid} inválidas`);
}

main()
  .catch(err => {
    console.error('Error en import-questions:', err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());