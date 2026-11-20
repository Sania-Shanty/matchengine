import { createRequire } from 'node:module';
import { describe, it, expect, afterAll } from 'vitest';

const require = createRequire(import.meta.url);
const h = require('../helpers');

afterAll(() => h.closeAll());

describe('Funds and share reservation', () => {
  it('10 simultaneous buys of Rs. 1000 each against Rs. 1000 of cash: only 1 is accepted', async () => {
    const security = await h.createSecurity();
    const buyer = await h.createTrader(security, { cash: '1000.00', shares: 0 });

    const settled = await Promise.allSettled(
      Array.from({ length: 10 }, () => h.place(buyer, 'buy', '100.00', 10))
    );

    const accepted = settled.filter((s) => s.status === 'fulfilled');
    const refused = settled.filter((s) => s.status === 'rejected');

    expect(accepted).toHaveLength(1);
    expect(refused).toHaveLength(9);
    for (const r of refused) {
      expect(r.reason.code).toBe('INSUFFICIENT_FUNDS');
    }

    const account = await h.fetchAccount(buyer.accountId);
    expect(account.reserved_balance).toBe('1000.00'); // exactly one order's worth
    expect(account.cash_balance).toBe('1000.00');
    expect(await h.countOrders(security.id)).toBe(1); // refused orders left no trace
  });

  it('selling the same 100 shares five times at once: only 1 sell is accepted', async () => {
    const security = await h.createSecurity();
    const seller = await h.createTrader(security, { shares: 100 });

    const settled = await Promise.allSettled(
      Array.from({ length: 5 }, () => h.place(seller, 'sell', '100.00', 100))
    );

    expect(settled.filter((s) => s.status === 'fulfilled')).toHaveLength(1);
    const refused = settled.filter((s) => s.status === 'rejected');
    expect(refused).toHaveLength(4);
    for (const r of refused) {
      expect(r.reason.code).toBe('INSUFFICIENT_SHARES');
    }

    const holding = await h.fetchHolding(seller.accountId, security.id);
    expect(holding.quantity).toBe(100);
    expect(holding.reserved_quantity).toBe(100);
  });

  it('reserved cash cannot be spent a second time', async () => {
    const security = await h.createSecurity();
    const buyer = await h.createTrader(security, { cash: '1000.00', shares: 0 });

    await h.place(buyer, 'buy', '100.00', 10); // reserves all 1000.00

    await expect(h.place(buyer, 'buy', '1.00', 1)).rejects.toMatchObject({
      code: 'INSUFFICIENT_FUNDS',
    });
  });

  it('a trader who owns no shares cannot sell', async () => {
    const security = await h.createSecurity();
    const nobody = await h.createTrader(security, { shares: 0 });

    await expect(h.place(nobody, 'sell', '100.00', 1)).rejects.toMatchObject({
      code: 'INSUFFICIENT_SHARES',
    });
  });

  it('trading at a better price releases the unused reservation', async () => {
    const security = await h.createSecurity();
    const buyer = await h.createTrader(security, { cash: '1000.00', shares: 0 });
    const seller = await h.createTrader(security);
    const traders = [buyer, seller];

    await h.place(seller, 'sell', '99.00', 10);
    const buy = await h.place(buyer, 'buy', '100.00', 10); // willing to pay 1000.00

    expect(buy.trades[0].price).toBe('99.00'); // pays only 990.00

    const account = await h.fetchAccount(buyer.accountId);
    expect(account.cash_balance).toBe('10.00');
    expect(account.reserved_balance).toBe('0.00'); // nothing left locked up

    // The buyer had no holding row at all; one was created by the trade.
    const holding = await h.fetchHolding(buyer.accountId, security.id);
    expect(holding.quantity).toBe(10);

    expect(await h.checkLedger({ securityId: security.id, traders })).toEqual([]);
    expect(
      await h.checkInvariants({
        securityId: security.id,
        accountIds: traders.map((t) => t.accountId),
      })
    ).toEqual([]);
  });

  it('a completed sale uses up the sold shares and their reservation', async () => {
    const security = await h.createSecurity();
    const seller = await h.createTrader(security, { shares: 100 });
    const buyer = await h.createTrader(security);

    await h.place(seller, 'sell', '50.00', 100);
    await h.place(buyer, 'buy', '50.00', 100);

    const holding = await h.fetchHolding(seller.accountId, security.id);
    expect(holding.quantity).toBe(0);
    expect(holding.reserved_quantity).toBe(0);

    const account = await h.fetchAccount(seller.accountId);
    expect(account.cash_balance).toBe('1005000.00'); // 1,000,000 + 100 x 50
  });
});