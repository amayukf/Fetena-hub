import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  datasources: {
    db: { url: 'postgresql://examvault_user:secret_password@localhost:5432/examvault_test_db?schema=public' },
  },
});

async function main() {
  try {
    const res = await prisma.$executeRawUnsafe(`
      SELECT pg_terminate_backend(pid) 
      FROM pg_stat_activity 
      WHERE pid <> pg_backend_pid() 
        AND datname IN ('examvault_test_db', 'examvault_db');
    `);
    console.log('Terminated lingering connections:', res);
  } catch (err) {
    console.error('Error terminating idle:', err);
  } finally {
    await prisma.$disconnect();
  }
}

main();
