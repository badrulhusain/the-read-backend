import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcrypt';
import { PrismaClient, Role, UserStatus } from '../src/generated/prisma/client';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is required');
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

async function main() {
  const email = process.env.ADMIN_EMAIL?.toLowerCase().trim();
  const password = process.env.ADMIN_PASSWORD;
  const name = process.env.ADMIN_NAME || 'The Read Admin';

  if (!email || !password) {
    throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD are required');
  }

  const existing = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      status: true,
    },
  });
  if (existing) {
    console.log('Admin already exists:', existing);
  } else {
    const passwordHash = await bcrypt.hash(password, 12);
    const admin = await prisma.user.create({
      data: {
        name,
        email,
        passwordHash,
        role: Role.ADMIN,
        status: UserStatus.ACTIVE,
      },
      select: { id: true, name: true, email: true, role: true, status: true },
    });
    console.log('Admin created:', admin);
  }

  for (const category of [
    { name: 'News', slug: 'news', description: 'Reported and verified news' },
    { name: 'Culture', slug: 'culture', description: 'Books, arts, and ideas' },
    {
      name: 'Analysis',
      slug: 'analysis',
      description: 'Editorial analysis and explainers',
    },
  ])
    await prisma.category.upsert({
      where: { slug: category.slug },
      update: {},
      create: category,
    });

  for (const tag of [
    { name: 'Longform', slug: 'longform' },
    { name: 'Editors Pick', slug: 'editors-pick' },
  ])
    await prisma.tag.upsert({
      where: { slug: tag.slug },
      update: {},
      create: tag,
    });
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
