// Business logic for reading the list of tradable stocks.

const pool = require('../db/pool');
const { notFound } = require('../utils/errors');

async function listSecurities() {
  const result = await pool.query('SELECT id, symbol, name FROM securities ORDER BY symbol');
  return result.rows;
}

async function getSecurityBySymbol(symbol) {
  const result = await pool.query(
    'SELECT id, symbol, name FROM securities WHERE symbol = $1',
    [String(symbol).toUpperCase()]
  );

  if (result.rowCount === 0) {
    throw notFound(`Security "${symbol}" does not exist.`);
  }

  return result.rows[0];
}

module.exports = { listSecurities, getSecurityBySymbol };