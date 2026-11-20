// Builders for test data. Every test creates its OWN security and traders
// with random names, so tests never interfere with each other.

const crypto = require('crypto');
const { ownerPool } = require('./testDb');
const orderService = require('../../src/services/order.service');

const randomTag = () => crypto.randomBytes(4).toString('hex').toUpperCase();

// A brand-new tradable security, e.g. "T3FA91C0B7D2E4A18" (17 characters).
async function createSecurity() {
  const symbol = `T${randomTag()}${randomTag()}`;
  const result = await ownerPool.query(
    'INSERT INTO securities (symbol, name) VALUES ($1, $2) RETURNING id, symbol',
    [symbol, `Test security ${symbol}`]
  );
  return result.rows[0];
}

// A brand-new user with an account, some cash, and some shares of one security.
// shares: 0 means "no holding row at all".
async function createTrader(security, { cash = '1000000.00', shares = 1000 } = {}) {
  const tag = `${randomTag()}${randomTag()}`;

  const user = await ownerPool.query(
    `INSERT INTO users (email, full_name, password_hash)
     VALUES ($1, 'Test Trader', 'not-a-real-hash') RETURNING id`,
    [`trader_${tag}@test.local`]
  );

  const account = await ownerPool.query(
    `INSERT INTO accounts (user_id, cash_balance, reserved_balance)
     VALUES ($1, $2::numeric, 0) RETURNING id`,
    [user.rows[0].id, cash]
  );

  if (shares > 0) {
    await ownerPool.query(
      `INSERT INTO holdings (account_id, security_id, quantity, reserved_quantity)
       VALUES ($1, $2, $3, 0)`,
      [account.rows[0].id, security.id, shares]
    );
  }

  return {
    userId: user.rows[0].id,
    accountId: account.rows[0].id,
    securityId: security.id,
    symbol: security.symbol,
    initialCash: cash,
    initialShares: shares,
  };
}

// Places an order through the real order service (the same code the API uses).
function place(trader, side, price, quantity) {
  return orderService.placeOrder(trader.userId, {
    symbol: trader.symbol,
    side,
    price,
    quantity,
  });
}

// Inserts a resting order directly (bypassing matching) with an exact created_at,
// and sets aside its reservation so the books stay consistent.
// Used to test the "same timestamp" tie-break.
async function insertRestingOrder(trader, { side, price, quantity, createdAt }) {
  const client = await ownerPool.connect();
  try {
    await client.query('BEGIN');

    const inserted = await client.query(
      `INSERT INTO orders
         (account_id, security_id, side, price, quantity, remaining_quantity, status, created_at)
       VALUES ($1, $2, $3, $4::numeric, $5::int, $5::int, 'open', $6::timestamptz)
       RETURNING id`,
      [trader.accountId, trader.securityId, side, price, quantity, createdAt]
    );

    if (side === 'sell') {
      await client.query(
        `UPDATE holdings SET reserved_quantity = reserved_quantity + $1::int
          WHERE account_id = $2 AND security_id = $3`,
        [quantity, trader.accountId, trader.securityId]
      );
    } else {
      await client.query(
        `UPDATE accounts SET reserved_balance = reserved_balance + ($1::numeric * $2::int)
          WHERE id = $3`,
        [price, quantity, trader.accountId]
      );
    }

    await client.query('COMMIT');
    return inserted.rows[0].id;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

// ---- Read helpers: look at the real database rows --------------------------

async function fetchOrder(orderId) {
  const r = await ownerPool.query(
    `SELECT id, side, price, quantity, remaining_quantity, status
       FROM orders WHERE id = $1`,
    [orderId]
  );
  return r.rows[0];
}

async function fetchOpenOrders(securityId) {
  const r = await ownerPool.query(
    `SELECT id, side, price, quantity, remaining_quantity, status
       FROM orders
      WHERE security_id = $1 AND status IN ('open', 'partial')
      ORDER BY id`,
    [securityId]
  );
  return r.rows;
}

async function countOrders(securityId) {
  const r = await ownerPool.query('SELECT COUNT(*)::int AS n FROM orders WHERE security_id = $1', [
    securityId,
  ]);
  return r.rows[0].n;
}

async function fetchTrades(securityId) {
  const r = await ownerPool.query(
    `SELECT id, buy_order_id, sell_order_id, executed_price, executed_quantity
       FROM trades WHERE security_id = $1 ORDER BY id`,
    [securityId]
  );
  return r.rows;
}

async function fetchAccount(accountId) {
  const r = await ownerPool.query(
    'SELECT id, cash_balance, reserved_balance FROM accounts WHERE id = $1',
    [accountId]
  );
  return r.rows[0];
}

async function fetchHolding(accountId, securityId) {
  const r = await ownerPool.query(
    'SELECT quantity, reserved_quantity FROM holdings WHERE account_id = $1 AND security_id = $2',
    [accountId, securityId]
  );
  return r.rows[0];
}

module.exports = {
  createSecurity,
  createTrader,
  place,
  insertRestingOrder,
  fetchOrder,
  fetchOpenOrders,
  countOrders,
  fetchTrades,
  fetchAccount,
  fetchHolding,
};