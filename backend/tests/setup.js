// Runs before every test file. Its one job: make sure the backend code
// talks to the TEST database, never your demo database.

import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));

require('dotenv').config({ path: path.join(here, '..', '..', '.env') });

const testUrl = process.env.TEST_DATABASE_URL;
const appUrl = process.env.APP_DATABASE_URL;

if (!testUrl || !appUrl) {
  throw new Error('TEST_DATABASE_URL and APP_DATABASE_URL must both be set in your .env file.');
}

const testDbName = new URL(testUrl).pathname.slice(1);
if (!testDbName.includes('test')) {
  throw new Error(`Safety stop: "${testDbName}" does not look like a test database.`);
}

// Keep the limited app_user login, but point it at the test database.
const pointed = new URL(appUrl);
pointed.pathname = new URL(testUrl).pathname;
process.env.APP_DATABASE_URL = pointed.toString();