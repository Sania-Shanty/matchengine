import { createRequire } from 'node:module';
import { describe, it, expect, afterAll } from 'vitest';

const require = createRequire(import.meta.url);
const { Client } = require('pg');
const h = require('../helpers');

afterAll(() => h.closeAll());

// Inserts an order directly, with full control over every column.
function rawOrder(trader, { side = 'buy', price = 100, quantity = 10, remaining = 10, status = 'open' }) {
  return h.ownerPool.query(
    `INSERT INTO orders (account_id, security_id, side, price, quantity, remaining_quantity, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [trader.accountId, trader.securityId, side, price, quantity, remaining, status]
  );
}

// Creates a buy order, a sell order and one trade between them. Returns their ids.
async function createTradeFixture() {
  const security = await h.createSecurity();
  const buyer = await h.createTrader(security);
  const seller = await h.createTrader(security);
  const buyId = await h.insertRestingOrder(buyer, { side: 'buy', price: '100.00', quantity: 10, createdAt: new Date().toISOString() });
  const sellId = await h.insertRestingOrder(seller, { side: 'sell', price: '100.00', quantity: 10, createdAt: new Date().toISOString() });
  const trade = await h.ownerPool.query(
    `INSERT INTO trades (security_id, buy_order_id, sell_order_id, executed_price, executed_quantity)
     VALUES ($1, $2, $3, 100.00, 5) RETURNING id`,
    [security.id, buyId, sellId]
  );
  return { security, buyId, sellId, tradeId: trade.rows[0].id };
}

describe('The database enforces the rules itself', () => {
  it('refuses negative cash', async () => {
    const security = await h.createSecurity();
    const trader = await h.createTrader(security);
    await expect(
      h.ownerPool.query('UPDATE accounts SET cash_balance = -1 WHERE id = $1', [trader.accountId])
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('refuses reserved cash above the cash balance', async () => {
    const security = await h.createSecurity();
    const trader = await h.createTrader(security, { cash: '100.00' });
    await expect(
      h.ownerPool.query('UPDATE accounts SET reserved_balance = 500 WHERE id = $1', [trader.accountId])
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('refuses negative shares and reserved shares above owned shares', async () => {
    const security = await h.createSecurity();
    const trader = await h.createTrader(security, { shares: 10 });
    await expect(
      h.ownerPool.query('UPDATE holdings SET quantity = -1 WHERE account_id = $1', [trader.accountId])
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      h.ownerPool.query('UPDATE holdings SET reserved_quantity = 11 WHERE account_id = $1', [trader.accountId])
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('refuses a second holding row for the same account and security', async () => {
    const security = await h.createSecurity();
    const trader = await h.createTrader(security, { shares: 10 });
    await expect(
      h.ownerPool.query(
        'INSERT INTO holdings (account_id, security_id, quantity) VALUES ($1, $2, 5)',
        [trader.accountId, security.id]
      )
    ).rejects.toMatchObject({ code: '23505' });
  });

  it('refuses orders whose quantities or status do not add up', async () => {
    const security = await h.createSecurity();
    const trader = await h.createTrader(security);

    // remaining above quantity
    await expect(rawOrder(trader, { quantity: 10, remaining: 11 })).rejects.toMatchObject({ code: '23514' });
    // negative remaining
    await expect(rawOrder(trader, { quantity: 10, remaining: -1, status: 'partial' })).rejects.toMatchObject({ code: '23514' });
    // "filled" but shares still remaining
    await expect(rawOrder(trader, { quantity: 10, remaining: 3, status: 'filled' })).rejects.toMatchObject({ code: '23514' });
    // "open" but partly executed
    await expect(rawOrder(trader, { quantity: 10, remaining: 5, status: 'open' })).rejects.toMatchObject({ code: '23514' });
    // "partial" with nothing remaining
    await expect(rawOrder(trader, { quantity: 10, remaining: 0, status: 'partial' })).rejects.toMatchObject({ code: '23514' });
    // price of zero
    await expect(rawOrder(trader, { price: 0 })).rejects.toMatchObject({ code: '23514' });
    // unknown side
    await expect(rawOrder(trader, { side: 'hold' })).rejects.toMatchObject({ code: '23514' });
  });

  it('accepts a correct order (the control case)', async () => {
    const security = await h.createSecurity();
    const trader = await h.createTrader(security);
    const result = await rawOrder(trader, { quantity: 10, remaining: 4, status: 'partial' });
    expect(result.rowCount).toBe(1);
  });

  it('refuses a trade of quantity 0 and a trade of an order with itself', async () => {
    const fixture = await createTradeFixture();

    await expect(
      h.ownerPool.query(
        `INSERT INTO trades (security_id, buy_order_id, sell_order_id, executed_price, executed_quantity)
         VALUES ($1, $2, $3, 100.00, 0)`,
        [fixture.security.id, fixture.buyId, fixture.sellId]
      )
    ).rejects.toMatchObject({ code: '23514' });

    await expect(
      h.ownerPool.query(
        `INSERT INTO trades (security_id, buy_order_id, sell_order_id, executed_price, executed_quantity)
         VALUES ($1, $2, $2, 100.00, 5)`,
        [fixture.security.id, fixture.buyId]
      )
    ).rejects.toMatchObject({ code: '23514' });
  });
});

describe('Trades are append-only', () => {
  it('the trigger blocks UPDATE, DELETE and TRUNCATE even for the database owner', async () => {
    const fixture = await createTradeFixture();

    await expect(
      h.ownerPool.query('UPDATE trades SET executed_quantity = 9 WHERE id = $1', [fixture.tradeId])
    ).rejects.toMatchObject({ code: 'P0001' });

    await expect(
      h.ownerPool.query('DELETE FROM trades WHERE id = $1', [fixture.tradeId])
    ).rejects.toMatchObject({ code: 'P0001' });

    await expect(h.ownerPool.query('TRUNCATE trades')).rejects.toMatchObject({ code: 'P0001' });

    // The trade is still there, unchanged.
    const rows = await h.fetchTrades(fixture.security.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].executed_quantity).toBe(5);
  });

  it('the limited app_user gets "permission denied" (the screenshot-worthy error)', async () => {
    const fixture = await createTradeFixture();

    const appUser = new Client({ connectionString: process.env.APP_DATABASE_URL });
    await appUser.connect();
    try {
      await expect(
        appUser.query('UPDATE trades SET executed_quantity = 1 WHERE id = $1', [fixture.tradeId])
      ).rejects.toMatchObject({ code: '42501' });

      await expect(
        appUser.query('DELETE FROM trades WHERE id = $1', [fixture.tradeId])
      ).rejects.toMatchObject({ code: '42501' });

      await expect(appUser.query('TRUNCATE trades')).rejects.toMatchObject({ code: '42501' });

      // Orders can never be deleted either.
      await expect(
        appUser.query('DELETE FROM orders WHERE id = $1', [fixture.buyId])
      ).rejects.toMatchObject({ code: '42501' });
    } finally {
      await appUser.end();
    }
  });
});