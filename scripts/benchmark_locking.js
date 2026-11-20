// Compares two ways of keeping matching safe under concurrency:
//
//   advisory : one order at a time PER SECURITY (pg_advisory_xact_lock) + row locks
//   row      : row locks only (the design written in the original proposal)
//
// It measures speed AND checks that nothing was corrupted afterwards.
// It uses the TEST database only.
//
// Run from the matchengine folder:   npm run bench
// Optional settings (PowerShell):    $env:BENCH_ORDERS=500; $env:BENCH_ROUNDS=5; npm run bench

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const ORDERS = Number(process.env.BENCH_ORDERS) || 300;
const CONCURRENCY = Number(process.env.BENCH_CONCURRENCY) || 16; // stays below the pool size of 20
const ROUNDS = Number(process.env.BENCH_ROUNDS) || 3;
const TRADERS_PER_SECURITY = 12;

const MODES = ['advisory', 'row'];
const SCENARIOS = {
  single: { label: 'One security: every order contends for the same book', securities: 1 },
  multi: { label: 'Five securities: orders are spread across five books', securities: 5 },
};
const BUSINESS_REFUSALS = ['SELF_TRADE', 'INSUFFICIENT_FUNDS', 'INSUFFICIENT_SHARES'];

// A small seeded random generator: both modes get exactly the same workload.
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

const tag = () => crypto.randomBytes(4).toString('hex').toUpperCase();

