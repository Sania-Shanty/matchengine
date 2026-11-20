// A connection to the test database as its OWNER.
// Tests use it to create fixtures and to inspect the database directly.

const { Pool } = require('pg');

const url = process.env.TEST_DATABASE_URL;

if (!url) {
  throw new Error('TEST_DATABASE_URL is missing from your .env file.');
}

const dbName = new URL(url).pathname.slice(1);
if (!dbName.includes('test')) {
  throw new Error(`Safety stop: "${dbName}" does not look like a test database.`);
}

const ownerPool = new Pool({ connectionString: url, max: 5 });

module.exports = { ownerPool, testDatabaseUrl: url };