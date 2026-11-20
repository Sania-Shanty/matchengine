// Runs every .sql file in database/migrations/ in order.
// It remembers which ones already ran, so running it twice is safe.

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');

async function runMigrations(connectionString) {
  const client = new Client({ connectionString });
  await client.connect();

  try {
    // A small bookkeeping table that remembers which files have run.
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename   TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    const files = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((file) => file.endsWith('.sql'))
      .sort();

    const result = await client.query('SELECT filename FROM schema_migrations');
    const alreadyApplied = new Set(result.rows.map((row) => row.filename));

    let appliedCount = 0;

    for (const file of files) {
      if (alreadyApplied.has(file)) {
        console.log(`  skip   ${file} (already applied)`);
        continue;
      }

      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');

      try {
        // Each file runs as one all-or-nothing transaction.
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
        await client.query('COMMIT');
        console.log(`  apply  ${file}`);
        appliedCount += 1;
      } catch (error) {
        await client.query('ROLLBACK');
        throw new Error(`Migration ${file} failed: ${error.message}`);
      }
    }

    return appliedCount;
  } finally {
    await client.end();
  }
}

module.exports = { runMigrations };

// This block runs only when you type: npm run db:migrate
if (require.main === module) {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    console.error('DATABASE_URL is missing. Did you create your .env file?');
    process.exit(1);
  }

  console.log('Running migrations...');
  runMigrations(databaseUrl)
    .then((count) => {
      console.log(`Done. ${count} new migration(s) applied.`);
    })
    .catch((error) => {
      console.error(error.message);
      process.exit(1);
    });
}