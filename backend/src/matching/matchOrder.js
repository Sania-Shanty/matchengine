// The heart of MatchEngine.
// Places one order and matches it against the book using price-time priority.
// It must always be called inside a transaction (see withTransaction).

const { parseMoneyToPaise } = require('../utils/money');
const { conflict } = require('../utils/errors');
const { reserveForOrder } = require('./reserveFunds');
const { executeTrade } = require('./executeTrade');

// Incoming BUY: look at sells priced at or below our price, cheapest first.
const SELL_CANDIDATES_SQL = `
  SELECT id, account_id, price, quantity, remaining_quantity, status
    FROM orders
   WHERE security_id = $1
     AND side = 'sell'
     AND status IN ('open', 'partial')
     AND remaining_quantity > 0
     AND price <= $2::numeric
   ORDER BY price ASC, created_at ASC, id ASC
   FOR UPDATE`;

// Incoming SELL: look at buys priced at or above our price, highest first.
const BUY_CANDIDATES_SQL = `
  SELECT id, account_id, price, quantity, remaining_quantity, status
    FROM orders
   WHERE security_id = $1
     AND side = 'buy'
     AND status IN ('open', 'partial')
     AND remaining_quantity > 0
     AND price >= $2::numeric
   ORDER BY price DESC, created_at ASC, id ASC
   FOR UPDATE`;

// Sorts database ids (text) from smallest to largest, safely for big numbers.
function sortIdsAscending(ids) {
  return [...ids].sort((a, b) => {
    const x = BigInt(a);
    const y = BigInt(b);
    return x < y ? -1 : x > y ? 1 : 0;
  });
}

async function matchOrder(client, { accountId, securityId, side, price, quantity }) {
  // Sanity check: the price must be valid money.
  if (parseMoneyToPaise(price) === null) {
    throw new Error('Internal error: invalid price reached the matching engine.');
  }

  // 1. Find the orders we could trade with, best first, and lock them.
  const found = await client.query(side === 'buy' ? SELL_CANDIDATES_SQL : BUY_CANDIDATES_SQL, [
    securityId,
    price,
  ]);

  // We can only ever touch enough orders to cover our quantity.
  const needed = [];
  let covered = 0;
  for (const candidate of found.rows) {
    if (covered >= quantity) break;
    needed.push(candidate);
    covered += candidate.remaining_quantity;
  }

  // 2. Lock every account involved, ALWAYS in ascending id order.
  //    Two transactions that need the same accounts then queue up
  //    instead of deadlocking.
  const accountIds = sortIdsAscending(
    new Set([accountId, ...needed.map((order) => order.account_id)])
  );
  await client.query(
    'SELECT id FROM accounts WHERE id = ANY($1::bigint[]) ORDER BY id FOR UPDATE',
    [accountIds]
  );

  // 3. Set aside the money or shares this order needs.
  await reserveForOrder(client, { accountId, securityId, side, price, quantity });

  // 4. Save the new order. created_at uses the real clock time of this moment.
  const inserted = await client.query(
    `INSERT INTO orders
       (account_id, security_id, side, price, quantity, remaining_quantity, status, created_at)
     VALUES ($1, $2, $3, $4::numeric, $5, $5, 'open', clock_timestamp())
     RETURNING id, account_id, security_id, side, price, quantity, remaining_quantity, status, created_at`,
    [accountId, securityId, side, price, quantity]
  );
  const incoming = inserted.rows[0];

  // 5. Trade against the candidates, best first.
  const trades = [];
  for (const resting of needed) {
    if (incoming.remaining_quantity === 0) break;

    // Self-trade prevention: reject the whole new order (everything rolls back).
    if (resting.account_id === accountId) {
      throw conflict(
        'This order would trade against one of your own resting orders.',
        'SELF_TRADE'
      );
    }

    const fill = Math.min(incoming.remaining_quantity, resting.remaining_quantity);

    const trade = await executeTrade(client, {
      securityId,
      buyOrder: side === 'buy' ? incoming : resting,
      sellOrder: side === 'buy' ? resting : incoming,
      executedPrice: resting.price, // trades happen at the resting order's price
      quantity: fill,
    });
    trades.push(trade);
  }

  return { order: incoming, trades };
}

module.exports = { matchOrder };