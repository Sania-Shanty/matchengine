import { createRequire } from 'node:module';
import { describe, it, expect, afterAll } from 'vitest';

const require = createRequire(import.meta.url);
const h = require('../helpers');

afterAll(() => h.closeAll());

describe('Core concurrency: one buy, competing sells at the same instant', () => {
  it('two sells race for one buy: exactly one fills, the other stays open (25 rounds)', async () => {
    for (let round = 1; round <= 25; round += 1) {
      const security = await h.createSecurity();
      const buyer = await h.createTrader(security);
      const sellerOne = await h.createTrader(security);
      const sellerTwo = await h.createTrader(security);
      const traders = [buyer, sellerOne, sellerTwo];

      const buy = await h.place(buyer, 'buy', '100.00', 10);
      expect(buy.order.status).toBe('open');

      // Both sells are fired at the same instant.
      const [a, b] = await Promise.all([
        h.place(sellerOne, 'sell', '100.00', 10),
        h.place(sellerTwo, 'sell', '100.00', 10),
      ]);

      expect([a.order.status, b.order.status].sort(), `round ${round}`).toEqual(['filled', 'open']);

      const loser = a.order.status === 'open' ? a : b;
      expect(loser.order.remainingQuantity, `round ${round}`).toBe(10);
      expect(loser.trades, `round ${round}`).toHaveLength(0);

      const buyRow = await h.fetchOrder(buy.order.id);
      expect(buyRow.remaining_quantity, `round ${round}`).toBe(0); // never negative
      expect(buyRow.status, `round ${round}`).toBe('filled');

      const trades = await h.fetchTrades(security.id);
      expect(trades, `round ${round}`).toHaveLength(1); // matched exactly once
      expect(trades[0].executed_quantity).toBe(10);

      const problems = [
        ...(await h.checkInvariants({
          securityId: security.id,
          accountIds: traders.map((t) => t.accountId),
        })),
        ...(await h.checkLedger({ securityId: security.id, traders })),
      ];
      expect(problems, `round ${round}`).toEqual([]);
    }
  });

  it('eight sells race for one buy: exactly one fills, seven stay open', async () => {
    const security = await h.createSecurity();
    const buyer = await h.createTrader(security);
    const sellers = [];
    for (let i = 0; i < 8; i += 1) sellers.push(await h.createTrader(security));
    const traders = [buyer, ...sellers];

    const buy = await h.place(buyer, 'buy', '100.00', 10);

    const results = await Promise.all(sellers.map((s) => h.place(s, 'sell', '100.00', 10)));

    expect(results.filter((r) => r.order.status === 'filled')).toHaveLength(1);

    const open = results.filter((r) => r.order.status === 'open');
    expect(open).toHaveLength(7);
    for (const r of open) {
      expect(r.order.remainingQuantity).toBe(10);
      expect(r.trades).toHaveLength(0);
    }

    const buyRow = await h.fetchOrder(buy.order.id);
    expect(buyRow.remaining_quantity).toBe(0);
    expect(await h.fetchTrades(security.id)).toHaveLength(1);

    expect(
      await h.checkInvariants({
        securityId: security.id,
        accountIds: traders.map((t) => t.accountId),
      })
    ).toEqual([]);
    expect(await h.checkLedger({ securityId: security.id, traders })).toEqual([]);
  });

  it('the mirror image: two buys race for one sell', async () => {
    for (let round = 1; round <= 10; round += 1) {
      const security = await h.createSecurity();
      const seller = await h.createTrader(security);
      const buyerOne = await h.createTrader(security);
      const buyerTwo = await h.createTrader(security);
      const traders = [seller, buyerOne, buyerTwo];

      const sell = await h.place(seller, 'sell', '100.00', 10);

      const [a, b] = await Promise.all([
        h.place(buyerOne, 'buy', '100.00', 10),
        h.place(buyerTwo, 'buy', '100.00', 10),
      ]);

      expect([a.order.status, b.order.status].sort(), `round ${round}`).toEqual(['filled', 'open']);

      const sellRow = await h.fetchOrder(sell.order.id);
      expect(sellRow.remaining_quantity).toBe(0);
      expect(await h.fetchTrades(security.id)).toHaveLength(1);

      expect(
        await h.checkInvariants({
          securityId: security.id,
          accountIds: traders.map((t) => t.accountId),
        }),
        `round ${round}`
      ).toEqual([]);
    }
  });
});