import fs from 'node:fs';
import path from 'node:path';

/**
 * Test environment bootstrap.
 *
 * SAFETY: several suites TRUNCATE tables. They must never run against the
 * developer's or production database. This file:
 *   1. Loads .env / .env.local manually (so we do not depend on Prisma's
 *      implicit dotenv side effect ordering).
 *   2. Forces the connection onto a dedicated *_test database.
 *   3. Refuses to continue if the resolved database does not look like a test
 *      database, so `npm test` fails loudly instead of destroying real data.
 *   4. Provides the SESSION_SECRET and impersonation flag the API requires.
 */

function loadEnvFile(file: string) {
  try {
    const raw = fs.readFileSync(file, 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
      if (!match) continue;
      const key = match[1];
      let value = match[2].trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = value;
    }
  } catch {
    // File missing is fine — CI provides real environment variables.
  }
}

loadEnvFile(path.resolve(process.cwd(), '.env'));
loadEnvFile(path.resolve(process.cwd(), '.env.local'));

function databaseName(url: string): string {
  try {
    return new URL(url).pathname.replace(/^\/+/, '');
  } catch {
    return '';
  }
}

const configuredTestUrl = process.env.TEST_DATABASE_URL;
const derivedTestUrl = process.env.DATABASE_URL
  ? process.env.DATABASE_URL.replace(/(\/[^/?]+)(\?|$)/, (_m, _db, tail) => `/_test${tail}`)
  : undefined;

const testUrl = configuredTestUrl || derivedTestUrl;

if (!testUrl) {
  throw new Error(
    '[tests] No TEST_DATABASE_URL or DATABASE_URL configured. Refusing to run destructive test suites.'
  );
}

const dbName = databaseName(testUrl);
if (!/test/i.test(dbName)) {
  throw new Error(
    `[tests] Refusing to run: target database "${dbName}" does not look like a test database.\n` +
      'Set TEST_DATABASE_URL to a dedicated database whose name contains "test" before running the suite.'
  );
}

// Point every suite at the test database.
process.env.DATABASE_URL = testUrl;
process.env.NODE_ENV = process.env.NODE_ENV && process.env.NODE_ENV !== 'production' ? process.env.NODE_ENV : 'test';

// The API tests exercise role-gated routes by supplying x-actor-id.
process.env.ALLOW_ACTOR_IMPERSONATION = 'true';

// SESSION_SECRET is mandatory for the API module to load.
if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
  process.env.SESSION_SECRET = 'test-only-session-secret-with-at-least-32-chars';
}
