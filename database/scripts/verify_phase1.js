// Proves that the database enforces our rules by trying to break them.
// Every attempt runs inside a transaction that is rolled back,
// so this script never changes your data.

const path = require('path');
const { Client } = require('pg');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

let passed = 0;
let failed = 0;

// Creates throwaway rows: 1 user, 1 account, 1 security, 1 buy order, 1 sell order.
async function createFixtures(client) {
  const user = await client.query(
    `INSERT INTO users (email, full_name, password_hash)
     VALUES ('verify_tmp@example.com', 'Verify Temp', 'x') RETURNING id`
  );
  const account = await client.query(
    `INSERT INTO accounts (user_id, cash_balance) VALUES ($1, 1000.00) RETURNING id`,
    [user.rows[0].id]
  );
  const security = await client.query(
    `INSERT INTO securities (symbol, name) VALUES ('VRFYTMP', 'Verify Temp Security') RETURNING id`
  );
  const accountId = account.rows[0].id;
  const securityId = security.rows[0].id;

  const buy = await client.query(
    `INSERT INTO orders (account_id, security_id, side, price, quantity, remaining_quantity, status)
     VALUES ($1, $2, 'buy', 100.00, 10, 10, 'open') RETURNING id`,
    [accountId, securityId]
  );
  const sell = await client.query(
    `INSERT INTO orders (account_id, security_id, side, price, quantity, remaining_quantity, status)
     VALUES ($1, $2, 'sell', 100.00, 10, 10, 'open') RETURNING id`,
    [accountId, securityId]
  );

  return {
    accountId,
    securityId,
    buyOrderId: buy.rows[0].id,
    sellOrderId: sell.rows[0].id,
  };
}

// Runs "action" inside a transaction and ALWAYS rolls it back afterwards.
async function inRollbackTransaction(action) {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query('BEGIN');
    const fixtures = await createFixtures(client);
    return await action(client, fixtures);
  } finally {
    try {
      await client.query('ROLLBACK');
    } catch (ignored) {
      // nothing to roll back
    }
    await client.end();
  }
}

// The database MUST reject this with the given error code.
async function expectError(name, expectedCode, action) {
  try {
    await inRollbackTransaction(action);
    console.log(`  FAIL  ${name}  (the database accepted it, but it should have refused)`);
    failed += 1;
  } catch (error) {
    if (error.code === expectedCode) {
      console.log(`  PASS  ${name}`);
      passed += 1;
    } else {
      console.log(
        `  FAIL  ${name}  (expected error ${expectedCode}, got ${error.code || 'none'}: ${error.message})`
      );
      failed += 1;
    }
  }
}

// The database MUST accept this.
async function expectSuccess(name, action) {
  try {
    await inRollbackTransaction(action);
    console.log(`  PASS  ${name}`);
    passed += 1;
  } catch (error) {
    console.log(`  FAIL  ${name}  (should have worked: ${error.message})`);
    failed += 1;
  }
}

// Same idea, but connected as the limited app_user (no transaction needed).
async function expectAppUserError(name, expectedCode, sql) {
  const client = new Client({ connectionString: process.env.APP_DATABASE_URL });
  try {
    await client.connect();
    await client.query(sql);
    console.log(`  FAIL  ${name}  (app_user was allowed to do it)`);
    failed += 1;
  } catch (error) {
    if (error.code === expectedCode) {
      console.log(`  PASS  ${name}`);
      passed += 1;
    } else {
      console.log(
        `  FAIL  ${name}  (expected error ${expectedCode}, got ${error.code || 'none'}: ${error.message})`
      );
      failed += 1;
    }
  } finally {
    await client.end().catch(() => {});
  }
}

