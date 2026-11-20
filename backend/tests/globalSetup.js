// Runs ONCE before the whole test run: rebuilds the clean test database.

import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));

export default async function setup() {
  require('dotenv').config({ path: path.join(here, '..', '..', '.env') });

  const { resetTestDb } = require('../../database/scripts/reset_test_db.js');
  console.log('\nRebuilding the test database...');
  await resetTestDb();
  console.log('Test database ready.\n');
}