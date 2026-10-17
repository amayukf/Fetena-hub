import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany();
  console.log('Total users:', users.length);
  users.forEach(u => console.log('User:', u.id, u.email, u.phone, u.fullName, u.role, 'isActive:', u.isActive, 'mustChange:', u.mustChangePassword));
}

main().catch(console.error).finally(() => prisma.$disconnect());
