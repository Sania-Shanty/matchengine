// Loads the demo data from database/seeds/seed_demo_data.sql.

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const SEED_FILE = path.join(__dirname, '..', 'seeds', 'seed_demo_data.sql');

async function seed(connectionString) {
  const client = new Client({ connectionString });
  await client.connect();

  try {
    const sql = fs.readFileSync(SEED_FILE, 'utf8');
    await client.query(sql);

    const counts = await client.query(`
      SELECT
        (SELECT COUNT(*) FROM securities) AS securities,
        (SELECT COUNT(*) FROM users)      AS users,
        (SELECT COUNT(*) FROM accounts)   AS accounts,
        (SELECT COUNT(*) FROM holdings)   AS holdings
    `);

    const row = counts.rows[0];
    console.log(
      `Seed complete: ${row.securities} securities, ${row.users} users, ` +
        `${row.accounts} accounts, ${row.holdings} holdings.`
    );
  } finally {
    await client.end();
  }
}

module.exports = { seed };

// This block runs only when you type: npm run db:seed
if (require.main === module) {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    console.error('DATABASE_URL is missing. Did you create your .env file?');
    process.exit(1);
  }

  seed(databaseUrl).catch((error) => {
    console.error('Seeding failed:', error.message);
    process.exit(1);
  });
}