// Creates the main database and the test database if they don't exist yet.
// Safe to run more than once.

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
const { ensureDatabase } = require('./ensure_database');

async function main() {
  const urls = [
    ['main database', process.env.DATABASE_URL],
    ['test database', process.env.TEST_DATABASE_URL],
  ];

  for (const [label, url] of urls) {
    if (!url) {
      throw new Error(`The ${label} URL is missing from your .env file.`);
    }
    const result = await ensureDatabase(url);
    const dbName = new URL(url).pathname.slice(1);
    console.log(
      result === 'created'
        ? `  created  ${label} "${dbName}"`
        : `  ok       ${label} "${dbName}" already exists`
    );
  }
}

main()
  .then(() => console.log('Databases are ready.'))
  .catch((error) => {
    console.error(error.message);
    process.exit(1);
  });