// ===========================================================================
// WORKER: runs ONE scenario in ONE lock mode, prints one RESULT line.
// ===========================================================================
async function runWorker(mode, scenarioKey) {
  // Point the backend (which logs in as app_user) at the TEST database.
  const appUrl = new URL(process.env.APP_DATABASE_URL);
  appUrl.pathname = new URL(process.env.TEST_DATABASE_URL).pathname;
  process.env.APP_DATABASE_URL = appUrl.toString();
  process.env.MATCHING_LOCK_MODE = mode;

  const { Pool } = require('pg');
  const orderService = require('../backend/src/services/order.service');
  const appPool = require('../backend/src/db/pool');
  const owner = new Pool({ connectionString: process.env.TEST_DATABASE_URL, max: 4 });

  const scenario = SCENARIOS[scenarioKey];

  try {
    // ---- Build the world: fresh securities and well-funded traders ----
    const securities = [];
    const traders = []; // traders[s] = list of traders for security s
    for (let s = 0; s < scenario.securities; s += 1) {
      const symbol = `B${tag()}${tag()}`;
      const sec = await owner.query(
        'INSERT INTO securities (symbol, name) VALUES ($1, $2) RETURNING id, symbol',
        [symbol, `Benchmark ${symbol}`]
      );
      securities.push(sec.rows[0]);
      traders.push([]);

      for (let t = 0; t < TRADERS_PER_SECURITY; t += 1) {
        const user = await owner.query(
          `INSERT INTO users (email, full_name, password_hash)
           VALUES ($1, 'Bench Trader', 'not-a-real-hash') RETURNING id`,
          [`bench_${tag()}${tag()}@bench.local`]
        );
        const account = await owner.query(
          `INSERT INTO accounts (user_id, cash_balance, reserved_balance)
           VALUES ($1, 10000000.00, 0) RETURNING id`,
          [user.rows[0].id]
        );
        await owner.query(
          `INSERT INTO holdings (account_id, security_id, quantity, reserved_quantity)
           VALUES ($1, $2, 100000, 0)`,
          [account.rows[0].id, sec.rows[0].id]
        );
        traders[s].push({ userId: user.rows[0].id, accountId: account.rows[0].id });
      }
    }

    // ---- Build the workload (identical for both modes) ----
    const random = makeRandom(20260101);
    const jobs = [];
    for (let i = 0; i < ORDERS; i += 1) {
      const s = i % securities.length;
      const trader = traders[s][Math.floor(random() * TRADERS_PER_SECURITY)];
      jobs.push({
        userId: trader.userId,
        symbol: securities[s].symbol,
        side: random() < 0.5 ? 'buy' : 'sell',
        price: `${99 + Math.floor(random() * 3)}.00`,
        quantity: 1 + Math.floor(random() * 10),
      });
    }

    // ---- Run: CONCURRENCY orders in flight at any moment ----
    const latencies = [];
    const errorCodes = {};
    let accepted = 0;
    let businessRefused = 0;
    let otherErrors = 0;
    let next = 0;

    async function lane() {
      for (;;) {
        const index = next;
        next += 1;
        if (index >= jobs.length) return;
        const job = jobs[index];

        const started = process.hrtime.bigint();
        try {
          await orderService.placeOrder(job.userId, {
            symbol: job.symbol,
            side: job.side,
            price: job.price,
            quantity: job.quantity,
          });
          accepted += 1;
        } catch (error) {
          const code = error.code || 'UNKNOWN';
          if (BUSINESS_REFUSALS.includes(code)) {
            businessRefused += 1;
          } else {
            otherErrors += 1;
            errorCodes[code] = (errorCodes[code] || 0) + 1;
          }
        }
        latencies.push(Number(process.hrtime.bigint() - started) / 1e6);
      }
    }

    const wallStart = process.hrtime.bigint();
    await Promise.all(Array.from({ length: CONCURRENCY }, lane));
    const seconds = Number(process.hrtime.bigint() - wallStart) / 1e9;

    // ---- Check correctness afterwards ----
    const securityIds = securities.map((s) => s.id);
    const accountIds = traders.flat().map((t) => t.accountId);

    const crossed = await owner.query(
      `SELECT COUNT(*)::int AS n
         FROM orders b
         JOIN orders s
           ON s.security_id = b.security_id
          AND b.side = 'buy'  AND b.status IN ('open', 'partial')
          AND s.side = 'sell' AND s.status IN ('open', 'partial')
          AND b.price >= s.price
        WHERE b.security_id = ANY($1::bigint[])`,
      [securityIds]
    );

    const conservation = await owner.query(
      `SELECT COUNT(*)::int AS n
         FROM orders o
         LEFT JOIN (
           SELECT order_id, SUM(q)::int AS executed
             FROM (
               SELECT buy_order_id AS order_id, executed_quantity AS q
                 FROM trades WHERE security_id = ANY($1::bigint[])
               UNION ALL
               SELECT sell_order_id, executed_quantity
                 FROM trades WHERE security_id = ANY($1::bigint[])
             ) x
            GROUP BY order_id
         ) e ON e.order_id = o.id
        WHERE o.security_id = ANY($1::bigint[])
          AND o.quantity - o.remaining_quantity <> COALESCE(e.executed, 0)`,
      [securityIds]
    );

    const cashReservations = await owner.query(
      `SELECT COUNT(*)::int AS n
         FROM accounts a
        WHERE a.id = ANY($1::bigint[])
          AND a.reserved_balance <> COALESCE((
                SELECT SUM(o.price * o.remaining_quantity)
                  FROM orders o
                 WHERE o.account_id = a.id AND o.side = 'buy'
                   AND o.status IN ('open', 'partial')), 0)`,
      [accountIds]
    );

    const shareReservations = await owner.query(
      `SELECT COUNT(*)::int AS n
         FROM holdings h
        WHERE h.account_id = ANY($1::bigint[])
          AND h.reserved_quantity <> COALESCE((
                SELECT SUM(o.remaining_quantity)
                  FROM orders o
                 WHERE o.account_id = h.account_id AND o.security_id = h.security_id
                   AND o.side = 'sell' AND o.status IN ('open', 'partial')), 0)`,
      [accountIds]
    );

    const tradeCount = await owner.query(
      'SELECT COUNT(*)::int AS n FROM trades WHERE security_id = ANY($1::bigint[])',
      [securityIds]
    );

    latencies.sort((a, b) => a - b);
    const percentile = (p) =>
      latencies.length === 0
        ? 0
        : latencies[Math.min(latencies.length - 1, Math.floor((p / 100) * latencies.length))];

    const result = {
      mode,
      scenario: scenarioKey,
      orders: jobs.length,
      seconds,
      throughput: jobs.length / seconds,
      p50: percentile(50),
      p95: percentile(95),
      max: latencies.length > 0 ? latencies[latencies.length - 1] : 0,
      accepted,
      businessRefused,
      otherErrors,
      errorCodes,
      trades: tradeCount.rows[0].n,
      crossedBook: crossed.rows[0].n,
      badConservation: conservation.rows[0].n,
      badReservations: cashReservations.rows[0].n + shareReservations.rows[0].n,
    };

    console.log(`RESULT:${JSON.stringify(result)}`);
  } finally {
    await appPool.end();
    await owner.end();
  }
}

// ===========================================================================
// PARENT: resets the test database, runs every worker, prints the tables.
// ===========================================================================
function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}
const sum = (values) => values.reduce((a, b) => a + b, 0);
const fixed = (n, digits = 1) => n.toFixed(digits);

