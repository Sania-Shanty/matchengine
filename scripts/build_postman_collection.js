// Builds postman/MatchEngine.postman_collection.json
// Run it with:  npm run postman:build
// Then in Postman: Import -> choose that file.

const fs = require('fs');
const path = require('path');

// ---------- small helpers ----------
function request({ name, method = 'GET', url, body, auth, pre, test, description }) {
  const item = {
    name,
    request: { method, header: [], url: `{{baseUrl}}${url}` },
    event: [],
  };

  if (description) item.request.description = description;

  if (body) {
    item.request.header.push({ key: 'Content-Type', value: 'application/json' });
    item.request.body = {
      mode: 'raw',
      raw: JSON.stringify(body, null, 2),
      options: { raw: { language: 'json' } },
    };
  }

  item.request.auth = auth
    ? { type: 'bearer', bearer: [{ key: 'token', value: `{{${auth}}}`, type: 'string' }] }
    : { type: 'noauth' };

  if (pre) item.event.push({ listen: 'prerequest', script: { type: 'text/javascript', exec: pre } });
  if (test) item.event.push({ listen: 'test', script: { type: 'text/javascript', exec: test } });
  return item;
}

const status = (code) => [
  `pm.test('Status is ${code}', function () { pm.response.to.have.status(${code}); });`,
];
const errorCode = (code) => [
  `pm.test('Error code is ${code}', function () {`,
  `  pm.expect(pm.response.json().error.code).to.eql('${code}');`,
  `});`,
];

const folder = (name, items) => ({ name, item: items });

// ---------- 1. Public ----------
const publicFolder = folder('1. Public (no login needed)', [
  request({
    name: 'Health check',
    url: '/health',
    test: [
      ...status(200),
      `pm.test('Server says ok', function () { pm.expect(pm.response.json().status).to.eql('ok'); });`,
    ],
  }),
  request({
    name: 'List securities',
    url: '/securities',
    test: [
      ...status(200),
      `pm.test('At least 5 securities', function () {`,
      `  pm.expect(pm.response.json().securities.length).to.be.at.least(5);`,
      `});`,
    ],
  }),
  request({
    name: 'One security (TCS)',
    url: '/securities/TCS',
    test: [
      ...status(200),
      `pm.test('Symbol is TCS', function () { pm.expect(pm.response.json().security.symbol).to.eql('TCS'); });`,
    ],
  }),
  request({
    name: 'Order book (ITC)',
    url: '/orderbook/ITC',
    test: [
      ...status(200),
      `pm.test('Has bids and asks lists', function () {`,
      `  const body = pm.response.json();`,
      `  pm.expect(body.bids).to.be.an('array');`,
      `  pm.expect(body.asks).to.be.an('array');`,
      `});`,
    ],
  }),
  request({
    name: 'Recent trades (ITC)',
    url: '/trades/ITC?limit=20',
    test: [
      ...status(200),
      `pm.test('Has a trades list', function () { pm.expect(pm.response.json().trades).to.be.an('array'); });`,
    ],
  }),
]);

// ---------- 2. Auth ----------
const authFolder = folder('2. Register and log in', [
  request({
    name: 'Register a new user',
    method: 'POST',
    url: '/auth/register',
    pre: [`pm.collectionVariables.set('newEmail', 'postman_' + Date.now() + '@example.com');`],
    body: { email: '{{newEmail}}', fullName: 'Postman Tester', password: 'postman12345' },
    test: [
      ...status(201),
      `pm.test('A token is returned', function () {`,
      `  const body = pm.response.json();`,
      `  pm.expect(body.token).to.be.a('string');`,
      `  pm.collectionVariables.set('newToken', body.token);`,
      `});`,
    ],
  }),
  request({
    name: 'Log in as Alice',
    method: 'POST',
    url: '/auth/login',
    body: { email: 'alice@example.com', password: 'password123' },
    test: [
      ...status(200),
      `pm.test('Token saved as aliceToken', function () {`,
      `  const body = pm.response.json();`,
      `  pm.expect(body.token).to.be.a('string');`,
      `  pm.collectionVariables.set('aliceToken', body.token);`,
      `});`,
    ],
  }),
  request({
    name: 'Log in as Bob',
    method: 'POST',
    url: '/auth/login',
    body: { email: 'bob@example.com', password: 'password123' },
    test: [
      ...status(200),
      `pm.test('Token saved as bobToken', function () {`,
      `  const body = pm.response.json();`,
      `  pm.expect(body.token).to.be.a('string');`,
      `  pm.collectionVariables.set('bobToken', body.token);`,
      `});`,
    ],
  }),
  request({
    name: 'Who am I (Alice)',
    url: '/auth/me',
    auth: 'aliceToken',
    test: [
      ...status(200),
      `pm.test('It is Alice', function () {`,
      `  pm.expect(pm.response.json().user.email).to.eql('alice@example.com');`,
      `});`,
    ],
  }),
]);

