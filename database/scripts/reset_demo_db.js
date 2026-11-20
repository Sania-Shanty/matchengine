// Wipes and rebuilds the TEST database so every test run starts clean.
// It refuses to touch anything that doesn't look like a test database.

const path = require('path');
const { Client } = require('pg');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
const { runMigrations } = require('./migrate');
const { ensureDatabase } = require('./ensure_database');

async function resetTestDb() {
  const testUrl = process.env.TEST_DATABASE_URL;

  if (!testUrl) {
    throw new Error('TEST_DATABASE_URL is missing from your .env file.');
  }

  if (testUrl === process.env.DATABASE_URL) {
    throw new Error('Safety stop: TEST_DATABASE_URL is the same as DATABASE_URL.');
  }

  const dbName = new URL(testUrl).pathname.slice(1);

  if (!/^[a-z0-9_]+$/.test(dbName) || !dbName.includes('test')) {
    throw new Error(
      `Safety stop: the test database name "${dbName}" must contain the word "test".`
    );
  }

  // Step 1: make sure the test database exists.
  const result = await ensureDatabase(testUrl);
  if (result === 'created') {
    console.log(`Created database "${dbName}".`);
  }

  // Step 2: wipe everything inside it.
  const client = new Client({ connectionString: testUrl });
  await client.connect();

  try {
    await client.query('DROP SCHEMA IF EXISTS public CASCADE');
    await client.query('CREATE SCHEMA public');
  } finally {
    await client.end();
  }

  // Step 3: rebuild all the tables.
  await runMigrations(testUrl);
}

module.exports = { resetTestDb };

// This block runs only when you type: npm run db:reset:test
if (require.main === module) {
  console.log('Resetting test database...');
  resetTestDb()
    .then(() => console.log('Test database is clean and ready.'))
    .catch((error) => {
      console.error(error.message);
      process.exit(1);
    });
}