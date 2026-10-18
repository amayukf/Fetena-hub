import { PrismaClient } from '@prisma/client';

/**
 * Terminate lingering database connections that block `prisma migrate` /
 * `prisma db push` (e.g. an idle test runner holding the test database open).
 *
 * SAFETY: this previously hard-coded credentials AND terminated connections on
 * every known database, including production, with no confirmation. It now:
 *   - uses DATABASE_URL / TEST_DATABASE_URL from the environment (no secrets in
 *     source),
 *   - targets exactly ONE database,
 *   - refuses to touch a database whose name does not contain "test" unless
 *     ALLOW_TERMINATE_NON_TEST_DATABASE=yes is set explicitly.
 */

const targetUrl = process.env.TERMINATE_DB_URL || process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;

if (!targetUrl) {
  console.error('❌ No database configured. Set TEST_DATABASE_URL (or DATABASE_URL) before running this script.');
  process.exit(1);
}

let databaseName = '';
try {
  databaseName = new URL(targetUrl).pathname.replace(/^\/+/, '');
} catch {
  console.error('❌ Could not parse the configured database URL.');
  process.exit(1);
}

const isTestDatabase = /test/i.test(databaseName);

if (!isTestDatabase && process.env.ALLOW_TERMINATE_NON_TEST_DATABASE !== 'yes') {
  console.error(
    `❌ Refusing to terminate connections on "${databaseName}" because it does not look like a test database.\n` +
      '   Set ALLOW_TERMINATE_NON_TEST_DATABASE=yes if you really intend to do this.'
  );
  process.exit(1);
}

const prisma = new PrismaClient();

async function main() {
  try {
    // Parameterised: only ever touches the single configured database.
    const res = await prisma.$executeRaw`
      SELECT pg_terminate_backend(pid)
      FROM pg_stat_activity
      WHERE pid <> pg_backend_pid()
        AND datname = ${databaseName};
    `;
    console.log(`Terminated lingering connections on "${databaseName}":`, res);
  } catch (err) {
    console.error('Error terminating idle connections:', err);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();
