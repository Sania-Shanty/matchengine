// One door to every helper. Test files do:  const h = require('../helpers');

const testDb = require('./testDb');
const factories = require('./factories');
const invariants = require('./invariants');
const appPool = require('../../src/db/pool');
const orderService = require('../../src/services/order.service');
const orderbookService = require('../../src/services/orderbook.service');

// Closes every database connection so the test process can finish cleanly.
async function closeAll() {
  await appPool.end();
  await testDb.ownerPool.end();
}

module.exports = {
  ...testDb,
  ...factories,
  ...invariants,
  appPool,
  orderService,
  orderbookService,
  closeAll,
};