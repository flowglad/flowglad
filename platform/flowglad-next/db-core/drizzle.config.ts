import type { Config } from 'drizzle-kit'

export default {
  schema: './db-core/schema/!(*.test).ts',
  out: './db-core/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  verbose: true,
  strict: true,
  casing: 'camelCase',
} satisfies Config
