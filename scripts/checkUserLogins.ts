import { PrismaClient, Role } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany();
  console.log('--- ALL USERS IN DB (' + users.length + ') ---');
  for (const u of users) {
    console.log(`- ${u.email || u.phone} | Role: ${u.role} | Name: ${u.fullName} | mustChangePassword: ${u.mustChangePassword} | isActive: ${u.isActive}`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
