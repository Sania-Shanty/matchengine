import { createRequire } from 'node:module';
import { describe, it, expect, afterAll } from 'vitest';

const require = createRequire(import.meta.url);
const h = require('../helpers');

afterAll(() => h.closeAll());

describe('Self-trade prevention', () => {
  it('selling into your own resting buy is refused and leaves nothing behind', async () => {
    const security = await h.createSecurity();
    const alice = await h.createTrader(security);

    const buy = await h.place(alice, 'buy', '100.00', 10);

    await expect(h.place(alice, 'sell', '100.00', 10)).rejects.toMatchObject({
      code: 'SELF_TRADE',
    });

    // The book is unchanged.
    const buyRow = await h.fetchOrder(buy.order.id);
    expect(buyRow.status).toBe('open');
    expect(buyRow.remaining_quantity).toBe(10);
    expect(await h.countOrders(security.id)).toBe(1);
    expect(await h.fetchTrades(security.id)).toHaveLength(0);

    // The refused sell did not keep its share reservation.
    const holding = await h.fetchHolding(alice.accountId, security.id);
    expect(holding.reserved_quantity).toBe(0);
  });

  it('is all-or-nothing: trades made before reaching your own order are undone', async () => {
    const security = await h.createSecurity();
    const alice = await h.createTrader(security);
    const bob = await h.createTrader(security);

    const bobSell = await h.place(bob, 'sell', '99.00', 5); // best price
    await h.place(alice, 'sell', '100.00', 5); // alice's own order, next in line

    // Alice buys 10: she would trade with Bob first, then hit her own order.
    await expect(h.place(alice, 'buy', '100.00', 10)).rejects.toMatchObject({
      code: 'SELF_TRADE',
    });

    const bobRow = await h.fetchOrder(bobSell.order.id);
    expect(bobRow.status).toBe('open'); // Bob's order was not touched
    expect(bobRow.remaining_quantity).toBe(5);
    expect(await h.fetchTrades(security.id)).toHaveLength(0);

    const account = await h.fetchAccount(alice.accountId);
    expect(account.cash_balance).toBe('1000000.00');
    expect(account.reserved_balance).toBe('0.00');

    expect(
      await h.checkInvariants({
        securityId: security.id,
        accountIds: [alice.accountId, bob.accountId],
      })
    ).toEqual([]);
  });

  it('is allowed when the order fills completely before reaching your own order', async () => {
    const security = await h.createSecurity();
    const alice = await h.createTrader(security);
    const bob = await h.createTrader(security);

    await h.place(bob, 'sell', '99.00', 5);
    const aliceSell = await h.place(alice, 'sell', '100.00', 5);

    const buy = await h.place(alice, 'buy', '100.00', 5); // Bob's 5 covers it all

    expect(buy.order.status).toBe('filled');
    expect(buy.trades).toHaveLength(1);
    expect(buy.trades[0].price).toBe('99.00');

    const aliceSellRow = await h.fetchOrder(aliceSell.order.id);
    expect(aliceSellRow.status).toBe('open'); // her own order was never touched
  });
});