// Reads settings from the .env file in the project root and checks they exist.
// Every other file gets its settings from here, never from process.env directly.

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '..', '.env') });

function required(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing setting "${name}" in your .env file.`);
    process.exit(1);
  }
  return value;
}

// "advisory": one order at a time per security (default, safest).
// "row":      only row locks (used later for the benchmark).
const matchingLockMode = (process.env.MATCHING_LOCK_MODE || 'advisory').toLowerCase();
if (matchingLockMode !== 'advisory' && matchingLockMode !== 'row') {
  console.error('MATCHING_LOCK_MODE must be "advisory" or "row".');
  process.exit(1);
}

const env = {
  port: Number(process.env.PORT) || 4000,
  databaseUrl: required('APP_DATABASE_URL'), // the limited app_user, never the owner
  jwtSecret: required('JWT_SECRET'),
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  matchingLockMode,
};

module.exports = env;