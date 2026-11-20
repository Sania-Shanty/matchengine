import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.js'],
    globalSetup: ['./tests/globalSetup.js'],
    setupFiles: ['./tests/setup.js'],
    // Test files share one test database, so they run one after another.
    fileParallelism: false,
    pool: 'forks',
    testTimeout: 120000,
    hookTimeout: 120000,
  },
});