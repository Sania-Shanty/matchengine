// Tests the matching engine end to end through the real API.
// Run it with:  npm run smoke3   (from inside the backend folder)
//
// It uses the TEST database only. It resets that database first,
// so your demo data in the main database is never touched.

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

if (!process.env.TEST_DATABASE_URL || !process.env.APP_DATABASE_URL) {
  console.error('TEST_DATABASE_URL and APP_DATABASE_URL must be set in your .env file.');
  process.exit(1);
}

// Point the backend (which connects as app_user) at the TEST database.
const testUrl = process.env.TEST_DATABASE_URL;
const appUrl = new URL(process.env.APP_DATABASE_URL);
appUrl.pathname = new URL(testUrl).pathname;
process.env.APP_DATABASE_URL = appUrl.toString();

const { Client } = require('pg');
const { resetTestDb } = require('../../database/scripts/reset_test_db');
const { seed } = require('../../database/scripts/seed');
const app = require('../src/app');
const pool = require('../src/db/pool');

let passed = 0;
let failed = 0;
let baseUrl = '';

async function call(method, urlPath, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(baseUrl + urlPath, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  let data = null;
  try {
    data = await response.json();
  } catch (error) {
    // some replies have no body
  }
  return { status: response.status, data };
}

function check(name, condition, detail) {
  if (condition) {
    console.log(`  PASS  ${name}`);
    passed += 1;
  } else {
    console.log(`  FAIL  ${name}${detail ? `  (${detail})` : ''}`);
    failed += 1;
  }
}

const place = (token, symbol, side, price, quantity) =>
  call('POST', '/api/orders', { symbol, side, price, quantity }, token);

async function login(email) {
  const r = await call('POST', '/api/auth/login', { email, password: 'password123' });
  return r.data.token;
}

async function account(token) {
  const r = await call('GET', '/api/account', null, token);
  return r.data.account;
}

async function holding(token, symbol) {
  const r = await call('GET', '/api/account/holdings', null, token);
  return r.data.holdings.find((h) => h.symbol === symbol);
}

async function getOrder(token, id) {
  const r = await call('GET', `/api/orders/${id}`, null, token);
  return r.data;
}

const toPaise = (text) => BigInt(text.replace('.', ''));

async function main() {
  console.log('Preparing a clean test database...');
  await resetTestDb();
  await seed(testUrl);

  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  // A separate owner connection, used only to inspect the database at the end.
  const owner = new Client({ connectionString: testUrl });
  await owner.connect();

  try {
    const alice = await login('alice@example.com');
    const bob = await login('bob@example.com');
    const carol = await login('carol@example.com');
    const dave = await login('dave@example.com');
    const everyone = [alice, bob, carol, dave];

    // ------------------------------------------------------------------
    console.log('\nInput checks...');
    let r = await call('POST', '/api/orders', {
      symbol: 'TCS',
      side: 'buy',
      price: 100,
      quantity: 1,
    });
    check('placing an order without logging in returns 401', r.status === 401);

    r = await place(alice, 'TCS', 'hold', 100, 10);
    check('an invalid side returns 400', r.status === 400);

    r = await place(alice, 'TCS', 'buy', '100.123', 10);
    check('a price with 3 decimals returns 400', r.status === 400);

    r = await place(alice, 'TCS', 'buy', 100, 0);
    check('a quantity of 0 returns 400', r.status === 400);

    r = await place(alice, 'NOPE', 'buy', 100, 10);
    check('an unknown security returns 404', r.status === 404);

    // ------------------------------------------------------------------
    console.log('\nNo match: buy 10 @ 100 and sell 10 @ 101 (INFY)...');
    const aliceInfy = await place(alice, 'INFY', 'buy', '100.00', 10);
    const bobInfy = await place(bob, 'INFY', 'sell', '101.00', 10);

    check(
      "alice's buy rests as open with no trades",
      aliceInfy.status === 201 &&
        aliceInfy.data.order.status === 'open' &&
        aliceInfy.data.trades.length === 0,
      JSON.stringify(aliceInfy.data)
    );
    check(
      "bob's sell rests as open with no trades",
      bobInfy.status === 201 &&
        bobInfy.data.order.status === 'open' &&
        bobInfy.data.trades.length === 0,
      JSON.stringify(bobInfy.data)
    );

    let book = await call('GET', '/api/orderbook/INFY');
    check(
      'the order book shows one bid at 100.00 and one ask at 101.00',
      book.status === 200 &&
        book.data.bids.length === 1 &&
        book.data.bids[0].price === '100.00' &&
        book.data.bids[0].quantity === 10 &&
        book.data.asks.length === 1 &&
        book.data.asks[0].price === '101.00' &&
        book.data.asks[0].quantity === 10,
      JSON.stringify(book.data)
    );

    let acc = await account(alice);
    check(
      "alice's buy reserved Rs. 1000.00 (available 999000.00)",
      acc.reservedBalance === '1000.00' && acc.availableBalance === '999000.00',
      JSON.stringify(acc)
    );

    let h = await holding(bob, 'INFY');
    check(
      "bob's sell reserved 10 shares (990 available)",
      h.reservedQuantity === 10 && h.availableQuantity === 990,
      JSON.stringify(h)
    );

    // ------------------------------------------------------------------
    console.log('\nExact match: buy 10 @ 100 meets sell 10 @ 100 (TCS)...');
    const aliceTcs = await place(alice, 'TCS', 'buy', '100.00', 10);
    const bobTcs = await place(bob, 'TCS', 'sell', '100.00', 10);

    check(
      'the sell fills completely with one trade of 10 @ 100.00',
      bobTcs.data.order.status === 'filled' &&
        bobTcs.data.trades.length === 1 &&
        bobTcs.data.trades[0].quantity === 10 &&
        bobTcs.data.trades[0].price === '100.00',
      JSON.stringify(bobTcs.data)
    );

    const aliceTcsOrder = await getOrder(alice, aliceTcs.data.order.id);
    check(
      "alice's resting buy is now filled with 0 remaining",
      aliceTcsOrder.order.status === 'filled' &&
        aliceTcsOrder.order.remainingQuantity === 0 &&
        aliceTcsOrder.trades.length === 1,
      JSON.stringify(aliceTcsOrder)
    );

    const aliceTcsHolding = await holding(alice, 'TCS');
    const bobTcsHolding = await holding(bob, 'TCS');
    check(
      'the buyer gained 10 shares and the seller lost 10',
      aliceTcsHolding.quantity === 1010 &&
        bobTcsHolding.quantity === 990 &&
        bobTcsHolding.reservedQuantity === 0,
      `${aliceTcsHolding.quantity} / ${bobTcsHolding.quantity}`
    );

    acc = await account(bob);
    check('the seller received Rs. 1000.00', acc.cashBalance === '1001000.00', acc.cashBalance);

    // ------------------------------------------------------------------
    console.log('\nTrades happen at the resting price (RELIANCE)...');
    await place(bob, 'RELIANCE', 'sell', '99.00', 10);
    const r4 = await place(alice, 'RELIANCE', 'buy', '100.00', 10);
    check(
      'buy @ 100 against a resting sell @ 99 trades at 99.00',
      r4.data.order.status === 'filled' &&
        r4.data.trades.length === 1 &&
        r4.data.trades[0].price === '99.00',
      JSON.stringify(r4.data)
    );

    acc = await account(alice);
    check(
      'the buyer paid 990.00 and the unused reservation was released',
      acc.cashBalance === '998010.00' && acc.reservedBalance === '1000.00',
      JSON.stringify(acc)
    );

    // ------------------------------------------------------------------
    console.log('\nPartial fills: buy 10, sell 6 then sell 6 (HDFCBANK)...');
    const buy5 = await place(alice, 'HDFCBANK', 'buy', '100.00', 10);
    const sellA = await place(bob, 'HDFCBANK', 'sell', '100.00', 6);
    const sellB = await place(carol, 'HDFCBANK', 'sell', '100.00', 6);

    check(
      'sell A fills 6 and is filled',
      sellA.data.order.status === 'filled' && sellA.data.trades[0].quantity === 6,
      JSON.stringify(sellA.data)
    );
    check(
      'sell B fills 4 and keeps 2 open as partial',
      sellB.data.order.status === 'partial' &&
        sellB.data.order.remainingQuantity === 2 &&
        sellB.data.trades[0].quantity === 4,
      JSON.stringify(sellB.data)
    );

    const buy5Order = await getOrder(alice, buy5.data.order.id);
    check(
      'the buy filled exactly 10 across two trades',
      buy5Order.order.status === 'filled' &&
        buy5Order.order.remainingQuantity === 0 &&
        buy5Order.trades.length === 2 &&
        buy5Order.trades.reduce((sum, t) => sum + t.quantity, 0) === 10,
      JSON.stringify(buy5Order)
    );

    // ------------------------------------------------------------------
    console.log('\nPrice priority beats time priority (ITC)...');
    await place(bob, 'ITC', 'sell', '99.00', 5); // arrives first
    await place(carol, 'ITC', 'sell', '98.00', 5); // arrives second, better price
    const r6 = await place(alice, 'ITC', 'buy', '100.00', 10);
    check(
      'the cheaper sell (98) executes first, then the 99 one',
      r6.data.trades.length === 2 &&
        r6.data.trades[0].price === '98.00' &&
        r6.data.trades[0].quantity === 5 &&
        r6.data.trades[1].price === '99.00' &&
        r6.data.trades[1].quantity === 5,
      JSON.stringify(r6.data.trades)
    );

    // ------------------------------------------------------------------
    console.log('\nTime priority at the same price (ITC)...');
    const timeA = await place(bob, 'ITC', 'sell', '99.00', 6);
    const timeB = await place(carol, 'ITC', 'sell', '99.00', 6);
    const r7 = await place(dave, 'ITC', 'buy', '100.00', 6);
    check(
      'the earlier sell at the same price is the one that trades',
      r7.data.trades.length === 1 &&
        r7.data.trades[0].sellOrderId === timeA.data.order.id &&
        r7.data.trades[0].price === '99.00',
      JSON.stringify(r7.data.trades)
    );

    const timeBOrder = await getOrder(carol, timeB.data.order.id);
    check(
      'the later sell is untouched: open with all 6 remaining',
      timeBOrder.order.status === 'open' && timeBOrder.order.remainingQuantity === 6,
      JSON.stringify(timeBOrder.order)
    );

    // ------------------------------------------------------------------
    console.log('\nRejected orders change nothing...');
    r = await place(dave, 'INFY', 'buy', '1000.00', 5000);
    check(
      'a buy costing more than the available cash is refused (INSUFFICIENT_FUNDS)',
      r.status === 409 && r.data.error.code === 'INSUFFICIENT_FUNDS',
      JSON.stringify(r.data)
    );

    r = await place(dave, 'TCS', 'sell', '100.00', 5000);
    check(
      'selling more shares than owned is refused (INSUFFICIENT_SHARES)',
      r.status === 409 && r.data.error.code === 'INSUFFICIENT_SHARES',
      JSON.stringify(r.data)
    );

    r = await place(alice, 'INFY', 'sell', '100.00', 5);
    check(
      'an order that would trade with your own order is refused (SELF_TRADE)',
      r.status === 409 && r.data.error.code === 'SELF_TRADE',
      JSON.stringify(r.data)
    );

    book = await call('GET', '/api/orderbook/INFY');
    check(
      'the refused self-trade left the INFY book unchanged',
      book.data.bids.length === 1 && book.data.bids[0].quantity === 10,
      JSON.stringify(book.data)
    );

    h = await holding(alice, 'INFY');
    check(
      'the refused self-trade released its share reservation (rolled back)',
      h.reservedQuantity === 0,
      JSON.stringify(h)
    );

    acc = await account(dave);
    check(
      "the refused buy left dave's reserved cash at 0.00",
      acc.reservedBalance === '0.00',
      JSON.stringify(acc)
    );

    r = await call('GET', `/api/orders/${aliceInfy.data.order.id}`, null, bob);
    check("reading someone else's order returns 404", r.status === 404);

    // ------------------------------------------------------------------
    console.log('\nCORE CONCURRENCY TEST: 1 buy, 2 competing sells at the same instant (TCS)...');
    const bigBuy = await place(alice, 'TCS', 'buy', '100.00', 10);
    let tape = await call('GET', '/api/trades/TCS?limit=200');
    const tradesBefore = tape.data.trades.length;

    const [sellOne, sellTwo] = await Promise.all([
      place(bob, 'TCS', 'sell', '100.00', 10),
      place(carol, 'TCS', 'sell', '100.00', 10),
    ]);

    const statuses = [sellOne.data.order.status, sellTwo.data.order.status].sort();
    check(
      'exactly one sell filled and the other stayed open',
      sellOne.status === 201 &&
        sellTwo.status === 201 &&
        statuses[0] === 'filled' &&
        statuses[1] === 'open',
      JSON.stringify(statuses)
    );

    const loser = sellOne.data.order.status === 'open' ? sellOne : sellTwo;
    check(
      'the losing sell is untouched: 10 remaining, no trades',
      loser.data.order.remainingQuantity === 10 && loser.data.trades.length === 0,
      JSON.stringify(loser.data)
    );

    const bigBuyOrder = await getOrder(alice, bigBuy.data.order.id);
    check(
      'the buy order ended with remaining quantity exactly 0 (never negative)',
      bigBuyOrder.order.status === 'filled' &&
        bigBuyOrder.order.remainingQuantity === 0 &&
        bigBuyOrder.trades.length === 1,
      JSON.stringify(bigBuyOrder)
    );

    tape = await call('GET', '/api/trades/TCS?limit=200');
    check(
      'exactly one new trade was recorded',
      tape.data.trades.length === tradesBefore + 1,
      `${tradesBefore} -> ${tape.data.trades.length}`
    );

    // ------------------------------------------------------------------
    console.log('\nHIGH-VOLUME CONCURRENCY: 20 orders at once (RELIANCE)...');

    async function totalCash() {
      let total = 0n;
      for (const token of everyone) {
        total += toPaise((await account(token)).cashBalance);
      }
      return total;
    }
    async function totalShares(symbol) {
      let total = 0;
      for (const token of everyone) {
        total += (await holding(token, symbol)).quantity;
      }
      return total;
    }

    const cashBefore = await totalCash();
    const sharesBefore = await totalShares('RELIANCE');

    const buyers = [alice, bob];
    const sellers = [carol, dave];
    const jobs = [];
    for (let i = 0; i < 10; i += 1) {
      jobs.push(place(buyers[i % 2], 'RELIANCE', 'buy', '100.00', 5));
      jobs.push(place(sellers[i % 2], 'RELIANCE', 'sell', '100.00', 5));
    }
    const results = await Promise.all(jobs);

    check(
      'all 20 concurrent orders were accepted (201)',
      results.every((x) => x.status === 201),
      results.map((x) => x.status).join(',')
    );

    book = await call('GET', '/api/orderbook/RELIANCE');
    check(
      'the RELIANCE book is empty (every buy found its sell)',
      book.data.bids.length === 0 && book.data.asks.length === 0,
      JSON.stringify(book.data)
    );

    let everyOrderFilled = true;
    for (const token of everyone) {
      const list = await call('GET', '/api/orders?symbol=RELIANCE', null, token);
      for (const o of list.data.orders) {
        if (o.status !== 'filled' || o.remainingQuantity !== 0) everyOrderFilled = false;
      }
    }
    check('every RELIANCE order is filled with 0 remaining', everyOrderFilled);

    tape = await call('GET', '/api/trades/RELIANCE?limit=200');
    const tapeQuantity = tape.data.trades.reduce((sum, t) => sum + t.quantity, 0);
    check(
      'the trade tape has 11 trades totalling 60 shares (1 earlier + 10 new)',
      tape.data.trades.length === 11 && tapeQuantity === 60,
      `${tape.data.trades.length} trades, ${tapeQuantity} shares`
    );

    check(
      'total cash across all accounts is unchanged (nothing created or lost)',
      (await totalCash()) === cashBefore
    );
    check(
      'total RELIANCE shares across all accounts is unchanged',
      (await totalShares('RELIANCE')) === sharesBefore
    );

    // ------------------------------------------------------------------
    console.log('\nInvariants checked directly in the database...');

    let q = await owner.query(`
      SELECT o.id
        FROM orders o
        LEFT JOIN (
          SELECT order_id, SUM(quantity) AS executed
            FROM (
              SELECT buy_order_id  AS order_id, executed_quantity AS quantity FROM trades
              UNION ALL
              SELECT sell_order_id AS order_id, executed_quantity AS quantity FROM trades
            ) t
           GROUP BY order_id
        ) e ON e.order_id = o.id
       WHERE o.quantity - o.remaining_quantity <> COALESCE(e.executed, 0)`);
    check(
      'every order: executed quantity + remaining quantity = original quantity',
      q.rowCount === 0,
      `${q.rowCount} bad orders`
    );

    q = await owner.query(`
      SELECT a.id
        FROM accounts a
       WHERE a.reserved_balance <> COALESCE((
               SELECT SUM(o.price * o.remaining_quantity)
                 FROM orders o
                WHERE o.account_id = a.id
                  AND o.side = 'buy'
                  AND o.status IN ('open', 'partial')
             ), 0)`);
    check(
      'every account: reserved cash = value of its open buy orders',
      q.rowCount === 0,
      `${q.rowCount} bad accounts`
    );

    q = await owner.query(`
      SELECT h.id
        FROM holdings h
       WHERE h.reserved_quantity <> COALESCE((
               SELECT SUM(o.remaining_quantity)
                 FROM orders o
                WHERE o.account_id = h.account_id
                  AND o.security_id = h.security_id
                  AND o.side = 'sell'
                  AND o.status IN ('open', 'partial')
             ), 0)`);
    check(
      'every holding: reserved shares = size of its open sell orders',
      q.rowCount === 0,
      `${q.rowCount} bad holdings`
    );

    q = await owner.query(`
      SELECT b.id
        FROM orders b
        JOIN orders s
          ON s.security_id = b.security_id
         AND b.side = 'buy'  AND b.status IN ('open', 'partial')
         AND s.side = 'sell' AND s.status IN ('open', 'partial')
         AND b.price >= s.price`);
    check('the order book is never crossed (no bid >= ask)', q.rowCount === 0);
  } finally {
    await owner.end();
    await new Promise((resolve) => server.close(resolve));
    await pool.end();
  }

  console.log(`\nResult: ${passed} passed, ${failed} failed.\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error('Phase 3 smoke test could not run:', error);
  process.exit(1);
});