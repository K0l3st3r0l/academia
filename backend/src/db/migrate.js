const logger = require('../logger');
const fs = require('fs');
const path = require('path');
const pool = require('./index');

async function runMigrations() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    const migrationsDir = path.join(__dirname, 'migrations');
    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    for (const file of files) {
      const version = parseInt(file.split('_')[0]);
      const { rows } = await client.query(
        'SELECT 1 FROM schema_migrations WHERE version = $1', [version]
      );
      if (rows.length > 0) continue;

      logger.info(`Running migration ${file}...`);
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      await client.query(sql);
      logger.info(`Migration ${file} done.`);
    }
  } finally {
    client.release();
  }
}

module.exports = runMigrations;
