/**
 * seed-reset.ts  — DESTRUCTIVE full wipe + re-seed
 *
 * Refuses to run unless:
 *   1. NODE_ENV is NOT "production"
 *   2. The user types "yes" at the confirmation prompt
 *
 * Run via:  npm run seed:reset
 *
 * NEVER run this against real student data.
 */
import { PrismaClient } from '@prisma/client';
import * as readline from 'readline';

const prisma = new PrismaClient();

function ask(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function main() {
  // ── Guard 1: refuse in production ───────────────────────────────────────────
  if (process.env.NODE_ENV === 'production') {
    console.error('⛔  FATAL: seed:reset cannot run when NODE_ENV=production.');
    console.error('   This command wipes ALL data. It is only for local development.');
    process.exit(1);
  }

  // ── Guard 2: interactive confirmation ───────────────────────────────────────
  console.warn('\n⚠️  WARNING: This will DELETE every row in every table.');
  console.warn(`   Database: ${process.env.DATABASE_URL?.split('@')[1] ?? '(unknown)'}`);
  console.warn('   This is irreversible.\n');

  const answer = await ask('Type "yes" to confirm: ');
  if (answer.toLowerCase() !== 'yes') {
    console.log('Aborted. No changes made.');
    process.exit(0);
  }

  console.log('\n🗑️  Wiping all tables …');
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      "PaperViewLog", "AuditLog", "Notification", "WantedPaper",
      "TermInterest", "PaperRequest", "ContributionFile", "PaperContribution",
      "Entitlement", "Payment", "ExamPaper", "ProgramTermCourse",
      "Course", "ProgramTerm", "Term", "Session",
      "PasswordResetToken", "User", "Program", "Campus", "SystemSetting", "RateLimit"
    CASCADE;
  `);
  console.log('✅ All tables wiped.\n');

  // ── Re-seed reference data ───────────────────────────────────────────────────
  console.log('🌱 Re-seeding reference data …');
  const { execSync } = await import('child_process');
  execSync('npx tsx prisma/seed.ts', { stdio: 'inherit' });
}

main()
  .catch((e) => {
    console.error('❌ seed:reset error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
