import { defineConfig } from 'vitest/config';
import dotenv from 'dotenv';
import path from 'path';

// Load .env.test if DATABASE_URL is not set
if (!process.env['DATABASE_URL']) {
  dotenv.config({ path: path.resolve(__dirname, '.env.test') });
}

// Config-level pre-flight safety check
const dbUrl = (process.env['DATABASE_URL'] || '').toLowerCase();
if (
  dbUrl.includes('supabase.co') ||
  dbUrl.includes('pooler.supabase.com') ||
  dbUrl.includes('sukcdaawcyxlquvtxdsi')
) {
  console.error(
    '\n🛑 [SAFETY ABORT] vitest.config.ts detected production Supabase DATABASE_URL! Refusing to start test runner.\n'
  );
  process.exit(1);
}

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['./tests/setup.ts'],
    env: {
      NODE_ENV: 'test',
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
    },
  },
});
