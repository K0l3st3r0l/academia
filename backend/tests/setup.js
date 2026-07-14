import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';
import { beforeEach } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..', '..'); // .../academia

// Backend containers get DB credentials from ../.env (docker-compose env_file).
// Tests run on the host, so we reuse DB_USER/DB_PASSWORD from there as a fallback
// but never DB_HOST/DB_NAME (those point at the production container hostname/db).
function loadDotEnv(envPath) {
  if (!fs.existsSync(envPath)) return {};
  const out = {};
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    out[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return out;
}

const dotEnv = loadDotEnv(path.join(PROJECT_ROOT, '.env'));

function resolveTestDbConfig() {
  if (process.env.TEST_DATABASE_URL) {
    const url = new URL(process.env.TEST_DATABASE_URL);
    return {
      host: url.hostname,
      port: url.port ? parseInt(url.port, 10) : 5432,
      database: url.pathname.replace(/^\//, ''),
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
    };
  }
  return {
    host: process.env.TEST_DB_HOST || 'localhost',
    port: parseInt(process.env.TEST_DB_PORT || '5434', 10),
    database: process.env.TEST_DB_NAME || 'academia_test',
    user: process.env.TEST_DB_USER || process.env.DB_USER || dotEnv.DB_USER,
    password: process.env.TEST_DB_PASSWORD || process.env.DB_PASSWORD || dotEnv.DB_PASSWORD,
  };
}

const testDb = resolveTestDbConfig();

// ── Safety net: this is the one thing that must never fail silently ────────
if (!/^[a-zA-Z0-9_]+$/.test(testDb.database || '')) {
  throw new Error(`SAFETY: nombre de base de datos de test inválido: "${testDb.database}"`);
}
if (testDb.database.toLowerCase() === 'academia') {
  throw new Error(
    'SAFETY: la configuración de tests apunta a la base de datos de PRODUCCIÓN ("academia"). ' +
    'Define TEST_DATABASE_URL o TEST_DB_NAME apuntando a una base desechable (ej. "academia_test"). Abortando.'
  );
}
if (!testDb.user || !testDb.password) {
  throw new Error(
    'SAFETY: faltan credenciales de base de datos para tests ' +
    '(TEST_DB_USER/TEST_DB_PASSWORD, DB_USER/DB_PASSWORD, o ../.env).'
  );
}

process.env.DB_HOST = testDb.host;
process.env.DB_PORT = String(testDb.port);
process.env.DB_NAME = testDb.database;
process.env.DB_USER = testDb.user;
process.env.DB_PASSWORD = testDb.password;
process.env.JWT_SECRET = process.env.JWT_SECRET || dotEnv.JWT_SECRET || 'test_jwt_secret_do_not_use_in_prod';
process.env.NODE_ENV = 'test';
process.env.ANAHUAC_API_URL = process.env.ANAHUAC_API_URL || 'http://anahuac.invalid';

async function ensureDatabaseExists() {
  const client = new Client({
    host: testDb.host,
    port: testDb.port,
    user: testDb.user,
    password: testDb.password,
    database: 'postgres',
  });
  await client.connect();
  try {
    const { rows } = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [testDb.database]);
    if (rows.length === 0) {
      await client.query(`CREATE DATABASE "${testDb.database}"`);
    }
  } finally {
    await client.end();
  }
}

await ensureDatabaseExists();

const { default: runMigrations } = await import('../src/db/migrate.js');
await runMigrations();

const { default: pool } = await import('../src/db/index.js');

const APP_TABLES = [
  'characters',
  'student_answers',
  'token_ledger',
  'events',
  'game_sessions',
  'rooms',
  'questions',
  'local_students',
  'local_users',
];

beforeEach(async () => {
  await pool.query(`TRUNCATE TABLE ${APP_TABLES.join(', ')} RESTART IDENTITY CASCADE`);
});
