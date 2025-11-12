import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { nextCookies } from 'better-auth/next-js';
import { db } from '@/server/db/client';
import { betterAuthSchema } from '@/server/db/schema';

const betterAuthSecret = process.env.BETTER_AUTH_SECRET;
if (!betterAuthSecret) {
  throw new Error('BETTER_AUTH_SECRET is not set');
}

export const auth = betterAuth({
  // Providers & cookies integration
  secret: betterAuthSecret,
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
  },
  // Database via Drizzle adapter with explicit schema mapping
  database: drizzleAdapter(db, {
    provider: 'pg',
    usePlural: true,
    schema: betterAuthSchema,
  }),
  // @ts-expect-error - better-auth plugin type incompatibility with exactOptionalPropertyTypes
  plugins: [nextCookies()],
});
