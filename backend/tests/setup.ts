import dotenv from 'dotenv';
import path from 'path';

/**
 * FAIL-CLOSED TEST DATABASE SAFETY GUARD
 *
 * This module executes before any test suite or Prisma connection is established.
 * It strictly enforces:
 * 1. Test environment variables from .env.test are loaded if not already provided.
 * 2. DATABASE_URL and DIRECT_URL MUST NOT point to Supabase, Render, or any remote/production host.
 * 3. The target database MUST be an isolated test database (must include '_test').
 *
 * If ANY condition is violated, test execution terminates immediately with exit code 1.
 */

// If DATABASE_URL is not already set in process.env, load from .env.test
if (!process.env['DATABASE_URL']) {
  dotenv.config({ path: path.resolve(__dirname, '../.env.test') });
}

export function assertSafeTestDatabase(url: string | undefined, varName: string): void {
  if (!url) {
    const msg = `FATAL_PRODUCTION_SAFETY_ERROR: ${varName} is not set for test execution.`;
    console.error(`\n🛑 ${msg}\n`);
    throw new Error(msg);
  }

  const lower = url.toLowerCase();

  // Rule 1: Prohibit any Supabase hosts or production project references
  const prohibitedHosts = [
    'supabase.co',
    'supabase.com',
    'pooler.supabase.com',
    'sukcdaawcyxlquvtxdsi', // Frankly CRM Supabase Project Ref
    'render.com',
    'onrender.com',
    'aws-0-eu-central-1.pooler.supabase.com',
  ];

  for (const host of prohibitedHosts) {
    if (lower.includes(host)) {
      const msg = `FATAL_PRODUCTION_SAFETY_ERROR: ${varName} points to production/Supabase host "${host}"! Tests are strictly forbidden from running against production databases.`;
      console.error(`\n🛑 [SAFETY ABORT] ${msg}\n`);
      process.exit(1);
    }
  }

  // Rule 2: Require safe test host (localhost or 127.0.0.1)
  const isLocal =
    lower.includes('localhost') ||
    lower.includes('127.0.0.1') ||
    lower.includes('postgres:') ||
    lower.includes('host.docker.internal');

  if (!isLocal) {
    const msg = `FATAL_PRODUCTION_SAFETY_ERROR: ${varName} host is not recognized as a local test instance. Received: ${url}`;
    console.error(`\n🛑 [SAFETY ABORT] ${msg}\n`);
    process.exit(1);
  }

  // Rule 3: Require explicit test database name (must contain '_test')
  if (!lower.includes('_test')) {
    const msg = `FATAL_PRODUCTION_SAFETY_ERROR: ${varName} must point to an isolated test database containing "_test" (e.g. "frankly_crm_test"). Received: ${url}`;
    console.error(`\n🛑 [SAFETY ABORT] ${msg}\n`);
    process.exit(1);
  }
}

// Execute assertions immediately upon module load
assertSafeTestDatabase(process.env['DATABASE_URL'], 'DATABASE_URL');
if (process.env['DIRECT_URL']) {
  assertSafeTestDatabase(process.env['DIRECT_URL'], 'DIRECT_URL');
}

console.info('🛡️  Test database safety guard passed: running against isolated test database.');
