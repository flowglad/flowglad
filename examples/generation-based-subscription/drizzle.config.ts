import { defineConfig } from 'drizzle-kit';
import dotenv from 'dotenv';

// Prefer .env.local for local development (Next.js convention)
dotenv.config({ path: '.env.local' });

export default defineConfig({
  out: './drizzle',
  schema: './src/server/db/schema.ts',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? '',
  },
});
