import { createRequire } from 'node:module';
import { describe, it, expect, afterAll } from 'vitest';

const require = createRequire(import.meta.url);
const h = require('../helpers');

afterAll(() => h.closeAll());

describe('Price priority beats time priority', () => {
  it('a buy meets the CHEAPER sell first, even though it arrived later', async () => {
    const security = await h.createSecurity();
    const buyer = await h.createTrader(security);
    const sellerA = await h.createTrader(security);
    const sellerB = await h.createTrader(security);
    const traders = [buyer, sellerA, sellerB];

    const sellA = await h.place(sellerA, 'sell', '99.00', 5); // arrives first
    const sellB = await h.place(sellerB, 'sell', '98.00', 5); // arrives second, better price

    const buy = await h.place(buyer, 'buy', '100.00', 10);

    expect(buy.trades).toHaveLength(2);
    // Sell B (98) executes first, despite arriving later.
    expect(buy.trades[0].sellOrderId).toBe(sellB.order.id);
    expect(buy.trades[0].price).toBe('98.00');
    expect(buy.trades[0].quantity).toBe(5);
    expect(buy.trades[1].sellOrderId).toBe(sellA.order.id);
    expect(buy.trades[1].price).toBe('99.00');
    expect(buy.trades[1].quantity).toBe(5);

    expect(
      await h.checkInvariants({
        securityId: security.id,
        accountIds: traders.map((t) => t.accountId),
      })
    ).toEqual([]);
    expect(await h.checkLedger({ securityId: security.id, traders })).toEqual([]);
  });

  it('only as many sells as needed are used: the dearer sell stays untouched', async () => {
    const security = await h.createSecurity();
    const buyer = await h.createTrader(security);
    const sellerA = await h.createTrader(security);
    const sellerB = await h.createTrader(security);

    const sellA = await h.place(sellerA, 'sell', '99.00', 5);
    await h.place(sellerB, 'sell', '98.00', 5);

    const buy = await h.place(buyer, 'buy', '100.00', 5);

    expect(buy.trades).toHaveLength(1);
    expect(buy.trades[0].price).toBe('98.00');

    const untouched = await h.fetchOrder(sellA.order.id);
    expect(untouched.status).toBe('open');
    expect(untouched.remaining_quantity).toBe(5);
  });

  it('the mirror image: a sell meets the HIGHER bid first', async () => {
    const security = await h.createSecurity();
    const seller = await h.createTrader(security);
    const buyerA = await h.createTrader(security);
    const buyerB = await h.createTrader(security);
    const traders = [seller, buyerA, buyerB];

    const buyA = await h.place(buyerA, 'buy', '100.00', 5); // arrives first
    const buyB = await h.place(buyerB, 'buy', '101.00', 5); // arrives second, better price

    const sell = await h.place(seller, 'sell', '99.00', 10);

    expect(sell.trades).toHaveLength(2);
    expect(sell.trades[0].buyOrderId).toBe(buyB.order.id);
    expect(sell.trades[0].price).toBe('101.00'); // the resting order's price
    expect(sell.trades[1].buyOrderId).toBe(buyA.order.id);
    expect(sell.trades[1].price).toBe('100.00');

    expect(
      await h.checkInvariants({
        securityId: security.id,
        accountIds: traders.map((t) => t.accountId),
      })
    ).toEqual([]);
    expect(await h.checkLedger({ securityId: security.id, traders })).toEqual([]);
  });
});