// ---------- 3. Account ----------
const accountFolder = folder('3. Account (login needed)', [
  request({
    name: 'My balance (Alice)',
    url: '/account',
    auth: 'aliceToken',
    test: [
      ...status(200),
      `pm.test('Money is text with 2 decimals', function () {`,
      `  const account = pm.response.json().account;`,
      `  pm.expect(account.cashBalance).to.match(/^\\d+\\.\\d{2}$/);`,
      `  pm.expect(account.availableBalance).to.match(/^\\d+\\.\\d{2}$/);`,
      `});`,
    ],
  }),
  request({
    name: 'My holdings (Alice)',
    url: '/account/holdings',
    auth: 'aliceToken',
    test: [
      ...status(200),
      `pm.test('Has 5 holdings', function () { pm.expect(pm.response.json().holdings.length).to.eql(5); });`,
    ],
  }),
]);

// ---------- 4. Trading demo ----------
const tradingFolder = folder('4. Trading demo (run "npm run db:reset:demo" first)', [
  request({
    name: 'Alice places BUY 10 ITC @ 100.00',
    method: 'POST',
    url: '/orders',
    auth: 'aliceToken',
    body: { symbol: 'ITC', side: 'buy', price: '100.00', quantity: 10 },
    description: 'No seller exists yet, so this order rests on the book.',
    test: [
      ...status(201),
      `pm.test('Order accepted and saved', function () {`,
      `  const body = pm.response.json();`,
      `  pm.expect(body.order.side).to.eql('buy');`,
      `  pm.collectionVariables.set('aliceOrderId', body.order.id);`,
      `});`,
    ],
  }),
  request({
    name: 'Bob places SELL 6 ITC @ 100.00',
    method: 'POST',
    url: '/orders',
    auth: 'bobToken',
    body: { symbol: 'ITC', side: 'sell', price: '100.00', quantity: 6 },
    description: 'Matches the resting buy. Bob is fully filled.',
    test: [
      ...status(201),
      `pm.test('Bob traded 6 shares in total at 100.00', function () {`,
      `  const body = pm.response.json();`,
      `  const total = body.trades.reduce(function (sum, t) { return sum + t.quantity; }, 0);`,
      `  pm.expect(total).to.eql(6);`,
      `  body.trades.forEach(function (t) { pm.expect(t.price).to.eql('100.00'); });`,
      `  pm.expect(body.order.status).to.eql('filled');`,
      `});`,
    ],
  }),
  request({
    name: 'Order book after the trade (ITC)',
    url: '/orderbook/ITC',
    test: [
      ...status(200),
      `pm.test("Alice's leftover buy is still on the book", function () {`,
      `  pm.expect(pm.response.json().bids.length).to.be.at.least(1);`,
      `});`,
    ],
  }),
  request({
    name: "Alice's order (partly filled)",
    url: '/orders/{{aliceOrderId}}',
    auth: 'aliceToken',
    test: [
      ...status(200),
      `pm.test('Order is open or partial, with a sensible remaining quantity', function () {`,
      `  const order = pm.response.json().order;`,
      `  pm.expect(['open', 'partial']).to.include(order.status);`,
      `  pm.expect(order.remainingQuantity).to.be.within(1, 10);`,
      `});`,
    ],
  }),
  request({
    name: "Alice's order list",
    url: '/orders?symbol=ITC',
    auth: 'aliceToken',
    test: [
      ...status(200),
      `pm.test('Orders list is not empty', function () { pm.expect(pm.response.json().orders.length).to.be.at.least(1); });`,
    ],
  }),
  request({
    name: 'Trade tape (ITC)',
    url: '/trades/ITC?limit=20',
    test: [
      ...status(200),
      `pm.test('At least one trade exists', function () { pm.expect(pm.response.json().trades.length).to.be.at.least(1); });`,
    ],
  }),
  request({
    name: 'Alice tries to SELL into her own buy (self-trade)',
    method: 'POST',
    url: '/orders',
    auth: 'aliceToken',
    body: { symbol: 'ITC', side: 'sell', price: '100.00', quantity: 5 },
    description: 'Refused: the order would trade against Alice\'s own resting buy.',
    test: [...status(409), ...errorCode('SELF_TRADE')],
  }),
]);

