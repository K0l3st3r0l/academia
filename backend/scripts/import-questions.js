const fs = require('fs');
const path = require('path');
const pool = require('../src/db');

const VALID_SUBJECTS = ['matematica', 'lenguaje', 'ciencias', 'historia', 'ingles', 'general'];
const VALID_DIFFICULTIES = ['easy', 'medium', 'hard'];
const CONTENT_DIR = path.join(__dirname, '..', 'content', 'questions');

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

async function importFile(filePath, subject, gradeLevel) {
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
      `INSERT INTO questions (subject, grade_level, difficulty, text, options, correct, hint, oa_code, active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true)
       ON CONFLICT (subject, grade_level, text) DO NOTHING
       RETURNING id`,
      [subject, gradeLevel, q.difficulty, q.text, JSON.stringify(q.options), q.correct, q.hint || null, q.oa_code || null]
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

  const files = fs.readdirSync(CONTENT_DIR).filter(f => f.endsWith('.json')).sort();
  if (!files.length) {
    console.log('No hay archivos .json en content/questions/.');
    return;
  }

  console.log(`Importando ${files.length} archivo(s) desde ${CONTENT_DIR}\n`);

  const totals = { inserted: 0, skipped: 0, invalid: 0 };

  for (const file of files) {
    const parsed = parseFilename(file);
    if (!parsed || !VALID_SUBJECTS.includes(parsed.subject)) {
      console.warn(`✗ ${file}: nombre de archivo inválido o subject desconocido, se omite`);
      continue;
    }

    try {
      const result = await importFile(path.join(CONTENT_DIR, file), parsed.subject, parsed.gradeLevel);
      console.log(`${file}: ${result.inserted} insertadas, ${result.skipped} omitidas (duplicadas), ${result.invalid} inválidas`);
      totals.inserted += result.inserted;
      totals.skipped += result.skipped;
      totals.invalid += result.invalid;
    } catch (err) {
      console.error(`✗ ${file}: error al procesar — ${err.message}`);
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