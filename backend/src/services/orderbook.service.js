// Public market data: the order book and the recent trades.

const pool = require('../db/pool');
const { getSecurityBySymbol } = require('./securities.service');

// Groups live orders into price levels.
async function getSideLevels(securityId, side, depth) {
  const direction = side === 'buy' ? 'DESC' : 'ASC';
  const result = await pool.query(
    `SELECT price,
            SUM(remaining_quantity)::int AS quantity,
            COUNT(*)::int AS orders
       FROM orders
      WHERE security_id = $1
        AND side = $2
        AND status IN ('open', 'partial')
        AND remaining_quantity > 0
      GROUP BY price
      ORDER BY price ${direction}
      LIMIT $3`,
    [securityId, side, depth]
  );
  return result.rows;
}

async function getOrderBook(symbol, depth = 20) {
  const security = await getSecurityBySymbol(symbol);
  const [bids, asks] = await Promise.all([
    getSideLevels(security.id, 'buy', depth),
    getSideLevels(security.id, 'sell', depth),
  ]);
  return { symbol: security.symbol, bids, asks };
}

async function getRecentTrades(symbol, limit = 50) {
  const security = await getSecurityBySymbol(symbol);
  const result = await pool.query(
    `SELECT id,
            executed_price AS price,
            executed_quantity AS quantity,
            executed_at AS "executedAt"
       FROM trades
      WHERE security_id = $1
      ORDER BY id DESC
      LIMIT $2`,
    [security.id, limit]
  );
  return { symbol: security.symbol, trades: result.rows };
}

module.exports = { getOrderBook, getRecentTrades };