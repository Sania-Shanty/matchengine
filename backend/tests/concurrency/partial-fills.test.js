import { createRequire } from 'node:module';
import { describe, it, expect, afterAll } from 'vitest';

const require = createRequire(import.meta.url);
const h = require('../helpers');

afterAll(() => h.closeAll());

describe('Partial fills: buy 10, two sells of 6', () => {
  it('in order: sell A fills 6, sell B fills 4 and keeps 2 open', async () => {
    const security = await h.createSecurity();
    const buyer = await h.createTrader(security);
    const sellerA = await h.createTrader(security);
    const sellerB = await h.createTrader(security);
    const traders = [buyer, sellerA, sellerB];

    const buy = await h.place(buyer, 'buy', '100.00', 10);
    const a = await h.place(sellerA, 'sell', '100.00', 6);
    const b = await h.place(sellerB, 'sell', '100.00', 6);

    expect(a.order.status).toBe('filled');
    expect(a.trades.map((t) => t.quantity)).toEqual([6]);

    expect(b.order.status).toBe('partial');
    expect(b.order.remainingQuantity).toBe(2);
    expect(b.trades.map((t) => t.quantity)).toEqual([4]);

    const buyRow = await h.fetchOrder(buy.order.id);
    expect(buyRow.status).toBe('filled');
    expect(buyRow.remaining_quantity).toBe(0);

    // The 2 unsold shares stay reserved for the leftover sell order.
    const holding = await h.fetchHolding(sellerB.accountId, security.id);
    expect(holding.reserved_quantity).toBe(2);
    expect(holding.quantity).toBe(996); // 1000 - 4 sold

    expect(
      await h.checkInvariants({
        securityId: security.id,
        accountIds: traders.map((t) => t.accountId),
      })
    ).toEqual([]);
    expect(await h.checkLedger({ securityId: security.id, traders })).toEqual([]);
  });

  it('at the same instant: one sell fills 6, the other fills 4 and keeps 2 (15 rounds)', async () => {
    for (let round = 1; round <= 15; round += 1) {
      const security = await h.createSecurity();
      const buyer = await h.createTrader(security);
      const sellerA = await h.createTrader(security);
      const sellerB = await h.createTrader(security);
      const traders = [buyer, sellerA, sellerB];

      const buy = await h.place(buyer, 'buy', '100.00', 10);

      const results = await Promise.all([
        h.place(sellerA, 'sell', '100.00', 6),
        h.place(sellerB, 'sell', '100.00', 6),
      ]);

      const filled = results.filter((r) => r.order.status === 'filled');
      const partial = results.filter((r) => r.order.status === 'partial');
      expect(filled, `round ${round}`).toHaveLength(1);
      expect(partial, `round ${round}`).toHaveLength(1);

      expect(filled[0].trades.map((t) => t.quantity), `round ${round}`).toEqual([6]);
      expect(partial[0].trades.map((t) => t.quantity), `round ${round}`).toEqual([4]);
      expect(partial[0].order.remainingQuantity, `round ${round}`).toBe(2);

      const buyRow = await h.fetchOrder(buy.order.id);
      expect(buyRow.status, `round ${round}`).toBe('filled');
      expect(buyRow.remaining_quantity, `round ${round}`).toBe(0);

      const trades = await h.fetchTrades(security.id);
      expect(trades, `round ${round}`).toHaveLength(2);
      expect(
        trades.reduce((sum, t) => sum + t.executed_quantity, 0),
        `round ${round}`
      ).toBe(10); // the buy filled exactly 10, never more

      expect(
        await h.checkInvariants({
          securityId: security.id,
          accountIds: traders.map((t) => t.accountId),
        }),
        `round ${round}`
      ).toEqual([]);
      expect(await h.checkLedger({ securityId: security.id, traders }), `round ${round}`).toEqual([]);
    }
  });
});