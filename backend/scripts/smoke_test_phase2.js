// Starts the app on a spare port and tests every Phase 2 endpoint.
// Run it with:  npm run smoke   (from inside the backend folder)
//
// Note: it registers one new user each run (with a random email),
// because the limited app_user is not allowed to delete users.

const app = require('../src/app');
const pool = require('../src/db/pool');

let passed = 0;
let failed = 0;
let baseUrl = '';

async function call(method, path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(baseUrl + path, {
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

async function main() {
  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    console.log('\nHealth and securities...');
    let r = await call('GET', '/api/health');
    check('GET /api/health returns 200 and status ok', r.status === 200 && r.data.status === 'ok');

    r = await call('GET', '/api/securities');
    check(
      'GET /api/securities lists 5 securities',
      r.status === 200 && r.data.securities.length === 5,
      `status ${r.status}`
    );

    r = await call('GET', '/api/securities/tcs');
    check(
      'GET /api/securities/tcs finds TCS (case-insensitive)',
      r.status === 200 && r.data.security.symbol === 'TCS'
    );

    r = await call('GET', '/api/securities/NOPE');
    check('GET /api/securities/NOPE returns 404', r.status === 404);

    console.log('\nLogin...');
    r = await call('POST', '/api/auth/login', {
      email: 'alice@example.com',
      password: 'password123',
    });
    check(
      'alice can log in and receives a token',
      r.status === 200 && typeof r.data.token === 'string',
      `status ${r.status}`
    );
    const aliceToken = r.data && r.data.token;

    r = await call('POST', '/api/auth/login', {
      email: 'alice@example.com',
      password: 'wrong-password',
    });
    check('wrong password returns 401', r.status === 401);

    r = await call('POST', '/api/auth/login', {
      email: 'nobody@example.com',
      password: 'password123',
    });
    check('unknown email returns 401', r.status === 401);

    r = await call('POST', '/api/auth/login', { email: 'alice@example.com' });
    check('login without a password returns 400', r.status === 400);

    console.log('\nProtected routes...');
    r = await call('GET', '/api/account');
    check('GET /api/account without a token returns 401', r.status === 401);

    r = await call('GET', '/api/account', null, 'not-a-real-token');
    check('GET /api/account with a fake token returns 401', r.status === 401);

    r = await call('GET', '/api/auth/me', null, aliceToken);
    check(
      'GET /api/auth/me returns alice',
      r.status === 200 && r.data.user.email === 'alice@example.com'
    );

    r = await call('GET', '/api/account', null, aliceToken);
    const moneyFormat = /^\d+\.\d{2}$/;
    check(
      'GET /api/account returns money as 2-decimal text',
      r.status === 200 &&
        moneyFormat.test(r.data.account.cashBalance) &&
        moneyFormat.test(r.data.account.reservedBalance) &&
        moneyFormat.test(r.data.account.availableBalance),
      JSON.stringify(r.data)
    );

    r = await call('GET', '/api/account/holdings', null, aliceToken);
    check(
      'GET /api/account/holdings returns 5 holdings',
      r.status === 200 && r.data.holdings.length === 5,
      `status ${r.status}`
    );

    console.log('\nRegistration...');
    const email = `smoke_${Date.now()}_${Math.floor(Math.random() * 1e6)}@example.com`;
    r = await call('POST', '/api/auth/register', {
      email,
      fullName: 'Smoke Tester',
      password: 'smoketest123',
    });
    check(
      'a new user can register and receives a token',
      r.status === 201 && typeof r.data.token === 'string',
      `status ${r.status}: ${JSON.stringify(r.data)}`
    );
    const newToken = r.data && r.data.token;

    r = await call('POST', '/api/auth/register', {
      email,
      fullName: 'Smoke Tester',
      password: 'smoketest123',
    });
    check('registering the same email twice returns 409', r.status === 409, `status ${r.status}`);

    r = await call('POST', '/api/auth/register', {
      email: 'short@example.com',
      fullName: 'Short Pass',
      password: '123',
    });
    check('a too-short password returns 400', r.status === 400);

    r = await call('POST', '/api/auth/register', {
      email: 'not-an-email',
      fullName: 'Bad Email',
      password: 'longenough123',
    });
    check('an invalid email returns 400', r.status === 400);

    r = await call('GET', '/api/account', null, newToken);
    check(
      'the new user starts with Rs. 100000.00 cash and nothing reserved',
      r.status === 200 &&
        r.data.account.cashBalance === '100000.00' &&
        r.data.account.reservedBalance === '0.00',
      JSON.stringify(r.data)
    );

    r = await call('GET', '/api/account/holdings', null, newToken);
    check(
      'the new user starts with 100 shares of all 5 securities',
      r.status === 200 &&
        r.data.holdings.length === 5 &&
        r.data.holdings.every((h) => h.quantity === 100 && h.reservedQuantity === 0),
      JSON.stringify(r.data)
    );

    console.log('\nUnknown routes...');
    r = await call('GET', '/api/does-not-exist');
    check('an unknown route returns 404 as JSON', r.status === 404 && r.data && r.data.error);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await pool.end();
  }

  console.log(`\nResult: ${passed} passed, ${failed} failed.\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error('Smoke test could not run:', error);
  process.exit(1);
});