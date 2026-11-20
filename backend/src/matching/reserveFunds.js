// Sets money (for buys) or shares (for sells) aside when an order is placed.
// The check and the update are ONE statement, so there is no gap
// in which two orders could both spend the same money.

const { parseMoneyToPaise, formatPaise } = require('../utils/money');
const { conflict } = require('../utils/errors');

async function reserveForOrder(client, { accountId, securityId, side, price, quantity }) {
  if (side === 'buy') {
    const amount = formatPaise(parseMoneyToPaise(price) * BigInt(quantity));

    const result = await client.query(
      `UPDATE accounts
          SET reserved_balance = reserved_balance + $1::numeric
        WHERE id = $2
          AND cash_balance - reserved_balance >= $1::numeric
        RETURNING id`,
      [amount, accountId]
    );

    if (result.rowCount === 0) {
      throw conflict(
        `Not enough available cash: this order needs Rs. ${amount} set aside.`,
        'INSUFFICIENT_FUNDS'
      );
    }
    return;
  }

  const result = await client.query(
    `UPDATE holdings
        SET reserved_quantity = reserved_quantity + $1
      WHERE account_id = $2
        AND security_id = $3
        AND quantity - reserved_quantity >= $1
      RETURNING id`,
    [quantity, accountId, securityId]
  );

  if (result.rowCount === 0) {
    throw conflict(
      `Not enough available shares: this order needs ${quantity} shares set aside.`,
      'INSUFFICIENT_SHARES'
    );
  }
}

module.exports = { reserveForOrder };