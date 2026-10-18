import { defineConfig } from 'vitest/config';

/**
 * Dedicated Vitest configuration.
 *
 * The test suites are Node-only (no JSX/CSS), and several of them TRUNCATE
 * database tables. `tests/setup.ts` therefore runs before every suite to force
 * the connection onto a dedicated *_test database and to refuse to run against
 * what looks like a real database.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['./tests/setup.ts'],
    // Destructive suites share one database, so they must not run in parallel.
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
