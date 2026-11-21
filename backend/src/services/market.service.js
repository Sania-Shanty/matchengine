// One query that summarises every security for the Market page,
// replacing 11 separate requests every few seconds.
// Prices come back as text (for example "100.00"), never as floating-point numbers.

const pool = require('../db/pool');

async function getMarketSummary() {
  const result = await pool.query(
    `SELECT s.symbol,
            s.name,
            (SELECT t.executed_price FROM trades t
              WHERE t.security_id = s.id ORDER BY t.id DESC LIMIT 1) AS "lastPrice",
            (SELECT t.executed_price FROM trades t
              WHERE t.security_id = s.id ORDER BY t.id DESC OFFSET 1 LIMIT 1) AS "previousPrice",
            (SELECT MAX(o.price) FROM orders o
              WHERE o.security_id = s.id AND o.side = 'buy'
                AND o.status IN ('open', 'partial') AND o.remaining_quantity > 0) AS "bestBid",
            (SELECT MIN(o.price) FROM orders o
              WHERE o.security_id = s.id AND o.side = 'sell'
                AND o.status IN ('open', 'partial') AND o.remaining_quantity > 0) AS "bestAsk",
            (SELECT COALESCE(SUM(t.executed_quantity), 0)::int FROM trades t
              WHERE t.security_id = s.id
                AND t.executed_at > now() - interval '24 hours') AS "volume24h"
       FROM securities s
      ORDER BY s.symbol`
  );
  return result.rows;
}

module.exports = { getMarketSummary };