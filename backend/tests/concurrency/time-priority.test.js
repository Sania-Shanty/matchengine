import { createRequire } from 'node:module';
import { describe, it, expect, afterAll } from 'vitest';

const require = createRequire(import.meta.url);
const h = require('../helpers');

afterAll(() => h.closeAll());

describe('Time priority at the same price', () => {
  it('the earlier sell fills first: A fills 6, B fills 4 and keeps 2', async () => {
    const security = await h.createSecurity();
    const buyer = await h.createTrader(security);
    const sellerA = await h.createTrader(security);
    const sellerB = await h.createTrader(security);
    const traders = [buyer, sellerA, sellerB];

    const sellA = await h.place(sellerA, 'sell', '99.00', 6); // first
    const sellB = await h.place(sellerB, 'sell', '99.00', 6); // second, same price

    const buy = await h.place(buyer, 'buy', '100.00', 10);

    expect(buy.trades).toHaveLength(2);
    expect(buy.trades[0].sellOrderId).toBe(sellA.order.id);
    expect(buy.trades[0].quantity).toBe(6);
    expect(buy.trades[1].sellOrderId).toBe(sellB.order.id);
    expect(buy.trades[1].quantity).toBe(4);

    const aRow = await h.fetchOrder(sellA.order.id);
    const bRow = await h.fetchOrder(sellB.order.id);
    expect(aRow.status).toBe('filled');
    expect(bRow.status).toBe('partial');
    expect(bRow.remaining_quantity).toBe(2);

    expect(
      await h.checkInvariants({
        securityId: security.id,
        accountIds: traders.map((t) => t.accountId),
      })
    ).toEqual([]);
    expect(await h.checkLedger({ securityId: security.id, traders })).toEqual([]);
  });

  it('even with IDENTICAL timestamps, the lower order id goes first', async () => {
    const security = await h.createSecurity();
    const buyer = await h.createTrader(security);
    const sellerX = await h.createTrader(security);
    const sellerY = await h.createTrader(security);
    const traders = [buyer, sellerX, sellerY];

    // Two sell orders created in "the same millisecond" (exactly equal created_at).
    const sameMoment = new Date(Date.now() - 60000).toISOString();
    const xId = await h.insertRestingOrder(sellerX, {
      side: 'sell',
      price: '99.00',
      quantity: 6,
      createdAt: sameMoment,
    });
    const yId = await h.insertRestingOrder(sellerY, {
      side: 'sell',
      price: '99.00',
      quantity: 6,
      createdAt: sameMoment,
    });

    const buy = await h.place(buyer, 'buy', '100.00', 6);

    expect(buy.trades).toHaveLength(1);
    expect(buy.trades[0].sellOrderId).toBe(xId); // lower id wins the tie
    expect(buy.trades[0].sellOrderId).not.toBe(yId);

    const yRow = await h.fetchOrder(yId);
    expect(yRow.status).toBe('open');
    expect(yRow.remaining_quantity).toBe(6);

    expect(
      await h.checkInvariants({
        securityId: security.id,
        accountIds: traders.map((t) => t.accountId),
      })
    ).toEqual([]);
  });
});