// Shared helper: makes sure a database exists, creating it if needed.
// Works with a local PostgreSQL and with cloud providers such as Neon.

const { Client } = require('pg');

async function ensureDatabase(connectionString) {
  const parsed = new URL(connectionString);
  const dbName = decodeURIComponent(parsed.pathname.slice(1));

  if (!/^[A-Za-z0-9_]+$/.test(dbName)) {
    throw new Error(
      `The database name "${dbName}" may only contain letters, numbers and underscores.`
    );
  }

  // Step 1: maybe the database already exists. Try connecting straight to it.
  const direct = new Client({ connectionString });
  try {
    await direct.connect();
    await direct.end();
    return 'exists';
  } catch (error) {
    await direct.end().catch(() => {});
    // 3D000 means "this database does not exist". Anything else is a real problem.
    if (error.code !== '3D000') {
      throw new Error(
        `Could not connect to the database server: ${error.message}\n` +
          'Check the details in your .env file (user, password, host, port).'
      );
    }
  }

  // Step 2: it does not exist. Connect to the built-in "postgres" database
  // and create it.
  const adminUrl = new URL(connectionString);
  adminUrl.pathname = '/postgres';
  const admin = new Client({ connectionString: adminUrl.toString() });

  try {
    await admin.connect();
    await admin.query(`CREATE DATABASE "${dbName}"`);
    return 'created';
  } catch (error) {
    throw new Error(
      `Could not create the database "${dbName}": ${error.message}\n` +
        'If you use Neon: create a database with this exact name in the Neon ' +
        'dashboard (Databases -> New Database), then run this command again.'
    );
  } finally {
    await admin.end().catch(() => {});
  }
}

module.exports = { ensureDatabase };