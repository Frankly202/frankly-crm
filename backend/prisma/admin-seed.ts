/**
 * admin-seed.ts
 *
 * Production-safe admin user provisioning script.
 *
 * This script ONLY creates or updates the initial admin user.
 * It does NOT insert any demo/sample CRM data.
 *
 * Usage:
 *   npm run db:admin-seed
 *
 * Required environment variables (must be explicitly set; defaults are rejected in production):
 *   INITIAL_ADMIN_EMAIL    — email address for the admin user
 *   INITIAL_ADMIN_PASSWORD — strong password (must NOT be a known dev default)
 *
 * Safe to re-run: uses upsert, so existing admin is updated rather than duplicated.
 */
import { PrismaClient, Role } from '@prisma/client';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';

dotenv.config();

const KNOWN_DEFAULT_ADMIN_PASSWORDS = ['ChangeMeInEnv123!', 'FranklyAdmin2026!'];

const adminEmail = process.env['INITIAL_ADMIN_EMAIL'] ?? '';
const adminPassword = process.env['INITIAL_ADMIN_PASSWORD'] ?? '';

// Validate required env vars before connecting to the database
if (!adminEmail) {
  console.error('❌ INITIAL_ADMIN_EMAIL is not set. Aborting admin provisioning.');
  process.exit(1);
}

if (!adminPassword) {
  console.error('❌ INITIAL_ADMIN_PASSWORD is not set. Aborting admin provisioning.');
  process.exit(1);
}

if (KNOWN_DEFAULT_ADMIN_PASSWORDS.includes(adminPassword)) {
  console.error(
    '❌ INITIAL_ADMIN_PASSWORD is a known development default. Use a strong, unique password in production.',
  );
  process.exit(1);
}

if (adminPassword.length < 12) {
  console.error(
    '❌ INITIAL_ADMIN_PASSWORD is too short for production. Minimum 12 characters required.',
  );
  process.exit(1);
}

const prisma = new PrismaClient();

async function main(): Promise<void> {
  console.info('🔐 Provisioning initial admin user...');

  const passwordHash = await bcrypt.hash(adminPassword, 12);

  const adminUser = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {
      role: Role.ADMIN,
      isActive: true,
      passwordHash,
    },
    create: {
      email: adminEmail,
      name: 'Emmanuel Frankly',
      passwordHash,
      role: Role.ADMIN,
      isActive: true,
    },
  });

  console.info(`✅ Admin user provisioned: ${adminUser.email} (id: ${adminUser.id})`);
  console.info('   No demo/sample data was inserted.');
}

main()
  .catch((e) => {
    console.error('❌ Admin seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