// ---------- 5. Error cases ----------
const errorsFolder = folder('5. Error cases (every one should be refused)', [
  request({
    name: 'Place an order without logging in',
    method: 'POST',
    url: '/orders',
    body: { symbol: 'TCS', side: 'buy', price: '100.00', quantity: 1 },
    test: [...status(401), ...errorCode('UNAUTHORIZED')],
  }),
  request({
    name: 'Price with 3 decimal places',
    method: 'POST',
    url: '/orders',
    auth: 'aliceToken',
    body: { symbol: 'TCS', side: 'buy', price: '100.123', quantity: 1 },
    test: [...status(400), ...errorCode('VALIDATION_ERROR')],
  }),
  request({
    name: 'Quantity of zero',
    method: 'POST',
    url: '/orders',
    auth: 'aliceToken',
    body: { symbol: 'TCS', side: 'buy', price: '100.00', quantity: 0 },
    test: [...status(400), ...errorCode('VALIDATION_ERROR')],
  }),
  request({
    name: 'Unknown security',
    method: 'POST',
    url: '/orders',
    auth: 'aliceToken',
    body: { symbol: 'NOPE', side: 'buy', price: '100.00', quantity: 1 },
    test: [...status(404), ...errorCode('NOT_FOUND')],
  }),
  request({
    name: 'Buy far more than the cash available',
    method: 'POST',
    url: '/orders',
    auth: 'aliceToken',
    body: { symbol: 'TCS', side: 'buy', price: '1000000.00', quantity: 1000000 },
    test: [...status(409), ...errorCode('INSUFFICIENT_FUNDS')],
  }),
  request({
    name: 'Sell far more shares than owned',
    method: 'POST',
    url: '/orders',
    auth: 'aliceToken',
    body: { symbol: 'TCS', side: 'sell', price: '100.00', quantity: 100000 },
    test: [...status(409), ...errorCode('INSUFFICIENT_SHARES')],
  }),
  request({
    name: 'Log in with the wrong password',
    method: 'POST',
    url: '/auth/login',
    body: { email: 'alice@example.com', password: 'definitely-wrong' },
    test: [...status(401), ...errorCode('UNAUTHORIZED')],
  }),
  request({
    name: 'Register an email that already exists',
    method: 'POST',
    url: '/auth/register',
    body: { email: 'alice@example.com', fullName: 'Copy Cat', password: 'password123' },
    test: [...status(409), ...errorCode('EMAIL_TAKEN')],
  }),
  request({
    name: 'Register with a too-short password',
    method: 'POST',
    url: '/auth/register',
    body: { email: 'short_password@example.com', fullName: 'Short Pass', password: '123' },
    test: [...status(400), ...errorCode('VALIDATION_ERROR')],
  }),
  request({
    name: "Read someone else's order",
    url: '/orders/{{aliceOrderId}}',
    auth: 'bobToken',
    test: [...status(404), ...errorCode('NOT_FOUND')],
  }),
]);

// ---------- the whole collection ----------
const collection = {
  info: {
    name: 'MatchEngine API',
    description:
      'Demonstration of every MatchEngine endpoint.\n\n' +
      'How to use: start the backend (npm run dev in backend), run "npm run db:reset:demo" ' +
      'for a clean order book, then run this collection with the Collection Runner. ' +
      'Run the folders in order: later requests use tokens and ids saved by earlier ones.',
    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
  },
  item: [publicFolder, authFolder, accountFolder, tradingFolder, errorsFolder],
  variable: [
    { key: 'baseUrl', value: 'http://localhost:4000/api' },
    { key: 'aliceToken', value: '' },
    { key: 'bobToken', value: '' },
    { key: 'newToken', value: '' },
    { key: 'newEmail', value: '' },
    { key: 'aliceOrderId', value: '' },
  ],
};

const target = path.join(__dirname, '..', 'postman', 'MatchEngine.postman_collection.json');
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, JSON.stringify(collection, null, 2));

const requestCount = collection.item.reduce((total, f) => total + f.item.length, 0);
console.log(`Wrote ${requestCount} requests in ${collection.item.length} folders to ${target}`);