import { createRequire } from 'node:module';
import { describe, it, expect, afterAll } from 'vitest';

const require = createRequire(import.meta.url);
const h = require('../helpers');

afterAll(() => h.closeAll());

// The only reasons an order may be refused. Anything else is a bug.
const ALLOWED_REFUSALS = ['SELF_TRADE', 'INSUFFICIENT_FUNDS', 'INSUFFICIENT_SHARES'];

// A tiny seeded random generator, so a failing run can be repeated exactly.
function makeRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('Higher-volume concurrency across a shared book', () => {
  it('10 buys and 10 sells of 5 @ 100, all fired at once: every order ends up filled', async () => {
    const security = await h.createSecurity();
    const buyers = [];
    const sellers = [];
    for (let i = 0; i < 4; i += 1) {
      buyers.push(await h.createTrader(security));
      sellers.push(await h.createTrader(security));
    }
    const traders = [...buyers, ...sellers];

    const jobs = [];
    for (let i = 0; i < 10; i += 1) {
      jobs.push(h.place(buyers[i % 4], 'buy', '100.00', 5));
      jobs.push(h.place(sellers[i % 4], 'sell', '100.00', 5));
    }
    const results = await Promise.all(jobs); // 20 orders at the same instant

    // Every order was accepted. (A reply shows the order as it was when placed,
    // so an order that rested and was filled later still says "open" here.
    // The database below holds the final truth.)
    expect(results).toHaveLength(20);

    // Final state, read straight from the database.
    const finalOrders = await h.ownerPool.query(
      'SELECT status, remaining_quantity FROM orders WHERE security_id = $1',
      [security.id]
    );
    expect(finalOrders.rowCount).toBe(20);
    for (const row of finalOrders.rows) {
      expect(row.status).toBe('filled');
      expect(row.remaining_quantity).toBe(0);
    }
    expect(await h.fetchOpenOrders(security.id)).toEqual([]);

    const trades = await h.fetchTrades(security.id);
    expect(trades).toHaveLength(10);
    expect(trades.reduce((sum, t) => sum + t.executed_quantity, 0)).toBe(50);

    const book = await h.orderbookService.getOrderBook(security.symbol);
    expect(book.bids).toEqual([]);
    expect(book.asks).toEqual([]);

    expect(
      await h.checkInvariants({
        securityId: security.id,
        accountIds: traders.map((t) => t.accountId),
      })
    ).toEqual([]);
    expect(await h.checkLedger({ securityId: security.id, traders })).toEqual([]);
  });

  it('20 random orders at once, repeated 8 times: every invariant holds each time', async () => {
    const seed = Date.now();

    for (let round = 1; round <= 8; round += 1) {
      const random = makeRandom(seed + round);
      const label = `seed ${seed}, round ${round}`;

      const security = await h.createSecurity();
      const traders = [];
      for (let i = 0; i < 6; i += 1) traders.push(await h.createTrader(security));

      const jobs = [];
      for (let i = 0; i < 20; i += 1) {
        const trader = traders[Math.floor(random() * traders.length)];
        const side = random() < 0.5 ? 'buy' : 'sell';
        const price = String(99 + Math.floor(random() * 3)) + '.00'; // 99, 100 or 101
        const quantity = 1 + Math.floor(random() * 10);
        jobs.push(h.place(trader, side, price, quantity));
      }

      const settled = await Promise.allSettled(jobs);

      let accepted = 0;
      for (const outcome of settled) {
        if (outcome.status === 'fulfilled') {
          accepted += 1;
        } else {
          const code = outcome.reason && outcome.reason.code;
          expect(ALLOWED_REFUSALS, `${label}: unexpected failure ${outcome.reason}`).toContain(code);
        }
      }

      // Refused orders must leave no trace; accepted ones must all exist.
      expect(await h.countOrders(security.id), label).toBe(accepted);

      expect(
        await h.checkInvariants({
          securityId: security.id,
          accountIds: traders.map((t) => t.accountId),
        }),
        label
      ).toEqual([]);
      expect(await h.checkLedger({ securityId: security.id, traders }), label).toEqual([]);
    }
  });
});