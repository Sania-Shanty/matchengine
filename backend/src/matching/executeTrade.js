// Carries out ONE trade between a buy order and a sell order.
// It must always be called inside a transaction (see withTransaction).
//
// The accounts involved are already locked by matchOrder.js,
// in ascending id order, before this function runs.

const { parseMoneyToPaise, formatPaise } = require('../utils/money');

// Reduces an order's remaining quantity and updates its status.
async function applyFill(client, order, quantity) {
  if (quantity <= 0 || quantity > order.remaining_quantity) {
    throw new Error(
      `Internal error: cannot fill ${quantity} of order ${order.id} (remaining ${order.remaining_quantity}).`
    );
  }

  const remaining = order.remaining_quantity - quantity;
  const status = remaining === 0 ? 'filled' : 'partial';

  await client.query('UPDATE orders SET remaining_quantity = $1, status = $2 WHERE id = $3', [
    remaining,
    status,
    order.id,
  ]);

  // Keep our in-memory copy in step with the database.
  order.remaining_quantity = remaining;
  order.status = status;
}

async function executeTrade(client, { securityId, buyOrder, sellOrder, executedPrice, quantity }) {
  const executedPaise = parseMoneyToPaise(executedPrice);
  const buyLimitPaise = parseMoneyToPaise(buyOrder.price);
  const qty = BigInt(quantity);

  // What the buyer actually pays, and how much of the reservation is released.
  // The reservation was made at the buyer's limit price, which is never lower
  // than the execution price, so "released" is always >= "cost".
  const cost = formatPaise(executedPaise * qty);
  const released = formatPaise(buyLimitPaise * qty);

  // 1. Buyer: pay cash and release the reservation.
  await client.query(
    `UPDATE accounts
        SET cash_balance = cash_balance - $1::numeric,
            reserved_balance = reserved_balance - $2::numeric
      WHERE id = $3`,
    [cost, released, buyOrder.account_id]
  );

  // 2. Seller: receive cash.
  await client.query(
    'UPDATE accounts SET cash_balance = cash_balance + $1::numeric WHERE id = $2',
    [cost, sellOrder.account_id]
  );

  // 3. Buyer: receive shares (creates the holding row if it does not exist).
  await client.query(
    `INSERT INTO holdings (account_id, security_id, quantity, reserved_quantity)
     VALUES ($1, $2, $3, 0)
     ON CONFLICT (account_id, security_id)
     DO UPDATE SET quantity = holdings.quantity + EXCLUDED.quantity`,
    [buyOrder.account_id, securityId, quantity]
  );

  // 4. Seller: give up shares and release the reservation.
  await client.query(
    `UPDATE holdings
        SET quantity = quantity - $1,
            reserved_quantity = reserved_quantity - $1
      WHERE account_id = $2 AND security_id = $3`,
    [quantity, sellOrder.account_id, securityId]
  );

  // 5. Both orders: reduce remaining quantity, update status.
  await applyFill(client, buyOrder, quantity);
  await applyFill(client, sellOrder, quantity);

  // 6. Record the trade permanently (the table is append-only).
  const trade = await client.query(
    `INSERT INTO trades
       (security_id, buy_order_id, sell_order_id, executed_price, executed_quantity, executed_at)
     VALUES ($1, $2, $3, $4::numeric, $5, clock_timestamp())
     RETURNING id, buy_order_id, sell_order_id, executed_price, executed_quantity, executed_at`,
    [securityId, buyOrder.id, sellOrder.id, executedPrice, quantity]
  );

  return trade.rows[0];
}

module.exports = { executeTrade };