import { createRequire } from 'node:module';
import { describe, it, expect, afterAll } from 'vitest';
import * as fc from 'fast-check';

const require = createRequire(import.meta.url);
const h = require('../helpers');

afterAll(() => h.closeAll());

// How many random sequences to try. Raise it for a deeper (slower) check:
//   PowerShell:  $env:PROP_RUNS=1000; npm run test:property
const RUNS = Number(process.env.PROP_RUNS) || 40;
const LONG_TIMEOUT = 15 * 60 * 1000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// 9950 paise -> "99.50"
function paiseToText(paise) {
  return `${Math.floor(paise / 100)}.${String(paise % 100).padStart(2, '0')}`;
}

// A random order: who, buy/sell, price (Rs. 95.00 to Rs. 105.00 in 25-paise steps), quantity.
const commandArb = fc.record({
  trader: fc.integer({ min: 0, max: 3 }),
  side: fc.constantFrom('buy', 'sell'),
  pricePaise: fc.integer({ min: 380, max: 420 }).map((n) => n * 25),
  quantity: fc.integer({ min: 1, max: 20 }),
});

// A fresh security with 4 well-funded traders (funds never run out in these tests).
async function buildWorld() {
  const security = await h.createSecurity();
  const traders = [];
  for (let i = 0; i < 4; i += 1) {
    traders.push(await h.createTrader(security, { cash: '10000000.00', shares: 100000 }));
  }
  return { security, traders, accountIds: traders.map((t) => t.accountId) };
}

// ---------------------------------------------------------------------------
// The reference model: price-time priority in about 30 plain lines.
// If this and the real engine ever disagree, one of them is wrong.
// ---------------------------------------------------------------------------
function simulate(commands) {
  const book = []; // resting orders: { seq, trader, side, price, remaining }
  const outcomes = [];

  commands.forEach((cmd, seq) => {
    const candidates = book
      .filter(
        (o) =>
          o.side !== cmd.side &&
          o.remaining > 0 &&
          (cmd.side === 'buy' ? o.price <= cmd.pricePaise : o.price >= cmd.pricePaise)
      )
      .sort((a, b) =>
        cmd.side === 'buy'
          ? a.price - b.price || a.seq - b.seq // cheapest sell first, then oldest
          : b.price - a.price || a.seq - b.seq // highest buy first, then oldest
      );

    let remaining = cmd.quantity;
    const fills = [];
    let rejected = false;

    for (const resting of candidates) {
      if (remaining === 0) break;
      if (resting.trader === cmd.trader) {
        rejected = true; // would trade with your own order: refuse the whole order
        break;
      }
      const quantity = Math.min(remaining, resting.remaining);
      fills.push({ restingSeq: resting.seq, price: resting.price, quantity });
      remaining -= quantity;
    }

    if (rejected) {
      outcomes.push({ rejected: true });
      return;
    }

    for (const fill of fills) {
      book.find((o) => o.seq === fill.restingSeq).remaining -= fill.quantity;
    }
    if (remaining > 0) {
      book.push({
        seq,
        trader: cmd.trader,
        side: cmd.side,
        price: cmd.pricePaise,
        remaining,
      });
    }
    outcomes.push({ rejected: false, fills });
  });

  return { outcomes, book };
}

// ---------------------------------------------------------------------------
// Property 1: the real engine matches the model, one order at a time
// ---------------------------------------------------------------------------
describe('Property-based tests', () => {
  it(
    `the engine agrees with the reference model on ${RUNS} random order sequences`,
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(commandArb, { minLength: 1, maxLength: 25 }),
          async (commands) => {
            const world = await buildWorld();
            const expected = simulate(commands);
            const idToSeq = new Map();

            for (let seq = 0; seq < commands.length; seq += 1) {
              const cmd = commands[seq];
              const trader = world.traders[cmd.trader];
              const want = expected.outcomes[seq];

              let result = null;
              let refusalCode = null;
              try {
                result = await h.place(trader, cmd.side, paiseToText(cmd.pricePaise), cmd.quantity);
              } catch (error) {
                refusalCode = error.code || String(error);
              }

              if (want.rejected) {
                expect(refusalCode, `order #${seq} should be refused as SELF_TRADE`).toBe(
                  'SELF_TRADE'
                );
                continue;
              }

              expect(refusalCode, `order #${seq} was refused unexpectedly`).toBeNull();
              idToSeq.set(result.order.id, seq);

              const got = result.trades.map((t) => ({
                restingSeq: idToSeq.get(cmd.side === 'buy' ? t.sellOrderId : t.buyOrderId),
                price: t.price,
                quantity: t.quantity,
              }));
              const wanted = want.fills.map((f) => ({
                restingSeq: f.restingSeq,
                price: paiseToText(f.price),
                quantity: f.quantity,
              }));
              expect(got, `trades for order #${seq}`).toEqual(wanted);
            }

            // The leftover order book must match the model's.
            const openRows = await h.fetchOpenOrders(world.security.id);
            const actualBook = openRows
              .map((row) => ({ seq: idToSeq.get(row.id), remaining: row.remaining_quantity }))
              .sort((a, b) => a.seq - b.seq);
            const wantedBook = expected.book
              .filter((o) => o.remaining > 0)
              .map((o) => ({ seq: o.seq, remaining: o.remaining }))
              .sort((a, b) => a.seq - b.seq);
            expect(actualBook, 'orders left on the book').toEqual(wantedBook);

            // And every invariant must hold.
            expect(
              await h.checkInvariants({
                securityId: world.security.id,
                accountIds: world.accountIds,
              })
            ).toEqual([]);
            expect(
              await h.checkLedger({ securityId: world.security.id, traders: world.traders })
            ).toEqual([]);
          }
        ),
        { numRuns: RUNS }
      );
    },
    LONG_TIMEOUT
  );

  // -------------------------------------------------------------------------
  // Property 2: random orders fired AT ONCE still keep every invariant
  // -------------------------------------------------------------------------
  it(
    'random concurrent batches never break an invariant',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(commandArb, { minLength: 2, maxLength: 12 }),
          async (commands) => {
            const world = await buildWorld();

            const settled = await Promise.allSettled(
              commands.map((cmd) =>
                h.place(world.traders[cmd.trader], cmd.side, paiseToText(cmd.pricePaise), cmd.quantity)
              )
            );

            let accepted = 0;
            for (const outcome of settled) {
              if (outcome.status === 'fulfilled') {
                accepted += 1;
              } else {
                // Only a clean business refusal is allowed. No database errors.
                expect(
                  ['SELF_TRADE', 'INSUFFICIENT_FUNDS', 'INSUFFICIENT_SHARES'],
                  `unexpected failure: ${outcome.reason}`
                ).toContain(outcome.reason && outcome.reason.code);
              }
            }

            expect(await h.countOrders(world.security.id)).toBe(accepted);
            expect(
              await h.checkInvariants({
                securityId: world.security.id,
                accountIds: world.accountIds,
              })
            ).toEqual([]);
            expect(
              await h.checkLedger({ securityId: world.security.id, traders: world.traders })
            ).toEqual([]);
          }
        ),
        { numRuns: Math.max(10, Math.floor(RUNS / 2)) }
      );
    },
    LONG_TIMEOUT
  );
});