async function runParent() {
  if (!process.env.TEST_DATABASE_URL || !process.env.APP_DATABASE_URL || !process.env.JWT_SECRET) {
    console.error('TEST_DATABASE_URL, APP_DATABASE_URL and JWT_SECRET must be set in your .env file.');
    process.exit(1);
  }

  const { resetTestDb } = require('../database/scripts/reset_test_db');
  console.log('Preparing a clean test database...');
  await resetTestDb();

  console.log(
    `\nBenchmark: ${ORDERS} orders per run, ${CONCURRENCY} in flight at once, ${ROUNDS} rounds per setting.\n`
  );

  const all = {}; // all[scenario][mode] = [results...]
  for (const scenarioKey of Object.keys(SCENARIOS)) {
    all[scenarioKey] = {};
    for (const mode of MODES) all[scenarioKey][mode] = [];
  }

  // Alternate the order of the two modes each round, so neither always goes first.
  for (let round = 1; round <= ROUNDS; round += 1) {
    for (const scenarioKey of Object.keys(SCENARIOS)) {
      const order = round % 2 === 1 ? MODES : [...MODES].reverse();
      for (const mode of order) {
        process.stdout.write(`  round ${round}/${ROUNDS}  ${scenarioKey.padEnd(6)} ${mode.padEnd(8)} ... `);

        const child = spawnSync(process.execPath, [__filename, '--worker', mode, scenarioKey], {
          env: { ...process.env, MATCHING_LOCK_MODE: mode },
          encoding: 'utf8',
          maxBuffer: 20 * 1024 * 1024,
        });

        const line = (child.stdout || '').split('\n').find((l) => l.startsWith('RESULT:'));
        if (child.status !== 0 || !line) {
          console.log('FAILED');
          console.error(child.stderr || child.stdout);
          process.exit(1);
        }

        const result = JSON.parse(line.slice('RESULT:'.length));
        all[scenarioKey][mode].push(result);
        console.log(`${fixed(result.throughput)} orders/sec`);
      }
    }
  }

  // ---- Build the report ----
  const out = [];
  out.push('# Benchmark results');
  out.push('');
  out.push(`Generated: ${new Date().toISOString()}`);
  out.push('');
  out.push(
    `Settings: ${ORDERS} random orders per run (prices 99 to 101, quantities 1 to 10), ` +
      `${CONCURRENCY} orders in flight at once, ${ROUNDS} rounds per setting, ` +
      `${TRADERS_PER_SECURITY} traders per security. Throughput and latency are medians over the rounds. ` +
      'The correctness columns are totals over all rounds.'
  );
  out.push('');

  for (const [scenarioKey, scenario] of Object.entries(SCENARIOS)) {
    out.push(`## ${scenario.label}`);
    out.push('');
    out.push(
      '| Lock mode | Orders/sec | p50 latency (ms) | p95 latency (ms) | Trades per run | ' +
        'Refused (expected) | Unexpected errors | Crossed-book pairs | Broken invariants |'
    );
    out.push('|---|---|---|---|---|---|---|---|---|');

    for (const mode of MODES) {
      const runs = all[scenarioKey][mode];
      const unexpected = sum(runs.map((r) => r.otherErrors));
      const broken = sum(runs.map((r) => r.badConservation + r.badReservations));
      out.push(
        `| ${mode} | ${fixed(median(runs.map((r) => r.throughput)))} | ` +
          `${fixed(median(runs.map((r) => r.p50)))} | ${fixed(median(runs.map((r) => r.p95)))} | ` +
          `${fixed(median(runs.map((r) => r.trades)), 0)} | ` +
          `${sum(runs.map((r) => r.businessRefused))} | ${unexpected} | ` +
          `${sum(runs.map((r) => r.crossedBook))} | ${broken} |`
      );
    }

    const codes = {};
    for (const mode of MODES) {
      for (const r of all[scenarioKey][mode]) {
        for (const [code, n] of Object.entries(r.errorCodes)) {
          codes[`${mode}: ${code}`] = (codes[`${mode}: ${code}`] || 0) + n;
        }
      }
    }
    if (Object.keys(codes).length > 0) {
      out.push('');
      out.push(
        `Unexpected error codes seen: ${Object.entries(codes)
          .map(([k, v]) => `${k} x${v}`)
          .join(', ')}`
      );
    }
    out.push('');
  }

  out.push('## How to read this');
  out.push('');
  out.push('- **Orders/sec** is how many orders were fully processed per second. Higher is faster.');
  out.push('- **Crossed-book pairs** counts live buy orders priced at or above a live sell order. A correct book has 0.');
  out.push('- **Broken invariants** counts orders whose executed + remaining quantity is wrong, and accounts or holdings whose reservation does not match their open orders. It must be 0.');
  out.push('- **Unexpected errors** counts failures other than the three business refusals (self-trade, insufficient funds, insufficient shares), for example deadlocks that survived 3 retries.');
  out.push('');

  const report = out.join('\n');
  const reportPath = path.join(__dirname, '..', 'docs', 'BENCHMARK_RESULTS.md');
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, report);

  console.log(`\n${report}`);
  console.log(`Saved to docs/BENCHMARK_RESULTS.md\n`);
}

// ===========================================================================
const args = process.argv.slice(2);
if (args[0] === '--worker') {
  runWorker(args[1], args[2]).catch((error) => {
    console.error(error);
    process.exit(1);
  });
} else {
  runParent().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}