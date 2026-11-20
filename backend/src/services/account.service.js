// Business logic for reading a user's money and shares.
// Money values are returned as TEXT (for example "100000.00"), never as
// floating-point numbers, so no rounding errors can sneak in.

const pool = require('../db/pool');
const { notFound } = require('../utils/errors');

async function getAccountSummary(userId) {
  const result = await pool.query(
    `SELECT id AS "accountId",
            cash_balance AS "cashBalance",
            reserved_balance AS "reservedBalance",
            (cash_balance - reserved_balance) AS "availableBalance"
     FROM accounts
     WHERE user_id = $1`,
    [userId]
  );

  if (result.rowCount === 0) {
    throw notFound('No account found for this user.');
  }

  return result.rows[0];
}

async function getHoldings(userId) {
  const result = await pool.query(
    `SELECT s.symbol,
            s.name,
            h.quantity,
            h.reserved_quantity AS "reservedQuantity",
            (h.quantity - h.reserved_quantity) AS "availableQuantity"
     FROM holdings h
     JOIN accounts a   ON a.id = h.account_id
     JOIN securities s ON s.id = h.security_id
     WHERE a.user_id = $1
     ORDER BY s.symbol`,
    [userId]
  );

  return result.rows;
}

module.exports = { getAccountSummary, getHoldings };