async function main() {
  if (!process.env.DATABASE_URL || !process.env.APP_DATABASE_URL) {
    console.error('DATABASE_URL and APP_DATABASE_URL must both be set in your .env file.');
    process.exit(1);
  }

  const insertTrade = (client, f, quantity = 5) =>
    client.query(
      `INSERT INTO trades (security_id, buy_order_id, sell_order_id, executed_price, executed_quantity)
       VALUES ($1, $2, $3, 100.00, $4) RETURNING id`,
      [f.securityId, f.buyOrderId, f.sellOrderId, quantity]
    );

  console.log('\nChecking that valid data is accepted...');
  await expectSuccess('a valid order and a valid trade can be inserted', (client, f) =>
    insertTrade(client, f)
  );

  console.log('\nChecking account rules...');
  await expectError('cash balance cannot go negative', '23514', (client, f) =>
    client.query('UPDATE accounts SET cash_balance = -1 WHERE id = $1', [f.accountId])
  );
  await expectError('reserved money cannot exceed cash balance', '23514', (client, f) =>
    client.query('UPDATE accounts SET reserved_balance = 5000 WHERE id = $1', [f.accountId])
  );

  console.log('\nChecking holdings rules...');
  await expectError('holding quantity cannot go negative', '23514', (client, f) =>
    client.query(
      'INSERT INTO holdings (account_id, security_id, quantity) VALUES ($1, $2, -5)',
      [f.accountId, f.securityId]
    )
  );
  await expectError('reserved shares cannot exceed owned shares', '23514', (client, f) =>
    client.query(
      'INSERT INTO holdings (account_id, security_id, quantity, reserved_quantity) VALUES ($1, $2, 10, 11)',
      [f.accountId, f.securityId]
    )
  );
  await expectError('one holding row per account and security', '23505', async (client, f) => {
    const sql =
      'INSERT INTO holdings (account_id, security_id, quantity) VALUES ($1, $2, 10)';
    await client.query(sql, [f.accountId, f.securityId]);
    await client.query(sql, [f.accountId, f.securityId]);
  });

  console.log('\nChecking order rules...');
  const badOrder = (client, f, side, price, quantity, remaining, status) =>
    client.query(
      `INSERT INTO orders (account_id, security_id, side, price, quantity, remaining_quantity, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [f.accountId, f.securityId, side, price, quantity, remaining, status]
    );

  await expectError('order price must be above zero', '23514', (c, f) =>
    badOrder(c, f, 'buy', 0, 10, 10, 'open')
  );
  await expectError('order side must be buy or sell', '23514', (c, f) =>
    badOrder(c, f, 'hold', 100, 10, 10, 'open')
  );
  await expectError('order quantity must be above zero', '23514', (c, f) =>
    badOrder(c, f, 'buy', 100, 0, 0, 'filled')
  );
  await expectError('remaining quantity cannot exceed quantity', '23514', (c, f) =>
    badOrder(c, f, 'buy', 100, 10, 11, 'open')
  );
  await expectError('remaining quantity cannot be negative', '23514', (c, f) =>
    badOrder(c, f, 'buy', 100, 10, -1, 'partial')
  );
  await expectError('a filled order must have 0 remaining', '23514', (c, f) =>
    badOrder(c, f, 'buy', 100, 10, 3, 'filled')
  );
  await expectError('an open order must have its full quantity remaining', '23514', (c, f) =>
    badOrder(c, f, 'buy', 100, 10, 5, 'open')
  );
  await expectError('a partial order must have some (but not all) remaining', '23514', (c, f) =>
    badOrder(c, f, 'buy', 100, 10, 0, 'partial')
  );
  await expectError('an order for a non-existent account is refused', '23503', (client, f) =>
    client.query(
      `INSERT INTO orders (account_id, security_id, side, price, quantity, remaining_quantity, status)
       VALUES (999999999, $1, 'buy', 100, 10, 10, 'open')`,
      [f.securityId]
    )
  );

  console.log('\nChecking trade rules...');
  await expectError('trade quantity must be above zero', '23514', (client, f) =>
    insertTrade(client, f, 0)
  );
  await expectError('a trade cannot match an order with itself', '23514', (client, f) =>
    client.query(
      `INSERT INTO trades (security_id, buy_order_id, sell_order_id, executed_price, executed_quantity)
       VALUES ($1, $2, $2, 100.00, 5)`,
      [f.securityId, f.buyOrderId]
    )
  );

  console.log('\nChecking that trades are append-only (even for the database owner)...');
  await expectError('UPDATE on trades is blocked by the trigger', 'P0001', async (client, f) => {
    const trade = await insertTrade(client, f);
    await client.query('UPDATE trades SET executed_quantity = 9 WHERE id = $1', [
      trade.rows[0].id,
    ]);
  });
  await expectError('DELETE on trades is blocked by the trigger', 'P0001', async (client, f) => {
    const trade = await insertTrade(client, f);
    await client.query('DELETE FROM trades WHERE id = $1', [trade.rows[0].id]);
  });
  await expectError('TRUNCATE on trades is blocked by the trigger', 'P0001', (client) =>
    client.query('TRUNCATE trades')
  );

  console.log('\nChecking the limited app_user role...');
  await expectAppUserError(
    'app_user cannot UPDATE trades (permission denied)',
    '42501',
    'UPDATE trades SET executed_quantity = 1 WHERE id = -1'
  );
  await expectAppUserError(
    'app_user cannot DELETE from trades (permission denied)',
    '42501',
    'DELETE FROM trades WHERE id = -1'
  );
  await expectAppUserError(
    'app_user cannot TRUNCATE trades (permission denied)',
    '42501',
    'TRUNCATE trades'
  );
  await expectAppUserError(
    'app_user cannot DELETE orders (permission denied)',
    '42501',
    'DELETE FROM orders WHERE id = -1'
  );

  console.log(`\nResult: ${passed} passed, ${failed} failed.\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error('Verification could not run:', error.message);
  process.exit(1);
});