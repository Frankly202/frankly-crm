import dotenv from 'dotenv';
import { z } from 'zod';

// Load environment variables from .env file
dotenv.config();

export const KNOWN_DEFAULT_JWT_SECRET =
  'frankly_super_secure_jwt_secret_key_minimum_32_chars_2026';
export const KNOWN_DEFAULT_ADMIN_PASSWORDS = [
  'ChangeMeInEnv123!',
  'FranklyAdmin2026!',
];

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: z.coerce.number().int().positive().default(4000),
    DATABASE_URL: z.string().url(),
    // Used by Prisma CLI (migrate deploy, introspect) and interactive transactions.
    // In production with a pooled DATABASE_URL (e.g. Supabase Transaction Mode),
    // this must be the direct/non-pooled connection string.
    // Optional in development where DATABASE_URL is already a direct connection.
    DIRECT_URL: z.string().url().optional(),
    CORS_ORIGIN: z.string().default('http://localhost:3000,http://localhost:8080'),
    INITIAL_ADMIN_EMAIL: z.string().email().default('emmanuel@frankedu-global.com'),
    INITIAL_ADMIN_PASSWORD: z.string().min(8).default(KNOWN_DEFAULT_ADMIN_PASSWORDS[0]!),
    JWT_SECRET: z.string().min(32).default(KNOWN_DEFAULT_JWT_SECRET),
    JWT_EXPIRES_IN: z.string().default('15m'),
    REFRESH_TOKEN_EXPIRES_DAYS: z.coerce.number().int().positive().default(7),
    META_VERIFY_TOKEN: z.string().optional(),
    META_APP_SECRET: z.string().optional(),
    RESEND_WEBHOOK_SECRET: z.string().optional(),

    // Provider Mode & Integration Settings
    PROVIDER_MODE: z.enum(['mock', 'live']).default('mock'),
    META_GRAPH_API_VERSION: z
      .string()
      .regex(/^v[0-9]+(\.[0-9]+)?$/)
      .default('v26.0'),
    META_APP_ID: z.string().optional(),
    WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
    WHATSAPP_ACCESS_TOKEN: z.string().optional(),
    INSTAGRAM_PAGE_ID: z.string().optional(),
    INSTAGRAM_ACCESS_TOKEN: z.string().optional(),
    RESEND_API_KEY: z.string().optional(),
    EMAIL_FROM_ADDRESS: z.string().optional(),
    EMAIL_REPLY_TO: z.string().optional(),
    OUTBOUND_EMAIL_RATE_LIMIT_PER_HOUR: z.coerce.number().int().positive().default(30),
  })
  .superRefine((data, ctx) => {
    if (data.NODE_ENV === 'production') {
      if (
        !data.JWT_SECRET ||
        data.JWT_SECRET === KNOWN_DEFAULT_JWT_SECRET ||
        data.JWT_SECRET.length < 32
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['JWT_SECRET'],
          message:
            'JWT_SECRET must be explicitly provided in production and cannot use development default fallback',
        });
      }

      if (
        !data.INITIAL_ADMIN_PASSWORD ||
        KNOWN_DEFAULT_ADMIN_PASSWORDS.includes(data.INITIAL_ADMIN_PASSWORD)
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['INITIAL_ADMIN_PASSWORD'],
          message:
            'INITIAL_ADMIN_PASSWORD must be explicitly provided in production and cannot use development default fallback',
        });
      }

      if (!data.DIRECT_URL) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['DIRECT_URL'],
          message:
            'DIRECT_URL must be explicitly provided in production for Prisma migrations and interactive transactions',
        });
      }
    }
  });

export type Env = z.infer<typeof envSchema>;

export function parseEnv(data: Record<string, unknown> = process.env): Env {
  return envSchema.parse(data);
}

function validateEnv(): Env {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    console.error('❌ Invalid environment variables:');
    for (const issue of parsed.error.issues) {
      console.error(` - ${issue.path.join('.')}: ${issue.message}`);
    }
    process.exit(1);
  }

  return parsed.data;
}

export const env = validateEnv();

