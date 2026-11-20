// A "pool" is a small group of ready-made database connections that the
// server shares. Up to 20 requests can talk to the database at the same time.

const { Pool } = require('pg');
const env = require('../config/env');

const pool = new Pool({
  connectionString: env.databaseUrl,
  max: 20,
});

pool.on('error', (error) => {
  console.error('Unexpected database error:', error.message);
});

module.exports = pool;