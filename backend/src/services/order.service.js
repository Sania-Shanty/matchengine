// Business logic for placing and reading orders.

const pool = require('../db/pool');
const withTransaction = require('../db/withTransaction');
const env = require('../config/env');
const { badRequest, notFound } = require('../utils/errors');
const { parseMoneyToPaise, formatPaise } = require('../utils/money');
const { matchOrder } = require('../matching/matchOrder');

const MAX_PRICE_PAISE = 100000000n; // Rs. 1,000,000.00
const MAX_QUANTITY = 1000000;

function validateOrderInput(input) {
  const body = input && typeof input === 'object' ? input : {};
  const problems = [];

  const symbol = typeof body.symbol === 'string' ? body.symbol.trim().toUpperCase() : '';
  if (!/^[A-Z0-9]{1,20}$/.test(symbol)) {
    problems.push('symbol is required');
  }

  const side = typeof body.side === 'string' ? body.side.trim().toLowerCase() : '';
  if (side !== 'buy' && side !== 'sell') {
    problems.push("side must be 'buy' or 'sell'");
  }

  const pricePaise = parseMoneyToPaise(body.price);
  if (pricePaise === null || pricePaise <= 0n || pricePaise > MAX_PRICE_PAISE) {
    problems.push('price must be above 0, at most 1000000.00, with at most 2 decimal places');
  }

  const quantity = body.quantity;
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY) {
    problems.push(`quantity must be a whole number from 1 to ${MAX_QUANTITY}`);
  }

  if (problems.length > 0) {
    throw badRequest(problems.join('; '), 'VALIDATION_ERROR');
  }

  return { symbol, side, price: formatPaise(pricePaise), quantity };
}

function formatOrder(row, symbol) {
  return {
    id: row.id,
    symbol,
    side: row.side,
    price: row.price,
    quantity: row.quantity,
    remainingQuantity: row.remaining_quantity,
    status: row.status,
    createdAt: row.created_at,
  };
}

function formatTrade(row) {
  return {
    id: row.id,
    buyOrderId: row.buy_order_id,
    sellOrderId: row.sell_order_id,
    price: row.executed_price,
    quantity: row.executed_quantity,
    executedAt: row.executed_at,
  };
}

async function placeOrderOnce(userId, order) {
  return withTransaction(async (client) => {
    const security = await client.query('SELECT id, symbol FROM securities WHERE symbol = $1', [
      order.symbol,
    ]);
    if (security.rowCount === 0) {
      throw notFound(`Security "${order.symbol}" does not exist.`);
    }
    const securityId = security.rows[0].id;

    // One order at a time per security. Released automatically at COMMIT/ROLLBACK.
    if (env.matchingLockMode === 'advisory') {
      await client.query('SELECT pg_advisory_xact_lock($1::bigint)', [securityId]);
    }

    const account = await client.query('SELECT id FROM accounts WHERE user_id = $1', [userId]);
    if (account.rowCount === 0) {
      throw notFound('No account found for this user.');
    }

    const result = await matchOrder(client, {
      accountId: account.rows[0].id,
      securityId,
      side: order.side,
      price: order.price,
      quantity: order.quantity,
    });

    return {
      order: formatOrder(result.order, order.symbol),
      trades: result.trades.map(formatTrade),
    };
  });
}

async function placeOrder(userId, input) {
  const order = validateOrderInput(input);

  // In "row" lock mode the database may occasionally detect a deadlock and
  // cancel one transaction. Trying again is the correct response.
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await placeOrderOnce(userId, order);
    } catch (error) {
      const retryable = error.code === '40P01' || error.code === '40001';
      if (!retryable || attempt >= 3) throw error;
    }
  }
}

async function listOrders(userId, { symbol, limit }) {
  const result = await pool.query(
    `SELECT o.id, s.symbol, o.side, o.price, o.quantity,
            o.remaining_quantity, o.status, o.created_at
       FROM orders o
       JOIN accounts a   ON a.id = o.account_id
       JOIN securities s ON s.id = o.security_id
      WHERE a.user_id = $1
        AND ($2::text IS NULL OR s.symbol = $2)
      ORDER BY o.id DESC
      LIMIT $3`,
    [userId, symbol || null, limit]
  );

  return result.rows.map((row) => formatOrder(row, row.symbol));
}

async function getOrder(userId, orderId) {
  if (!/^\d{1,18}$/.test(String(orderId))) {
    throw notFound('Order not found.');
  }

  const result = await pool.query(
    `SELECT o.id, s.symbol, o.side, o.price, o.quantity,
            o.remaining_quantity, o.status, o.created_at
       FROM orders o
       JOIN accounts a   ON a.id = o.account_id
       JOIN securities s ON s.id = o.security_id
      WHERE o.id = $1 AND a.user_id = $2`,
    [orderId, userId]
  );

  // Someone else's order looks exactly like an order that does not exist.
  if (result.rowCount === 0) {
    throw notFound('Order not found.');
  }

  const trades = await pool.query(
    `SELECT id, buy_order_id, sell_order_id, executed_price, executed_quantity, executed_at
       FROM trades
      WHERE buy_order_id = $1 OR sell_order_id = $1
      ORDER BY id`,
    [orderId]
  );

  return {
    order: formatOrder(result.rows[0], result.rows[0].symbol),
    trades: trades.rows.map(formatTrade),
  };
}

module.exports = { placeOrder, listOrders, getOrder };