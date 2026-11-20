import { createRequire } from 'node:module';
import { describe, it, expect, afterAll } from 'vitest';

const require = createRequire(import.meta.url);
const h = require('../helpers');

afterAll(() => h.closeAll());

describe('No match', () => {
  it('buy 10 @ 100 and sell 10 @ 101: no trade, both stay open', async () => {
    const security = await h.createSecurity();
    const buyer = await h.createTrader(security);
    const seller = await h.createTrader(security);
    const traders = [buyer, seller];

    const buy = await h.place(buyer, 'buy', '100.00', 10);
    const sell = await h.place(seller, 'sell', '101.00', 10);

    expect(buy.trades).toHaveLength(0);
    expect(sell.trades).toHaveLength(0);

    const buyRow = await h.fetchOrder(buy.order.id);
    const sellRow = await h.fetchOrder(sell.order.id);
    expect(buyRow.status).toBe('open');
    expect(buyRow.remaining_quantity).toBe(10);
    expect(sellRow.status).toBe('open');
    expect(sellRow.remaining_quantity).toBe(10);

    expect(await h.fetchTrades(security.id)).toHaveLength(0);

    const book = await h.orderbookService.getOrderBook(security.symbol);
    expect(book.bids).toEqual([{ price: '100.00', quantity: 10, orders: 1 }]);
    expect(book.asks).toEqual([{ price: '101.00', quantity: 10, orders: 1 }]);

    // The buyer's money and the seller's shares are set aside.
    const account = await h.fetchAccount(buyer.accountId);
    expect(account.reserved_balance).toBe('1000.00');
    expect(account.cash_balance).toBe('1000000.00');

    expect(
      await h.checkInvariants({
        securityId: security.id,
        accountIds: traders.map((t) => t.accountId),
      })
    ).toEqual([]);
    expect(await h.checkLedger({ securityId: security.id, traders })).toEqual([]);
  });

  it('boundary: a buy and a sell at exactly the same price DO match', async () => {
    const security = await h.createSecurity();
    const buyer = await h.createTrader(security);
    const seller = await h.createTrader(security);

    await h.place(buyer, 'buy', '100.00', 10);
    const sell = await h.place(seller, 'sell', '100.00', 10);

    expect(sell.trades).toHaveLength(1);
    expect(sell.order.status).toBe('filled');
  });

  it('boundary: one paisa apart (buy 99.99, sell 100.00) does NOT match', async () => {
    const security = await h.createSecurity();
    const buyer = await h.createTrader(security);
    const seller = await h.createTrader(security);

    await h.place(buyer, 'buy', '99.99', 10);
    const sell = await h.place(seller, 'sell', '100.00', 10);

    expect(sell.trades).toHaveLength(0);
    expect(await h.fetchTrades(security.id)).toHaveLength(0);
  });
});